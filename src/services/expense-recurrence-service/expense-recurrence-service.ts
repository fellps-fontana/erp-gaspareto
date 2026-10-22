import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DateKey, ExpenseRecurrencePeriod, ExpenseSeries, NewExpenseInput
} from '../../models/expense-model';
import { FirestoreBaseService } from '../firestore-base.service';

export interface RecurrenceRunResult {
  generated: number;
  seriesProcessed: number;
}

@Injectable({ providedIn: 'root' })
export class ExpenseRecurrenceService extends FirestoreBaseService {
  getSeries(): Observable<ExpenseSeries[]> {
    throw new Error('not implemented');
  }

  /** Cria a série + a 1ª ocorrência (id determinístico) e marca generatedThrough = dueDate. */
  createSeries(
    input: NewExpenseInput, period: ExpenseRecurrencePeriod
  ): Promise<{ seriesId: string; firstExpenseId: string }> {
    throw new Error('not implemented');
  }

  /** active=false + endedAt; ocorrências já geradas ficam. */
  endSeries(seriesId: string): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * Catch-up (D2): por série ativa da empresa, em runTransaction sobre o doc da
   * série: gera TODAS as ocorrências > generatedThrough até endOfMonth(today),
   * grava com id determinístico e avança generatedThrough. Idempotente.
   * Lança se companyId vazio.
   */
  generateDueOccurrences(companyId: string, today: DateKey): Promise<RecurrenceRunResult> {
    throw new Error('not implemented');
  }
}
