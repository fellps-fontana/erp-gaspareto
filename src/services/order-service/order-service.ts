import { Injectable, inject } from '@angular/core';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import {
  collection, doc, updateDoc, serverTimestamp, query, where,
  CollectionReference, DocumentReference, runTransaction, increment, Transaction
} from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Order, OrderItem, OrderPayment } from '../../models/order-model';
import {
  aplicarAgendaParcelas, aplicarCancelamento, aplicarPagamento, calcularTotalDoPedido,
  FormaFinal, listarPagamentos, ParcelaInput, PagamentoInvalidoError, RegistrarPagamentoInput,
  resolverFormaDeConclusao, validarNovoTotal
} from './order-payment-rules';
import { SaleService } from '../sale-service/sale-service';
import { Sale } from '../../models/sell-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

export interface RegistrarPagamentoResultado { concluido: boolean; saldo: number; }
export interface CancelOrderOptions { estornar: boolean; }

type StatusPedido = Order['status'];
/** Antes da entrega: aceita entrega e edicao do pedido. */
const STATUS_ANTES_DA_ENTREGA: readonly StatusPedido[] = [
  'open', 'pending', 'preparing', 'ready', 'delivering'
];
const STATUS_NAO_CANCELAVEIS: readonly StatusPedido[] = ['finished', 'canceled'];

/** Unico conjunto de campos que a edicao aceita vindos de fora; o resto e ignorado. */
const CAMPOS_EDITAVEIS: readonly (keyof Order)[] = [
  'items', 'shippingCost', 'address', 'addressLat', 'addressLng', 'deliveryType',
  'observations', 'customerName', 'customerPhone', 'customerId',
  'vendedorId', 'vendedorName', 'scheduledDate'
];

function camposEditaveis(orderData: Partial<Order>): Partial<Order> {
  const editaveis: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (orderData[campo] !== undefined) editaveis[campo] = orderData[campo];
  }
  return editaveis as Partial<Order>;
}

