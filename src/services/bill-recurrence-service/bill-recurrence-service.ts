import { Injectable } from '@angular/core';
import { Bill } from '../../models/bill-model';

export interface RecurrenceCheckResult {
  generated: Bill[];
}

@Injectable({ providedIn: 'root' })
export class BillRecurrenceService {

  /**
   * Verifica as bills recurring=true vinculadas a um purchaseProductId da
   * empresa e, para cada série atrasada, gera só a ocorrência mais recente
   * (catch-up: não recria as ocorrências intermediárias perdidas).
   */
  async checkAndGenerateDueOccurrences(companyId: string): Promise<RecurrenceCheckResult> {
    throw new Error('NotImplementedException');
  }

  /**
   * Regra pura: próxima data de vencimento = última data conhecida + período
   * (âncora + período — preserva o dia do calendário mesmo se o check rodar
   * atrasado; nunca "hoje + período").
   */
  calcularProximaDataVencimento(ultimaData: Date, period: NonNullable<Bill['recurrencePeriod']>): Date {
    throw new Error('NotImplementedException');
  }

  private obterUltimaOcorrenciaPorPurchaseProduct(bills: Bill[]): Map<string, Bill> {
    throw new Error('NotImplementedException');
  }
}
