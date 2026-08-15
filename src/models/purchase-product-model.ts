import { Timestamp } from '@angular/fire/firestore';

export interface PurchaseProduct {
  id?: string;
  companyId: string;
  name: string;
  defaultValue: number;
  recurring: boolean;
  recurrencePeriod?: 'weekly' | 'monthly';
  createdAt: Timestamp;
}
