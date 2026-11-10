import {
  DateKey,
  Expense,
  ExpenseCategory,
  ExpenseCategoryType,
  ExpenseStatus,
  MonthKey,
} from '../../models/expense-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';

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

export const SEM_CATEGORIA_LABEL = 'Sem categoria';

const CENTS_PER_UNIT = 100;
const MONTHS_PER_YEAR = 12;
const STATUS_TODOS = 'todos';
const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const STATUS_PAGO: ExpenseStatus = 'pago';
const TIPO_CUSTO_PRODUCAO: ExpenseCategoryType = 'custo_producao';
const TIPO_OPERACIONAL: ExpenseCategoryType = 'despesa_operacional';

type CategoriasPorId = Map<string, ExpenseCategory>;

export class ExpenseReportService {
  /** a_pagar e dueDate < hoje. */
  static isOverdue(e: Expense, today: DateKey): boolean {
    return e.status === STATUS_A_PAGAR && e.dueDate < today;
  }

  /**
   * Unica fonte dos 3 grupos E dos 3 cards (mesmo criterio).
   * vencidas: a_pagar, dueDate < today (qualquer mes).
   * aVencer: a_pagar, dueDate no mes, dueDate >= today.
   * pagas: pago, paidDate no mes.
   */
  static groupForMonth(expenses: Expense[], month: MonthKey, today: DateKey): MonthGroups {
    const vencidas = expenses.filter((e) => ExpenseReportService.isOverdue(e, today));
    const aVencer = expenses.filter((e) => isAVencerNoMes(e, month, today));
    const pagas = expenses.filter((e) => isPagaNoMes(e, month));

    return {
      vencidas,
      aVencer,
      pagas,
      totals: {
        vencidas: fromCents(somaEmCentavos(vencidas)),
        aPagarNoMes: fromCents(somaEmCentavos(aVencer)),
        pagoNoMes: fromCents(somaEmCentavos(pagas)),
      },
    };
  }

  static applyFilters(expenses: Expense[], filters: ExpenseFilters): Expense[] {
    return expenses.filter((e) => atendeFiltros(e, filters));
  }

  /** Soma das despesas OPERACIONAIS com dueDate em [start,end], qualquer status. Retorna em reais; soma interna em centavos. */
  static sumOperacionalPorVencimento(
    expenses: Expense[],
    categories: ExpenseCategory[],
    start: DateKey,
    end: DateKey,
  ): number {
    const indice = indexaCategorias(categories);
    const operacionais = despesasDoTipoNoPeriodo(expenses, indice, TIPO_OPERACIONAL, start, end);
    return fromCents(somaEmCentavos(operacionais));
  }

  /** Soma de custo_producao com dueDate em [start,end] (informativo, ja incluso no CMV). */
  static sumCustoProducaoPorVencimento(
    expenses: Expense[],
    categories: ExpenseCategory[],
    start: DateKey,
    end: DateKey,
  ): number {
    const indice = indexaCategorias(categories);
    const custosProducao = despesasDoTipoNoPeriodo(
      expenses,
      indice,
      TIPO_CUSTO_PRODUCAO,
      start,
      end,
    );
    return fromCents(somaEmCentavos(custosProducao));
  }

  /** Linhas por categoria (dueDate em [start,end]), ordenadas por total desc; opcionalmente so um tipo. */
  static breakdownPorCategoria(
    expenses: Expense[],
    categories: ExpenseCategory[],
    start: DateKey,
    end: DateKey,
    onlyType?: ExpenseCategoryType,
  ): CategoryBreakdownRow[] {
    const indice = indexaCategorias(categories);
    const noPeriodo = expenses.filter((e) => isBetween(e.dueDate, start, end));
    const porCategoria = agrupaPorCategoria(noPeriodo);

    return Array.from(porCategoria, ([categoryId, despesas]) =>
      linhaDaCategoria(categoryId, despesas, indice),
    )
      .filter((linha) => naoInformado(onlyType) || linha.type === onlyType)
      .sort((a, b) => b.total - a.total);
  }

  /** 12 buckets terminando em `endMonth` (inclusive), por dueDate; meses sem dado = zero. */
  static monthlyTotals(
    expenses: Expense[],
    categories: ExpenseCategory[],
    endMonth: MonthKey,
    months: number = MONTHS_PER_YEAR,
  ): MonthlyBucket[] {
    const indice = indexaCategorias(categories);
    return listaMeses(endMonth, months).map((monthKey) => montaBucket(monthKey, expenses, indice));
  }

  /** Resultado = faturamento - cmv - despesasOperacionais (arredondado a centavos). */
  static calcResultado(faturamento: number, cmv: number, despesasOperacionais: number): number {
    return fromCents(toCents(faturamento) - toCents(cmv) - toCents(despesasOperacionais));
  }
}

function toCents(valor: number): number {
  return Math.round(valor * CENTS_PER_UNIT);
}

function fromCents(centavos: number): number {
  return centavos / CENTS_PER_UNIT;
}

function somaEmCentavos(despesas: Expense[]): number {
  return despesas.reduce((soma, e) => soma + toCents(e.value), 0);
}

