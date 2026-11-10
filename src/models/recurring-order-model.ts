import { Timestamp } from '@angular/fire/firestore';

/** Pedido recorrente (regra-de-negocio.md seção 5.4). Datas de agenda são civis 'yyyy-MM-dd'. */
export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'weekdays';
export type RecurringOrderStatus = 'active' | 'paused' | 'ended';

export interface RecurringOrderItem {
  idProduct: string;
  productName: string;
  quantity: number;        // kg quando soldByWeight
  soldByWeight?: boolean;  // sem preço: o pedido gerado usa o preço atual do produto
}

export interface RecurringOrderIssue {
  date: string;
  code: 'PRODUTO_INDISPONIVEL';
  detail: string;
}

export interface RecurringOrder {
  id?: string;
  companyId: string;
  sourceOrderId?: string;
  status: RecurringOrderStatus;

  // --- AGENDA ---
  frequency: RecurrenceFrequency;
  weekdays?: number[];     // 0..6 (0 = domingo), só em 'weekdays'
  startDate: string;
  endDate?: string;        // inclusivo
  generateFrom: string;    // limite inferior; retomar = hoje

  // --- CURSOR (gravado na mesma transação do pedido gerado) ---
  lastGeneratedDate?: string;
  generatedCount?: number;
  lastIssue?: RecurringOrderIssue;

  // --- MOLDE DO PEDIDO ---
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: RecurringOrderItem[];
  shippingCost: number;
  deliveryType: 'pickup' | 'delivery';
  address?: string;
  addressLat?: number;
  addressLng?: number;
  observations?: string;
  vendedorId?: string;
  vendedorName?: string;

  createdAt: Timestamp;
}
