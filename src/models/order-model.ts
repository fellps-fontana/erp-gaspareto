import { Timestamp } from "@angular/fire/firestore";
import { PaymentMethod } from "./sell-model";

export interface OrderItem {
  idProduct: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  priceAtCost: number; // Importante pro lucro
  soldByWeight?: boolean; // snapshot: true = quantity representa peso em kg
}

export type OrderPaymentStatus = 'previsto' | 'pago' | 'cancelado' | 'estornado';

/** Pagamento ou parcela prevista embutida no pedido (regra-de-negocio.md seção 5.3). */
export interface OrderPayment {
  id: string;
  amount: number;
  method: PaymentMethod;     // nunca MISTO
  installments: number;      // informativo, >= 1; previsto => 1
  dueDate?: Timestamp;       // só parcelas da agenda (Timestamp.fromDate; serverTimestamp não vale dentro de array)
  paidDate?: Timestamp;      // só status 'pago'
  status: OrderPaymentStatus;
}

export interface Order {
  id?: string;
  companyId: string;
  orderNumber: number;     // Sequencial por empresa (#1, #2, ...), pra controle humano — não usar como id.
  customerName: string;
  customerPhone?: string;

  items: OrderItem[];

  // --- VALORES ---
  itemsTotal: number;      // Soma só dos produtos
  shippingCost: number;    // Valor do Frete (Novo!)
  total: number;           // itemsTotal + shippingCost (O que o cliente paga)

  // --- LOGÍSTICA ---
  deliveryType: 'pickup' | 'delivery'; // Retirada ou Entrega
  address?: string;        // Endereço (Só se for delivery)

  // --- STATUS & DATAS ---
  status: 'open' | 'pending' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'finished' | 'canceled';

  createdAt: Timestamp;          // Data do pedido
  scheduledDate?: Timestamp;     // Data agendada (Previsão) — só existe se o usuário marcar

  actualDeliveryDate?: Timestamp;// DATA DE ENTREGA (Preenchida no status 'delivered')
  paymentDate?: Timestamp;       // DATA DE PAGAMENTO (Preenchida quando pagar)
  closingDate?: Timestamp;       // DATA DE FECHAMENTO (Preenchida no status 'finished')

  // --- PAGAMENTO (forma final preenchida na conclusão, junto com paymentDate/closingDate — seção 5.3) ---
  payments?: OrderPayment[]; // Ausente = pedido antigo; saldo é sempre derivado, nunca gravado.
  saleId?: string;           // Sale criada na entrega. Ausente em pedido delivered antes do deploy (regra antiga).
  paymentMethod?: PaymentMethod;
  installments?: number; // Espelha Sale.installments — evita join Histórico -> sales por orderId.

  observations?: string;

  customerId?: string;
  addressLat?: number;
  addressLng?: number;

  vendedorId?: string;   // Opcional — pedido pode ficar sem vendedor (regra-de-negocio.md seção 5.2)
  vendedorName?: string; // Snapshot do nome no momento do vínculo

  recurringOrderId?: string; // Pedido gerado por recorrência (seção 5.4); id do doc = rec_{recurringOrderId}_{yyyyMMdd}
  occurrenceDate?: string;   // 'yyyy-MM-dd' da ocorrência
}