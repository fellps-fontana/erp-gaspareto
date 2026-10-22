import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Expense, NewExpenseInput, DateKey } from '../../models/expense-model';
import { PaymentMethod } from '../../models/sell-model';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({ providedIn: 'root' })
export class ExpenseService extends FirestoreBaseService {
  /** where(companyId) + orderBy(dueDate desc). */
  getExpenses(): Observable<Expense[]> {
    throw new Error('not implemented');
  }

  /** Todas as escritas lançam se companyId() for nulo. Retorna o id. */
  addExpense(input: NewExpenseInput): Promise<string> {
    throw new Error('not implemented');
  }

  /** Batch atômico de N despesas (ExpenseScheduleService.buildInstallments); retorna os ids. */
  addInstallments(input: NewExpenseInput, count: number): Promise<string[]> {
    throw new Error('not implemented');
  }

  /** runTransaction: a_pagar -> pago; lança se já pago ou inexistente. */
  markAsPaid(id: string, paidDate: DateKey, paymentMethod?: PaymentMethod): Promise<void> {
    throw new Error('not implemented');
  }

  markGoodsReceived(id: string, date: DateKey): Promise<void> {
    throw new Error('not implemented');
  }

  updateExpense(
    id: string,
    patch: Partial<Omit<Expense, 'id' | 'companyId' | 'createdAt' | 'status' | 'paidDate'>>
  ): Promise<void> {
    throw new Error('not implemented');
  }

  deleteExpense(id: string): Promise<void> {
    throw new Error('not implemented');
  }
}