function isBetween(data: DateKey, inicio: DateKey, fim: DateKey): boolean {
  return data >= inicio && data <= fim;
}

function naoInformado(valor: unknown): valor is null | undefined {
  return valor === undefined || valor === null;
}

function isAVencerNoMes(e: Expense, month: MonthKey, today: DateKey): boolean {
  return (
    e.status === STATUS_A_PAGAR &&
    ExpenseScheduleService.monthKeyOf(e.dueDate) === month &&
    e.dueDate >= today
  );
}

function isPagaNoMes(e: Expense, month: MonthKey): boolean {
  return (
    e.status === STATUS_PAGO &&
    !!e.paidDate &&
    ExpenseScheduleService.monthKeyOf(e.paidDate) === month
  );
}

function atendeFiltros(e: Expense, filtros: ExpenseFilters): boolean {
  return (
    atendeCategoria(e, filtros.categoryId) &&
    atendeStatus(e, filtros.status) &&
    atendeAPagarJaRecebida(e, filtros.apenasAPagarJaRecebida) &&
    atendeRevisar(e, filtros.apenasRevisar)
  );
}

function atendeCategoria(e: Expense, categoryId: string | null | undefined): boolean {
  return naoInformado(categoryId) || e.categoryId === categoryId;
}

function atendeStatus(e: Expense, status: ExpenseStatus | 'todos' | undefined): boolean {
  return naoInformado(status) || status === STATUS_TODOS || e.status === status;
}

function atendeAPagarJaRecebida(e: Expense, ativo: boolean | undefined): boolean {
  return !ativo || (e.status === STATUS_A_PAGAR && !!e.goodsReceivedDate);
}

function atendeRevisar(e: Expense, ativo: boolean | undefined): boolean {
  return !ativo || e.migracaoRevisar === true;
}

function indexaCategorias(categories: ExpenseCategory[]): CategoriasPorId {
  const indice: CategoriasPorId = new Map();
  for (const categoria of categories) {
    if (categoria.id !== undefined) {
      indice.set(categoria.id, categoria);
    }
  }
  return indice;
}

/** Categoria orfa (sem cadastro) conta como operacional (conservador). */
function tipoDaCategoriaId(categoryId: string, indice: CategoriasPorId): ExpenseCategoryType {
  return indice.get(categoryId)?.type ?? TIPO_OPERACIONAL;
}

function despesasDoTipoNoPeriodo(
  expenses: Expense[],
  indice: CategoriasPorId,
  tipo: ExpenseCategoryType,
  inicio: DateKey,
  fim: DateKey,
): Expense[] {
  return expenses.filter(
    (e) => isBetween(e.dueDate, inicio, fim) && tipoDaCategoriaId(e.categoryId, indice) === tipo,
  );
}

function agrupaPorCategoria(expenses: Expense[]): Map<string, Expense[]> {
  const porCategoria = new Map<string, Expense[]>();
  for (const e of expenses) {
    const despesasDaCategoria = porCategoria.get(e.categoryId);
    if (despesasDaCategoria) {
      despesasDaCategoria.push(e);
    } else {
      porCategoria.set(e.categoryId, [e]);
    }
  }
  return porCategoria;
}

function linhaDaCategoria(
  categoryId: string,
  despesas: Expense[],
  indice: CategoriasPorId,
): CategoryBreakdownRow {
  return {
    categoryId,
    name: indice.get(categoryId)?.name ?? SEM_CATEGORIA_LABEL,
    type: tipoDaCategoriaId(categoryId, indice),
    total: fromCents(somaEmCentavos(despesas)),
    count: despesas.length,
  };
}

function montaBucket(
  monthKey: MonthKey,
  expenses: Expense[],
  indice: CategoriasPorId,
): MonthlyBucket {
  const doMes = expenses.filter((e) => ExpenseScheduleService.monthKeyOf(e.dueDate) === monthKey);
  const operacionalCentavos = somaEmCentavos(
    doMes.filter((e) => tipoDaCategoriaId(e.categoryId, indice) === TIPO_OPERACIONAL),
  );
  const custoProducaoCentavos = somaEmCentavos(
    doMes.filter((e) => tipoDaCategoriaId(e.categoryId, indice) === TIPO_CUSTO_PRODUCAO),
  );
  return {
    monthKey,
    total: fromCents(operacionalCentavos + custoProducaoCentavos),
    operacional: fromCents(operacionalCentavos),
    custoProducao: fromCents(custoProducaoCentavos),
  };
}

function listaMeses(endMonth: MonthKey, quantidade: number): MonthKey[] {
  return Array.from({ length: quantidade }, (_, indice) =>
    mesDeslocado(endMonth, indice - quantidade + 1),
  );
}

function mesDeslocado(month: MonthKey, delta: number): MonthKey {
  const primeiroDiaDoMes: DateKey = `${month}-01`;
  return ExpenseScheduleService.monthKeyOf(
    ExpenseScheduleService.addMonthsClamped(primeiroDiaDoMes, delta),
  );
}
