import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, updateDoc, serverTimestamp, query, where,
  CollectionReference, DocumentReference, runTransaction, increment
} from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Order } from '../../models/order-model';
import { SaleService } from '../sale-service/sale-service';
import { PaymentMethod, Sale } from '../../models/sell-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root',
})
export class OrderService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private saleService = inject(SaleService);
  private tenantService = inject(TenantService);

  private readonly ORDERS_COLLECTION = 'orders';
  private ordersCollection: CollectionReference;

  constructor() {
    super();
    this.ordersCollection = collection(this.firestore, this.ORDERS_COLLECTION);
  }

  getOrders(): Observable<Order[]> {
    const q = query(this.ordersCollection, where('companyId', '==', this.tenantService.companyId()));
    return this.collectionDataObservable<Order>(q).pipe(
      map(orders => [...orders].sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return dateB - dateA;
      }))
    );
  }

  getPendingOrders(): Observable<Order[]> {
    const activeStatuses = ['open', 'pending', 'preparing', 'ready', 'delivering', 'delivered'];
    const q = query(
      this.ordersCollection,
      where('companyId', '==', this.tenantService.companyId()),
      where('status', 'in', activeStatuses)
    );

    return this.collectionDataObservable<Order>(q).pipe(
      map(orders => [...orders].sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return dateB - dateA;
      })),
      catchError(err => {
        console.error('OrderService: Erro ao buscar pedidos pendentes:', err);
        return of([]);
      })
    );
  }

  getOrdersByCustomer(customerId: string): Observable<Order[]> {
    const q = query(
      this.ordersCollection,
      where('companyId', '==', this.tenantService.companyId()),
      where('customerId', '==', customerId)
    );
    return this.collectionDataObservable<Order>(q).pipe(
      map(orders => [...orders].sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return dateB - dateA;
      })),
      catchError(err => {
        console.error('OrderService: Erro ao buscar pedidos do cliente:', err);
        return of([]);
      })
    );
  }

  /**
   * Cria o pedido com um orderNumber sequencial por empresa (#1, #2, ...).
   * Usa runTransaction pra ler e incrementar o contador (counters/{companyId})
   * atomicamente junto com a criação do pedido — evita dois pedidos criados
   * ao mesmo tempo saírem com o mesmo número (race condition).
   */
  async addOrder(
    order: Omit<Order, 'id' | 'createdAt' | 'companyId' | 'orderNumber'>
  ): Promise<DocumentReference> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível criar pedido sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }

    const newOrderRef = doc(this.ordersCollection);
    const counterRef = doc(this.firestore, `counters/${companyId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const nextNumber: number = counterSnap.exists()
        ? (counterSnap.data()['nextOrderNumber'] as number)
        : 1;

      const newOrder = {
        ...order,
        orderNumber: nextNumber,
        status: 'pending',
        createdAt: serverTimestamp(),
        companyId,
        itemsTotal: Number(order.itemsTotal),
        shippingCost: Number(order.shippingCost || 0),
        total: Number(order.itemsTotal) + Number(order.shippingCost || 0)
      };

      transaction.set(newOrderRef, newOrder);
      transaction.set(counterRef, { nextOrderNumber: nextNumber + 1 }, { merge: true });
    });

    return newOrderRef;
  }

  async updateOrder(orderId: string, orderData: Partial<Order>): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');
    const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
    const data = { ...orderData };
    if (data.items) {
      data.itemsTotal = data.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
      data.total = Number(data.itemsTotal) + Number(data.shippingCost || 0);
    }
    return updateDoc(orderRef, data);
  }

  async markAsDelivered(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists()) throw new Error('Pedido não encontrado.');

      const order = orderSnap.data() as Order;

      if (!order.items || order.items.length === 0) {
        throw new Error('Pedido sem itens — não é possível entregar.');
      }

      const stockUpdates: { ref: any; quantity: number }[] = [];

      for (const item of order.items) {
        const productRef = doc(this.firestore, `products/${item.idProduct}`);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) {
          throw new Error(`Produto "${item.productName}" não encontrado no banco.`);
        }

        const data = productSnap.data();
        const currentStock: number = (data['stock'] as number) ?? 0;

        if (currentStock < item.quantity) {
          throw new Error(
            `⚠️ Estoque insuficiente para "${item.productName}": ` +
            `disponível ${currentStock}, solicitado ${item.quantity}.`
          );
        }

        stockUpdates.push({ ref: productRef, quantity: item.quantity });
      }

      for (const p of stockUpdates) {
        transaction.update(p.ref, { stock: increment(-p.quantity) });
      }

      transaction.update(orderRef, {
        status: 'delivered',
        actualDeliveryDate: serverTimestamp()
      });
    });
  }

  async updateStatus(orderId: string, status: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');
    const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
    return updateDoc(orderRef, { status });
  }

  async finalizeOrder(order: Order, paymentMethod: PaymentMethod, installments: number = 1): Promise<boolean> {
    if (!order.id) throw new Error('Pedido sem ID não pode ser finalizado.');

    // Normalize installments defensively: always Number, minimum 1
    let normalizedInstallments = Number(installments) || 1;
    if (normalizedInstallments < 1) {
      normalizedInstallments = 1;
    }

    try {
      const saleData: Omit<Sale, 'id' | 'companyId'> = {
        items: order.items.map(item => ({
          idProduct: item.idProduct,
          productName: item.productName,
          quantity: Number(item.quantity),
          priceAtSale: Number(item.priceAtSale),
          priceAtCost: Number(item.priceAtCost)
        })),
        total: Number(order.total),
        sale_type: 'order',
        paymentMethod: paymentMethod,
        installments: normalizedInstallments,
        date: serverTimestamp(),
        ...(order.customerId ? { customerId: order.customerId } : {})
      };

      await this.saleService.processSale(saleData, false);

      const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${order.id}`);
      await updateDoc(orderRef, {
        status: 'finished',
        paymentMethod: paymentMethod,
        installments: normalizedInstallments,
        paymentDate: serverTimestamp(),
        closingDate: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error('OrderService: Erro ao finalizar pedido:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists()) throw new Error('Order not found');

      const order = orderSnap.data() as Order;

      if (order.status === 'delivered' && order.items?.length > 0) {
        for (const item of order.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          transaction.update(productRef, { stock: increment(item.quantity) });
        }
      }

      transaction.update(orderRef, { status: 'canceled' });
    });
  }
}
