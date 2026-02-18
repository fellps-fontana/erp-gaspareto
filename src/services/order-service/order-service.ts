import { Injectable } from '@angular/core';
import { 
  Firestore, collection, collectionData, doc, 
  addDoc, updateDoc, serverTimestamp, query, orderBy, where 
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Order } from '../../models/order-model';
import { SaleService } from '../sale-service/sale-service';
import { PaymentMethod } from '../../models/sell-model'; // Importe o Enum do seu modelo de venda

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private ordersCollection;

  constructor(
    private firestore: Firestore,
    private saleService: SaleService // Injetamos o SaleService aqui
  ) {
    this.ordersCollection = collection(this.firestore, 'orders');
  }

  // --- LEITURA ---
  getOrders(): Observable<Order[]> {
    // Ordena pelos mais recentes
    const q = query(this.ordersCollection, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Order[]>;
  }
  
  // Pega só os pendentes (útil pra tela de "Cozinha/Preparo")
  getPendingOrders(): Observable<Order[]> {
    const q = query(
      this.ordersCollection, 
      where('status', '!=', 'finished'), // Traz tudo que não tá finalizado
      orderBy('status', 'asc'),
      orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Order[]>;
  }

  // --- CRIAÇÃO ---
  addOrder(order: Order) {
    // Garante que as datas e status iniciais estejam certos
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

  // 1. Saiu para entrega ou Cliente retirou (Mas ainda não necessariamente pagou)
  markAsDelivered(orderId: string) {
    const orderRef = doc(this.firestore, `orders/${orderId}`);
    return updateDoc(orderRef, {
      status: 'delivered',
      actualDeliveryDate: serverTimestamp() // Marca a hora da entrega real
    });
  }

  // 2. Finalizar: O cliente pagou e o pedido vira VENDA (Dinheiro no bolso)
  async finalizeOrder(order: Order, paymentMethod: PaymentMethod) {
    try {
      // Passo 1: Cria a Venda no SaleService (Abate estoque e entra no financeiro)
      const saleData = {
        items: order.items,
        total: order.total, // Inclui o frete no valor final da venda
        sale_type: 'order', // Identifica que veio de uma encomenda
        paymentMethod: paymentMethod // PIX ou Dinheiro
      };

      await this.saleService.processSale(saleData as any);

      // Passo 2: Atualiza o Pedido para Finalizado
      const orderRef = doc(this.firestore, `orders/${order.id}`);
      await updateDoc(orderRef, {
        status: 'finished',
        paymentDate: serverTimestamp(),
        closingDate: serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Erro ao finalizar pedido:", error);
      throw error;
    }
  }

  // Cancelar (Se o cliente desistir)
  cancelOrder(orderId: string) {
    const orderRef = doc(this.firestore, `orders/${orderId}`);
    return updateDoc(orderRef, {
      status: 'canceled'
    });
  }
}