import { Timestamp } from '@angular/fire/firestore';
import { CivilDate } from '../services/recurring-order-service/recurrence-rules';

export type { CivilDate };
/** Competencia mensal da cobranca: 'yyyy-MM'. */
export type Competence = string;
/** "Vencida" e derivada (a_pagar e hoje > dueDate), nunca persistida — regra-de-negocio.md secao 14. */
export type ChargeStatus = 'a_pagar' | 'pago';

/** subscriptions/{companyId} — so super-admin le/escreve. */
export interface SubscriptionConfig {
  companyId: string;
  amount: number;
  dueDay: number;
  active: boolean;
  contractStart: CivilDate;
  generateFrom: Competence;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** subscriptionCharges/{companyId}_{yyyyMM} — empresa le so as proprias; escrita so super-admin. */
export interface SubscriptionCharge {
  id?: string;
  companyId: string;
  competence: Competence;
  dueDate: CivilDate;
  amount: number;
  status: ChargeStatus;
  paidDate: CivilDate | null;
  paidAmount: number | null;
  createdAt: Timestamp;
}

export type ChargeNoticeKind = 'sem_aviso' | 'vence' | 'em_atraso' | 'pago';

export interface ChargeNotice {
  kind: ChargeNoticeKind;
  /** vence: dias ate o vencimento (0 = hoje); em_atraso: dias de atraso; demais: 0. */
  days: number;
}

export interface SubscriptionConfigInput {
  amount: number;
  dueDay: number;
  active: boolean;
  contractStart: CivilDate;
}
