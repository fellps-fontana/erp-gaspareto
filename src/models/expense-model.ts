import { Timestamp } from '@angular/fire/firestore';
import { PaymentMethod } from './sell-model';

export type DateKey = string;   // 'YYYY-MM-DD' (date-only, sem fuso)
export type MonthKey = string;  // 'YYYY-MM'
export type ExpenseStatus = 'a_pagar' | 'pago';
export type ExpenseCategoryType = 'custo_producao' | 'despesa_operacional';
export type ExpenseRecurrencePeriod = 'semanal' | 'mensal';
export type ExpenseOrigin = 'manual' | 'parcelamento' | 'recorrencia' | 'migracao';

export interface Expense {
  id?: string;
  companyId: string;
  description: string;
  value: number;
  categoryId: string;
  dueDate: DateKey;
  status: ExpenseStatus;
  paidDate?: DateKey;
  paymentMethod?: PaymentMethod;
  supplier?: string;
  notes?: string;
  goodsReceivedDate?: DateKey;
  origin: ExpenseOrigin;
  seriesId?: string;
  installmentGroupId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  legacyBillId?: string;
  migracaoRevisar?: boolean;
  migracaoMotivo?: string;
  createdAt: Timestamp;
}

export interface ExpenseCategory {
  id?: string;
  companyId: string;
  name: string;
  type: ExpenseCategoryType;
  archived: boolean;
  systemKey?: string;
  createdAt: Timestamp;
}

export interface ExpenseSeriesTemplate {
  description: string;
  value: number;
  categoryId: string;
  supplier?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface ExpenseSeries {
  id?: string;
  companyId: string;
  active: boolean;
  period: ExpenseRecurrencePeriod;
  anchorDate: DateKey;
  generatedThrough?: DateKey;
  template: ExpenseSeriesTemplate;
  legacyPurchaseProductId?: string;
  migracaoRevisar?: boolean;
  createdAt: Timestamp;
  endedAt?: Timestamp;
}

export type NewExpenseInput = Omit<
  Expense,
  'id' | 'companyId' | 'createdAt' | 'status' | 'origin' | 'paidDate'
  | 'seriesId' | 'installmentGroupId' | 'installmentNumber' | 'installmentTotal'
  | 'legacyBillId' | 'migracaoRevisar' | 'migracaoMotivo'
>;
