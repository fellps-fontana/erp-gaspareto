import { Injectable, inject } from '@angular/core';
import { Order } from '../models/order-model';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { ORDERS_SEED } from './data/orders.seed';
import { OrderService } from '../services/order-service/order-service';
import { SaleService } from '../services/sale-service/sale-service';
import { PaymentMethod, Sale } from '../models/sell-model';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class OrderServiceMock {
  private mockDb = MockDatabase.getInstance();
  private saleService = inject(SaleService);

  constructor() {
    if (this.mockDb.orders.getAll().length === 0) {
      this.mockDb.orders.replaceAll(ORDERS_SEED);
    }
  }

  getOrders(): Observable<Order[]> {
    return this.mockDb.orders.asObservable().pipe(
      map(orders =>
        [...orders].sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
          const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
          return dateB - dateA;
        })
      )
    );
  }

  getPendingOrders(): Observable<Order[]> {
    const activeStatuses = ['open', 'pending', 'preparing', 'ready', 'delivering', 'delivered'];
    return this.mockDb.orders.asObservable().pipe(
      map(orders =>
        [...orders]
          .filter(o => activeStatuses.includes(o.status))
          .sort((a, b) => {
            const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
            const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
            return dateB - dateA;
          })
      ),
      catchError(err => {
        console.error('OrderService: Erro ao buscar pedidos pendentes:', err);
        return of([]);
      })
    );
  }

  getOrdersByCustomer(customerId: string): Observable<Order[]> {
    return this.mockDb.orders.asObservable().pipe(
      map(orders =>
        [...orders]
          .filter(o => o.customerId === customerId)
          .sort((a, b) => {
            const dateA = a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
            const dateB = b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
            return dateB - dateA;
          })
      ),
      catchError(err => {
        console.error('OrderService: Erro ao buscar pedidos do cliente:', err);
        return of([]);
      })
    );
  }

  addOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<any> {
    const newId = generateMockId('order');
    const newOrder: Order = {
      id: newId,
      ...order,
      status: 'pending',
      createdAt: Timestamp.now(),
      itemsTotal: Number(order.itemsTotal),
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.itemsTotal) + Number(order.shippingCost || 0)
    };
    this.mockDb.orders.add(newOrder);
    return Promise.resolve({ id: newId });
  }

  async updateOrder(orderId: string, orderData: Partial<Order>): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');
    const data = { ...orderData };
    if (data.items) {
      data.itemsTotal = data.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
      data.total = Number(data.itemsTotal) + Number(data.shippingCost || 0);
    }
    this.mockDb.orders.patch(orderId, data);
  }

  async markAsDelivered(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    const order = this.mockDb.orders.findById(orderId);
    if (!order) throw new Error('Pedido não encontrado.');

    if (!order.items || order.items.length === 0) {
      throw new Error('Pedido sem itens — não é possível entregar.');
    }

    for (const item of order.items) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (!product) {
        throw new Error(`Produto "${item.productName}" não encontrado no banco.`);
      }
      if (product.stock < item.quantity) {
        throw new Error(
          `⚠️ Estoque insuficiente para "${item.productName}": ` +
          `disponível ${product.stock}, solicitado ${item.quantity}.`
        );
      }
    }

    for (const item of order.items) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (product) {
        this.mockDb.products.patch(item.idProduct, {
          stock: product.stock - item.quantity
        });
      }
    }

    this.mockDb.orders.patch(orderId, {
      status: 'delivered',
      actualDeliveryDate: Timestamp.now()
    });
  }

  async updateStatus(orderId: string, status: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');
    this.mockDb.orders.patch(orderId, { status } as any);
  }

  async finalizeOrder(order: Order, paymentMethod: PaymentMethod): Promise<boolean> {
    if (!order.id) throw new Error('Pedido sem ID não pode ser finalizado.');

    const saleData: Sale = {
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
      date: Timestamp.now(),
      ...(order.customerId ? { customerId: order.customerId } : {})
    };

    await this.saleService.processSale(saleData, false);

    this.mockDb.orders.patch(order.id, {
      status: 'finished',
      paymentDate: Timestamp.now(),
      closingDate: Timestamp.now()
    });

    return true;
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    const order = this.mockDb.orders.findById(orderId);
    if (!order) throw new Error('Order not found');

    if (order.status === 'delivered' && order.items?.length > 0) {
      for (const item of order.items) {
        const product = this.mockDb.products.findById(item.idProduct);
        if (product) {
          this.mockDb.products.patch(item.idProduct, {
            stock: product.stock + item.quantity
          });
        }
      }
    }

    this.mockDb.orders.patch(orderId, { status: 'canceled' });
  }
}