/** Data do pagamento pago mais recente (paidDate); sem pago com data, usa o instante informado. */
function dataDoUltimoPagamento(payments: OrderPayment[], agora: Date): Timestamp {
  const datasPagas = payments.flatMap(p => (p.status === 'pago' && p.paidDate ? [p.paidDate] : []));
  if (datasPagas.length === 0) {
    return Timestamp.fromDate(agora);
  }
  return datasPagas.reduce((a, b) => (b.toMillis() >= a.toMillis() ? b : a));
}

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
    const q = query(
      this.ordersCollection,
      where('companyId', '==', this.tenantService.companyId())
    );
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

  /**
   * Edita pedido antes da entrega. Campos fora da whitelist sao ignorados. Com
   * pagamentos lancados e total alterado, o novo total passa por validarNovoTotal
   * na mesma escrita (reajuste das parcelas via opts.parcelas).
   */
  async updateOrder(
    orderId: string,
    orderData: Partial<Order>,
    opts?: { parcelas?: ParcelaInput[] }
  ): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = this.orderRef(orderId);
      const order = await this.lerPedido(transaction, orderRef);

      if (!STATUS_ANTES_DA_ENTREGA.includes(order.status)) {
        throw new PagamentoInvalidoError(
          'PEDIDO_NAO_EDITAVEL', `Pedido com status "${order.status}" nao pode ser editado.`
        );
      }

      const data = this.comTotalRecalculado(order, camposEditaveis(orderData));

      if (order.payments !== undefined && data.total !== undefined) {
        data.payments = validarNovoTotal(
          order, data.total, opts?.parcelas, () => this.gerarIdPagamento()
        );
      }

      transaction.update(orderRef, data);
    });
  }

  /**
   * Entrega o pedido: baixa estoque, cria a Sale e, se o saldo ja zerou,
   * conclui na mesma transacao.
   */
  async markAsDelivered(orderId: string): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = this.orderRef(orderId);
      const order = await this.lerPedido(transaction, orderRef);

      if (!STATUS_ANTES_DA_ENTREGA.includes(order.status)) {
        throw new Error(`Pedido com status "${order.status}" não pode ser entregue.`);
      }
      if (!order.items || order.items.length === 0) {
        throw new Error('Pedido sem itens — não é possível entregar.');
      }

      const baixas = await this.lerBaixasDeEstoque(transaction, order.items);
      for (const baixa of baixas) {
        transaction.update(baixa.ref, { stock: increment(-baixa.quantity) });
      }

      const agora = new Date();
      const saleId = this.criarVendaDoPedido(transaction, order, serverTimestamp());
      const entregue: Order = { ...order, status: 'delivered', saleId };
      const payments = listarPagamentos(order);
      const forma = resolverFormaDeConclusao(entregue, payments);

      const entrega = { status: 'delivered', actualDeliveryDate: serverTimestamp(), saleId };
      if (!forma) {
        transaction.update(orderRef, entrega);
        return;
      }
      this.saleService.setSalePaymentInTransaction(transaction, saleId, forma);
      transaction.update(orderRef, {
        ...entrega,
        ...this.camposDeConclusao(payments, forma, agora)
      });
    });
  }

  async cancelOrder(
    orderId: string,
    opts: CancelOrderOptions = { estornar: false }
  ): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = this.orderRef(orderId);
      const order = await this.lerPedido(transaction, orderRef);

      if (STATUS_NAO_CANCELAVEIS.includes(order.status)) {
        throw new Error(`Pedido com status "${order.status}" não pode ser cancelado.`);
      }

      if (order.status === 'delivered' && order.items?.length > 0) {
        for (const item of order.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          transaction.update(productRef, { stock: increment(item.quantity) });
        }
      }

      if (order.saleId) {
        this.saleService.cancelSaleRecordInTransaction(transaction, order.saleId);
      }

      const payments = aplicarCancelamento(order, opts.estornar);
      transaction.update(orderRef, {
        status: 'canceled',
        ...(order.payments !== undefined ? { payments } : {})
      });
    });
  }

  /**
   * Registra um pagamento (regra-de-negocio.md seção 5.3); conclui o pedido
   * se entregue e saldo 0.
   */
  async registerPayment(
    orderId: string,
    input: RegistrarPagamentoInput
  ): Promise<RegistrarPagamentoResultado> {
    if (!orderId) return Promise.reject('Order ID is required');

    return runTransaction(this.firestore, async (transaction) => {
      const orderRef = this.orderRef(orderId);
      const order = await this.lerPedido(transaction, orderRef);
      const resultado = aplicarPagamento(order, input, () => this.gerarIdPagamento());
      const forma = resolverFormaDeConclusao(order, resultado.payments);

      if (forma) {
        const agora = new Date();
        const saleId = this.saleIdDoPedido(transaction, order, agora);
        this.saleService.setSalePaymentInTransaction(transaction, saleId, forma);
        transaction.update(orderRef, {
          ...this.camposDeConclusao(resultado.payments, forma, agora),
          saleId
        });
      } else {
        transaction.update(orderRef, { payments: resultado.payments });
      }

      return { concluido: forma !== null, saldo: resultado.saldo };
    });
  }

  /** Substitui as parcelas previstas do pedido; a soma tem que fechar com o saldo. */
  async setScheduledInstallments(orderId: string, parcelas: ParcelaInput[]): Promise<void> {
    if (!orderId) return Promise.reject('Order ID is required');

    await runTransaction(this.firestore, async (transaction) => {
      const orderRef = this.orderRef(orderId);
      const order = await this.lerPedido(transaction, orderRef);
      const payments = aplicarAgendaParcelas(order, parcelas, () => this.gerarIdPagamento());
      transaction.update(orderRef, { payments });
    });
  }

  private camposDeConclusao(
    payments: OrderPayment[],
    forma: FormaFinal,
    agora: Date
  ): Record<string, unknown> {
    return {
      status: 'finished',
      payments,
      paymentDate: dataDoUltimoPagamento(payments, agora),
      closingDate: Timestamp.fromDate(agora),
      paymentMethod: forma.paymentMethod,
      installments: forma.installments
    };
  }

  /** Pedido entregue sem saleId = entregue antes do deploy da 5.3: a Sale nasce na conclusao. */
  private saleIdDoPedido(transaction: Transaction, order: Order, agora: Date): string {
    return order.saleId ?? this.criarVendaDoPedido(transaction, order, Timestamp.fromDate(agora));
  }

  private criarVendaDoPedido(transaction: Transaction, order: Order, date: Sale['date']): string {
    const sale: Omit<Sale, 'id' | 'companyId'> = {
      items: order.items,
      total: order.total,
      date,
      sale_type: 'order',
      ...(order.customerId ? { customerId: order.customerId } : {})
    };
    return this.saleService.addSaleInTransaction(transaction, sale, order.companyId).id;
  }

  private async lerBaixasDeEstoque(
    transaction: Transaction, items: OrderItem[]
  ): Promise<{ ref: DocumentReference; quantity: number }[]> {
    const baixas: { ref: DocumentReference; quantity: number }[] = [];
    for (const item of items) {
      const ref = doc(this.firestore, `products/${item.idProduct}`);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error(`Produto "${item.productName}" não encontrado no banco.`);
      }
      const currentStock = (snap.data()['stock'] as number) ?? 0;
      if (currentStock < item.quantity) {
        throw new Error(
          `⚠️ Estoque insuficiente para "${item.productName}": ` +
          `disponível ${currentStock}, solicitado ${item.quantity}.`
        );
      }
      baixas.push({ ref, quantity: item.quantity });
    }
    return baixas;
  }

  /**
   * Recalcula itemsTotal/total quando items ou shippingCost vem na edicao. Quando so
   * o frete vem, usa os itens gravados; quando so os itens vem, usa o frete gravado.
   */
  private comTotalRecalculado(order: Order, editaveis: Partial<Order>): Partial<Order> {
    if (editaveis.items === undefined && editaveis.shippingCost === undefined) {
      return editaveis;
    }
    const { itemsTotal, total } = calcularTotalDoPedido(
      editaveis.items ?? order.items,
      editaveis.shippingCost ?? order.shippingCost
    );
    return { ...editaveis, itemsTotal, total };
  }

  private orderRef(orderId: string): DocumentReference {
    return doc(this.firestore, `${this.ORDERS_COLLECTION}/${orderId}`);
  }

  private async lerPedido(transaction: Transaction, orderRef: DocumentReference): Promise<Order> {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Pedido não encontrado.');
    return orderSnap.data() as Order;
  }

  private gerarIdPagamento(): string {
    return doc(this.ordersCollection).id;
  }
}
