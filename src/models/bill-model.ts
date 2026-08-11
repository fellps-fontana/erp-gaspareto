import { Timestamp } from "@angular/fire/firestore";

export interface Bill {
  id?: string;
  companyId: string;
  name: string;
  value: number;
  dueDate?: Timestamp;
  status: 'pendente' | 'recebido' | 'pago';
  recurring: boolean;
  recurrencePeriod?: 'semanal' | 'mensal';
  paidAt?: Timestamp;
  receivedAt?: Timestamp;
  createdAt: Timestamp;
  purchaseProductId?: string;
}
