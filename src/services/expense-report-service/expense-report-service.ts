import {
  DateKey, Expense, ExpenseCategory, ExpenseCategoryType, ExpenseStatus, MonthKey
} from '../../models/expense-model';

export interface MonthGroups {
  vencidas: Expense[];
  aVencer: Expense[];
  pagas: Expense[];
  totals: { vencidas: number; aPagarNoMes: number; pagoNoMes: number };
}

export interface CategoryBreakdownRow {
  categoryId: string;
  name: string;
  type: ExpenseCategoryType;
  total: number;
  count: number;
}

export interface MonthlyBucket {
  monthKey: MonthKey;
  total: number;
  operacional: number;
  custoProducao: number;
}

export interface ExpenseFilters {
  categoryId?: string | null;
  status?: ExpenseStatus | 'todos';
  apenasAPagarJaRecebida?: boolean;
  apenasRevisar?: boolean;
}

export class ExpenseReportService {
  /** a_pagar e dueDate < hoje. */
  static isOverdue(e: Expense, today: DateKey): boolean {
    throw new Error('not implemented');
  }

  /**
   * Única fonte dos 3 grupos E dos 3 cards (mesmo critério).
   * vencidas: a_pagar, dueDate < today (qualquer mês).
   * aVencer: a_pagar, dueDate no mês, dueDate >= today.
   * pagas: pago, paidDate no mês.
   */
  static groupForMonth(expenses: Expense[], month: MonthKey, today: DateKey): MonthGroups {
    throw new Error('not implemented');
  }

  static applyFilters(expenses: Expense[], filters: ExpenseFilters): Expense[] {
    throw new Error('not implemented');
  }

  /** Soma (centavos internos) das despesas OPERACIONAIS com dueDate em [start,end], qualquer status. */
  static sumOperacionalPorVencimento(
    expenses: Expense[], categories: ExpenseCategory[], start: DateKey, end: DateKey
  ): number {
    throw new Error('not implemented');
  }

  /** Soma de custo_producao com dueDate em [start,end] (informativo, "já incluso no CMV"). */
  static sumCustoProducaoPorVencimento(
    expenses: Expense[], categories: ExpenseCategory[], start: DateKey, end: DateKey
  ): number {
    throw new Error('not implemented');
  }

  /** Linhas por categoria (dueDate em [start,end]), ordenadas por total desc; opcionalmente só um tipo. */
  static breakdownPorCategoria(
    expenses: Expense[], categories: ExpenseCategory[], start: DateKey, end: DateKey,
    onlyType?: ExpenseCategoryType
  ): CategoryBreakdownRow[] {
    throw new Error('not implemented');
  }

  /** 12 buckets terminando em `endMonth` (inclusive), por dueDate; meses sem dado = zero. */
  static monthlyTotals(
    expenses: Expense[], categories: ExpenseCategory[], endMonth: MonthKey, months: number = 12
  ): MonthlyBucket[] {
    throw new Error('not implemented');
  }

  /** Resultado = faturamento − cmv − despesasOperacionais (arredondado a centavos). */
  static calcResultado(faturamento: number, cmv: number, despesasOperacionais: number): number {
    throw new Error('not implemented');
  }
}
