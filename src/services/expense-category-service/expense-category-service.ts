import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ExpenseCategory, ExpenseCategoryType } from '../../models/expense-model';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService extends FirestoreBaseService {
  /** where(companyId); ordenação por name client-side (sem índice composto). */
  getCategories(): Observable<ExpenseCategory[]> {
    throw new Error('not implemented');
  }

  /** Cria as 12 padrão com ID determinístico se a empresa não tem nenhuma; idempotente. */
  ensureDefaults(): Promise<void> {
    throw new Error('not implemented');
  }

  addCategory(name: string, type: ExpenseCategoryType): Promise<string> {
    throw new Error('not implemented');
  }

  /** Renomeia. O tipo NÃO é alterável (lança se vier no patch). */
  renameCategory(id: string, name: string): Promise<void> {
    throw new Error('not implemented');
  }

  setArchived(id: string, archived: boolean): Promise<void> {
    throw new Error('not implemented');
  }

  /** Lança se houver expense ou série vinculada (só arquivar). */
  deleteCategory(id: string): Promise<void> {
    throw new Error('not implemented');
  }
}
