import { Injectable, inject, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, serverTimestamp, query, orderBy,
  CollectionReference, DocumentReference, onSnapshot, getDoc
} from 'firebase/firestore';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Order } from '../../models/order-model';
import { SaleService } from '../sale-service/sale-service';
import { PaymentMethod, Sale } from '../../models/sell-model';
import { ProductService } from '../product-service/product-service';

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private firestore = inject(Firestore);
  private saleService = inject(SaleService);
  private productService = inject(ProductService);
  private ngZone = inject(NgZone);

  private readonly ORDERS_COLLECTION = 'orders';
  private ordersCollection: CollectionReference;

  constructor() {
    this.ordersCollection = collection(this.firestore, this.ORDERS_COLLECTION);
  }

  // --- LEITURA (COM NATIVE SDK PARA EVITAR ERROS DE INJECTION CONTEXT) ---

  /**
   * Helper privado para criar Observable a partir de query do Firestore
   * Garante execução no NgZone e evita erros de 'Injection Context' do angular/fire
   */
  private collectionDataObservable<T>(queryFn: any): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      console.log('OrderService: Iniciando listener do Firestore...');
      const unsubscribe = onSnapshot(queryFn,
        (snapshot: any) => {
          console.log(`OrderService: Snapshot recebido. Docs: ${snapshot.docs.length}`);
          const data = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
          }));
          console.log('OrderService: Dados processados:', data);
          this.ngZone.run(() => observer.next(data));
        },
        (error: any) => {
          console.error("OrderService: Erro no Firestore:", error);
          this.ngZone.run(() => observer.error(error));
        }
      );
      return () => {
        console.log('OrderService: Unsubscribing...');
        unsubscribe();
      };
    });
  }

  /**
   * Retorna todos os pedidos ordenados por data de criação (decrescente).
   */
  getOrders(): Observable<Order[]> {
    const q = query(this.ordersCollection, orderBy('createdAt', 'desc'));
    return this.collectionDataObservable<Order>(q);
  }

  /**
   * Retorna apenas pedidos pendentes (não finalizados nem cancelados).
   * Filtragem feita no CLIENTE para evitar necessidade de Index Composto.
   */
  getPendingOrders(): Observable<Order[]> {
    const activeStatuses = ['pending', 'delivered'];

    // 1. Busca tudo ordenado por data (Index padrão cobre isso)
    const q = query(
      this.ordersCollection,
      orderBy('createdAt', 'desc')
    );

    // 2. Filtra no cliente
    return this.collectionDataObservable<Order>(q).pipe(
      map(orders => orders.filter(o => activeStatuses.includes(o.status)))
    );
  }

  // --- CRIAÇÃO ---

  /**
   * Cria um novo pedido.
   * @param order Dados do pedido sem ID.
   */
  addOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<DocumentReference> {
    const newOrder = {
      ...order,
      status: 'pending',
      createdAt: serverTimestamp(),
      itemsTotal: Number(order.itemsTotal),
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.itemsTotal) + Number(order.shippingCost || 0)
    };

    return addDoc(this.ordersCollection, newOrder);
  }

  // --- ATUALIZAÇÃO DE STATUS ---

  /**
   * Marca um pedido como entregue.
   * @param orderId ID do pedido.
   */
  async markAsDelivered(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }

    const order = orderSnap.data() as Order;

    // Baixa do estoque
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        // Não esperamos o await dentro do loop para ser mais rápido, 
        // mas idealmente deveria ser transactional. 
        // Como o Firestore não suporta transaction facilmente aqui sem mudar tudo, vamos de await sequencial ou Promise.all
        this.productService.decreaseStock(item.idProduct, item.quantity);
      }
    }

    return updateDoc(orderRef, {
      status: 'delivered',
      actualDeliveryDate: serverTimestamp()
    });
  }

  // --- FINALIZAR (PAGAMENTO) ---

  /**
   * Finaliza um pedido, gerando a venda correspondente e baixando estoque.
   * @param order O pedido completo.
   * @param paymentMethod Método de pagamento escolhido.
   */
  async finalizeOrder(order: Order, paymentMethod: PaymentMethod): Promise<boolean> {
    if (!order.id) {
      throw new Error('Pedido sem ID não pode ser finalizado.');
    }

    try {
      // 1. Prepara dados da Venda com tipagem correta
      const saleData: Sale = {
        items: order.items.map(item => ({
          idProduct: item.idProduct,
          productName: item.productName,
          // Garante que números sejam números
          quantity: Number(item.quantity),
          priceAtSale: Number(item.priceAtSale),
          priceAtCost: Number(item.priceAtCost)
        })),
        total: Number(order.total),
        sale_type: 'order', // Identifica que veio de um pedido
        paymentMethod: paymentMethod,
        date: serverTimestamp() // O SaleService pode sobrescrever, mas garantimos aqui
      };

      // 2. Processa a Venda (Isso já baixa o estoque via SaleService) -> AGORA COM FLAG FALSE
      await this.saleService.processSale(saleData, false);

      // 3. Atualiza o Pedido para 'finished'
      const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${order.id}`);
      await updateDoc(orderRef, {
        status: 'finished',
        paymentDate: serverTimestamp(),
        closingDate: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error("Erro ao finalizar pedido no OrderService:", error);
      // Repassa o erro para ser tratado no componente (ex: mostrar toast)
      throw error;
    }
  }

  // --- CANCELAMENTO ---

  /**
   * Cancela um pedido.
   * @param orderId ID do pedido.
   */
  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    const orderRef = doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }

    const order = orderSnap.data() as Order;

    // Se já foi entregue, devolve ao estoque
    if (order.status === 'delivered') {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          this.productService.increaseStock(item.idProduct, item.quantity);
        }
      }
    }

    return updateDoc(orderRef, {
      status: 'canceled'
    });
  }
}