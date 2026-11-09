import { ExpenseReportService } from './expense-report-service';
import { Expense, ExpenseCategory } from '../../models/expense-model';

// Describe isolado: logica pura, SEM emulador Firestore, SEM TestBed.
// ExpenseReportService e um conjunto de metodos estaticos puros.

const HOJE = '2026-10-22';
const MES = '2026-10';

const CATEGORIAS: ExpenseCategory[] = [
  {
    id: 'cat_aluguel',
    companyId: 'empresa_a',
    name: 'Aluguel',
    type: 'despesa_operacional',
    archived: false,
    createdAt: null as unknown as ExpenseCategory['createdAt'],
  },
  {
    id: 'cat_compra',
    companyId: 'empresa_a',
    name: 'Compra de mercadoria',
    type: 'custo_producao',
    archived: false,
    createdAt: null as unknown as ExpenseCategory['createdAt'],
  },
  {
    id: 'cat_arquivada',
    companyId: 'empresa_a',
    name: 'Marketing antigo',
    type: 'despesa_operacional',
    archived: true,
    createdAt: null as unknown as ExpenseCategory['createdAt'],
  },
];

function despesa(parcial: Partial<Expense>): Expense {
  return {
    companyId: 'empresa_a',
    description: 'Despesa de teste',
    value: 100,
    categoryId: 'cat_aluguel',
    dueDate: '2026-10-15',
    status: 'a_pagar',
    origin: 'manual',
    createdAt: null as unknown as Expense['createdAt'],
    ...parcial,
  };
}

function somaValores(lista: Expense[]): number {
  return lista.reduce((soma, e) => soma + e.value, 0);
}

describe('ExpenseReportService - isOverdue (regra critica de vencida derivada)', () => {
  it('[RED] should be overdue when a_pagar and dueDate is before today', () => {
    expect(ExpenseReportService.isOverdue(despesa({ dueDate: '2026-10-21' }), HOJE)).toBeTrue();
  });

  it('[RED] should NOT be overdue when dueDate is exactly today (limite)', () => {
    expect(ExpenseReportService.isOverdue(despesa({ dueDate: HOJE }), HOJE)).toBeFalse();
  });

  it('[RED] should NOT be overdue when dueDate is in the future', () => {
    expect(ExpenseReportService.isOverdue(despesa({ dueDate: '2026-10-23' }), HOJE)).toBeFalse();
  });

  it('[RED] should NOT be overdue when already paid, even with a past dueDate', () => {
    const paga = despesa({ status: 'pago', dueDate: '2026-09-01', paidDate: '2026-09-01' });
    expect(ExpenseReportService.isOverdue(paga, HOJE)).toBeFalse();
  });
});

describe('ExpenseReportService - groupForMonth (cards e listas do mesmo agrupamento)', () => {
  it('[RED] should put an overdue expense from a previous month in vencidas', () => {
    const atrasada = despesa({ dueDate: '2026-09-15', value: 80 });
    const grupos = ExpenseReportService.groupForMonth([atrasada], MES, HOJE);
    expect(grupos.vencidas).toContain(atrasada);
    expect(grupos.aVencer).not.toContain(atrasada);
  });

  it('[RED] should put an a_pagar expense of the month with dueDate >= today in aVencer', () => {
    const aVencerNoMes = despesa({ dueDate: '2026-10-25', value: 120 });
    const grupos = ExpenseReportService.groupForMonth([aVencerNoMes], MES, HOJE);
    expect(grupos.aVencer).toContain(aVencerNoMes);
    expect(grupos.vencidas).not.toContain(aVencerNoMes);
  });

  it('[RED] should put an a_pagar expense of the month with dueDate before today in vencidas, not aVencer', () => {
    const vencidaDoMes = despesa({ dueDate: '2026-10-10', value: 60 });
    const grupos = ExpenseReportService.groupForMonth([vencidaDoMes], MES, HOJE);
    expect(grupos.vencidas).toContain(vencidaDoMes);
    expect(grupos.aVencer).not.toContain(vencidaDoMes);
  });

  it('[RED] should put a dueDate == today in aVencer, not in vencidas (limite)', () => {
    const venceHoje = despesa({ dueDate: HOJE, value: 40 });
    const grupos = ExpenseReportService.groupForMonth([venceHoje], MES, HOJE);
    expect(grupos.aVencer).toContain(venceHoje);
    expect(grupos.vencidas).not.toContain(venceHoje);
  });

  it('[RED] should leave out an a_pagar expense due in a future month from every group', () => {
    const futura = despesa({ dueDate: '2026-11-05', value: 90 });
    const grupos = ExpenseReportService.groupForMonth([futura], MES, HOJE);
    expect(grupos.vencidas).not.toContain(futura);
    expect(grupos.aVencer).not.toContain(futura);
    expect(grupos.pagas).not.toContain(futura);
  });

  it('[RED] should put a paid expense in pagas by paidDate in the month, regardless of dueDate', () => {
    const paga = despesa({
      status: 'pago',
      dueDate: '2026-09-30',
      paidDate: '2026-10-03',
      value: 50,
    });
    const grupos = ExpenseReportService.groupForMonth([paga], MES, HOJE);
    expect(grupos.pagas).toContain(paga);
    expect(grupos.vencidas).not.toContain(paga);
    expect(grupos.aVencer).not.toContain(paga);
  });

  it('[RED] should include a paid expense whose paidDate is today (limite do mes)', () => {
    const pagaHoje = despesa({ status: 'pago', dueDate: '2026-10-01', paidDate: HOJE, value: 30 });
    expect(ExpenseReportService.groupForMonth([pagaHoje], MES, HOJE).pagas).toContain(pagaHoje);
  });

  it('[RED] should leave out a paid expense whose paidDate is in another month', () => {
    const pagaNoMesAnterior = despesa({
      status: 'pago',
      dueDate: '2026-10-05',
      paidDate: '2026-09-30',
      value: 30,
    });
    expect(ExpenseReportService.groupForMonth([pagaNoMesAnterior], MES, HOJE).pagas).not.toContain(
      pagaNoMesAnterior,
    );
  });

  it('[RED] should make each card total equal the sum of its list (cards e listas nao divergem)', () => {
    const despesas: Expense[] = [
      despesa({ dueDate: '2026-09-15', value: 100 }),
      despesa({ dueDate: '2026-10-10', value: 250.5 }),
      despesa({ dueDate: '2026-10-25', value: 33.25 }),
      despesa({ dueDate: '2026-10-22', value: 10 }),
      despesa({ status: 'pago', dueDate: '2026-10-02', paidDate: '2026-10-02', value: 500 }),
      despesa({ status: 'pago', dueDate: '2026-09-02', paidDate: '2026-10-20', value: 7.5 }),
      despesa({ dueDate: '2026-11-05', value: 999 }),
    ];
    const grupos = ExpenseReportService.groupForMonth(despesas, MES, HOJE);
    expect(grupos.totals.vencidas).toBe(somaValores(grupos.vencidas));
    expect(grupos.totals.aPagarNoMes).toBe(somaValores(grupos.aVencer));
    expect(grupos.totals.pagoNoMes).toBe(somaValores(grupos.pagas));
    expect(grupos.totals.vencidas).toBe(100 + 250.5);
    expect(grupos.totals.aPagarNoMes).toBe(33.25 + 10);
    expect(grupos.totals.pagoNoMes).toBe(500 + 7.5);
  });
});

describe('ExpenseReportService - sumOperacionalPorVencimento (regra de exclusao e janela)', () => {
  const INICIO = '2026-10-01';
  const FIM = '2026-10-31';

  it('[RED] should ignore custo_producao expenses', () => {
    const despesas = [despesa({ categoryId: 'cat_compra', dueDate: '2026-10-10', value: 500 })];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(0);
  });

  it('[RED] should count both pago and a_pagar expenses (independente de status)', () => {
    const despesas = [
      despesa({ dueDate: '2026-10-10', value: 0.1 }),
      despesa({ status: 'pago', dueDate: '2026-10-12', paidDate: '2026-10-12', value: 0.2 }),
    ];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(0.3);
  });

  it('[RED] should include dueDate exactly on start and on end (limites inclusivos)', () => {
    const despesas = [
      despesa({ dueDate: INICIO, value: 10 }),
      despesa({ dueDate: FIM, value: 20 }),
    ];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(30);
  });

  it('[RED] should exclude dueDate one day before start and one day after end', () => {
    const despesas = [
      despesa({ dueDate: '2026-09-30', value: 10 }),
      despesa({ dueDate: '2026-11-01', value: 20 }),
    ];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(0);
  });

  it('[RED] should count an orphan category (categoryId sem cadastro) as operacional', () => {
    const despesas = [despesa({ categoryId: 'cat_inexistente', dueDate: '2026-10-10', value: 75 })];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(75);
  });

  it('[RED] should keep counting an archived operacional category in existing reports', () => {
    const despesas = [despesa({ categoryId: 'cat_arquivada', dueDate: '2026-10-10', value: 45 })];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(45);
  });

  it('[RED] should sum in cents without floating point drift (0.1 + 0.2 = 0.3)', () => {
    const despesas = [
      despesa({ dueDate: '2026-10-10', value: 0.1 }),
      despesa({ dueDate: '2026-10-11', value: 0.2 }),
    ];
    expect(
      ExpenseReportService.sumOperacionalPorVencimento(despesas, CATEGORIAS, INICIO, FIM),
    ).toBe(0.3);
  });
});

describe('ExpenseReportService - sumCustoProducaoPorVencimento (informativo, fora do Resultado)', () => {
  it('[RED] should sum custo_producao in the window regardless of status and ignore operacional', () => {
    const despesas = [
      despesa({ categoryId: 'cat_compra', dueDate: '2026-10-10', value: 200 }),
      despesa({
        categoryId: 'cat_compra',
        status: 'pago',
        dueDate: '2026-10-20',
        paidDate: '2026-10-20',
        value: 50,
      }),
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-10', value: 999 }),
    ];
    expect(
      ExpenseReportService.sumCustoProducaoPorVencimento(
        despesas,
        CATEGORIAS,
        '2026-10-01',
        '2026-10-31',
      ),
    ).toBe(250);
  });
});

describe('ExpenseReportService - breakdownPorCategoria (linhas por categoria)', () => {
  const INICIO = '2026-10-01';
  const FIM = '2026-10-31';

  it('[RED] should order rows by total descending', () => {
    const despesas = [
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-10', value: 100 }),
      despesa({ categoryId: 'cat_arquivada', dueDate: '2026-10-10', value: 300 }),
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-11', value: 50 }),
    ];
    const linhas = ExpenseReportService.breakdownPorCategoria(despesas, CATEGORIAS, INICIO, FIM);
    expect(linhas.map((l) => l.categoryId)).toEqual(['cat_arquivada', 'cat_aluguel']);
    expect(linhas[0].total).toBe(300);
    expect(linhas[1].total).toBe(150);
    expect(linhas[1].count).toBe(2);
  });

  it('[RED] should only include expenses with dueDate in the window', () => {
    const despesas = [
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-09-30', value: 100 }),
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-15', value: 40 }),
    ];
    const linhas = ExpenseReportService.breakdownPorCategoria(despesas, CATEGORIAS, INICIO, FIM);
    expect(linhas.length).toBe(1);
    expect(linhas[0].total).toBe(40);
    expect(linhas[0].count).toBe(1);
  });

  it('[RED] should keep only the requested type when onlyType is informed', () => {
    const despesas = [
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-10', value: 100 }),
      despesa({ categoryId: 'cat_compra', dueDate: '2026-10-10', value: 500 }),
    ];
    const linhas = ExpenseReportService.breakdownPorCategoria(
      despesas,
      CATEGORIAS,
      INICIO,
      FIM,
      'despesa_operacional',
    );
    expect(linhas.map((l) => l.categoryId)).toEqual(['cat_aluguel']);
  });

  it('[RED] should count an orphan category as despesa_operacional in the operacional breakdown', () => {
    const despesas = [despesa({ categoryId: 'cat_inexistente', dueDate: '2026-10-10', value: 75 })];
    const linhas = ExpenseReportService.breakdownPorCategoria(
      despesas,
      CATEGORIAS,
      INICIO,
      FIM,
      'despesa_operacional',
    );
    expect(linhas.length).toBe(1);
    expect(linhas[0].categoryId).toBe('cat_inexistente');
    expect(linhas[0].type).toBe('despesa_operacional');
    expect(linhas[0].total).toBe(75);
  });
});

describe('ExpenseReportService - monthlyTotals (12 buckets por dueDate)', () => {
  it('[RED] should return 12 buckets ending at endMonth, in ascending order', () => {
    const buckets = ExpenseReportService.monthlyTotals([], CATEGORIAS, MES, 12);
    expect(buckets.length).toBe(12);
    expect(buckets[0].monthKey).toBe('2025-11');
    expect(buckets[11].monthKey).toBe('2026-10');
  });

  it('[RED] should return zeros for months without data', () => {
    const buckets = ExpenseReportService.monthlyTotals([], CATEGORIAS, MES, 12);
    expect(
      buckets.every((b) => b.total === 0 && b.operacional === 0 && b.custoProducao === 0),
    ).toBeTrue();
  });

  it('[RED] should split each bucket into operacional and custoProducao, with total = both', () => {
    const despesas = [
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-10-05', value: 100 }),
      despesa({ categoryId: 'cat_compra', dueDate: '2026-10-20', value: 40 }),
    ];
    const bucket = ExpenseReportService.monthlyTotals(despesas, CATEGORIAS, MES, 12)[11];
    expect(bucket.monthKey).toBe('2026-10');
    expect(bucket.operacional).toBe(100);
    expect(bucket.custoProducao).toBe(40);
    expect(bucket.total).toBe(140);
  });

  it('[RED] should place by dueDate, not paidDate', () => {
    const despesas = [
      despesa({
        categoryId: 'cat_aluguel',
        status: 'pago',
        dueDate: '2026-09-10',
        paidDate: '2026-10-10',
        value: 70,
      }),
    ];
    const buckets = ExpenseReportService.monthlyTotals(despesas, CATEGORIAS, MES, 12);
    expect(buckets[10].monthKey).toBe('2026-09');
    expect(buckets[10].operacional).toBe(70);
    expect(buckets[11].operacional).toBe(0);
  });

  it('[RED] should exclude expenses outside the 12-month window (before the first and after the last bucket)', () => {
    const despesas = [
      despesa({ categoryId: 'cat_aluguel', dueDate: '2025-10-31', value: 10 }),
      despesa({ categoryId: 'cat_aluguel', dueDate: '2026-11-01', value: 20 }),
      despesa({ categoryId: 'cat_aluguel', dueDate: '2025-11-01', value: 30 }),
    ];
    const buckets = ExpenseReportService.monthlyTotals(despesas, CATEGORIAS, MES, 12);
    expect(buckets[0].monthKey).toBe('2025-11');
    expect(buckets[0].operacional).toBe(30);
    expect(buckets.reduce((soma, b) => soma + b.total, 0)).toBe(30);
  });
});

describe('ExpenseReportService - calcResultado (Resultado = fat - cmv - operacionais)', () => {
  it('[RED] should compute faturamento - cmv - operacionais', () => {
    expect(ExpenseReportService.calcResultado(1000, 400, 250)).toBe(350);
  });

  it('[RED] should return a negative result when expenses exceed the margin', () => {
    expect(ExpenseReportService.calcResultado(100, 150, 20)).toBe(-70);
  });

  it('[RED] should return zero when everything is zero', () => {
    expect(ExpenseReportService.calcResultado(0, 0, 0)).toBe(0);
  });

  it('[RED] should avoid floating point drift (0.3 - 0.1 - 0.1 = 0.1)', () => {
    expect(ExpenseReportService.calcResultado(0.3, 0.1, 0.1)).toBe(0.1);
  });
});

describe('ExpenseReportService - applyFilters (filtros da lista, combinados em AND)', () => {
  const despesaA = despesa({
    id: 'A',
    categoryId: 'cat_aluguel',
    status: 'a_pagar',
    dueDate: '2026-10-10',
    goodsReceivedDate: '2026-10-01',
    migracaoRevisar: true,
  });
  const despesaB = despesa({
    id: 'B',
    categoryId: 'cat_compra',
    status: 'a_pagar',
    dueDate: '2026-10-12',
  });
  const despesaC = despesa({
    id: 'C',
    categoryId: 'cat_compra',
    status: 'pago',
    dueDate: '2026-10-02',
    paidDate: '2026-10-03',
    goodsReceivedDate: '2026-10-02',
  });
  const despesaD = despesa({
    id: 'D',
    categoryId: 'cat_compra',
    status: 'a_pagar',
    dueDate: '2026-10-20',
    goodsReceivedDate: '2026-10-05',
    migracaoRevisar: false,
  });
  const TODAS = [despesaA, despesaB, despesaC, despesaD];

  function idsDe(lista: Expense[]): string[] {
    return lista.map((e) => e.id as string);
  }

  it('[RED] should keep only the expenses of the given categoryId', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { categoryId: 'cat_compra' });
    expect(idsDe(resultado)).toEqual(['B', 'C', 'D']);
  });

  it('[RED] should treat a null or undefined categoryId as no filter', () => {
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, { categoryId: null }))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, { categoryId: undefined }))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('[RED] should keep only the a_pagar expenses when status is a_pagar', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { status: 'a_pagar' });
    expect(idsDe(resultado)).toEqual(['A', 'B', 'D']);
  });

  it('[RED] should keep only the pago expenses when status is pago', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { status: 'pago' });
    expect(idsDe(resultado)).toEqual(['C']);
  });

  it('[RED] should treat status todos and an absent status as no filter', () => {
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, { status: 'todos' }))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, {}))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('[RED] should keep only a_pagar expenses with goodsReceivedDate when apenasAPagarJaRecebida is true', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { apenasAPagarJaRecebida: true });
    expect(idsDe(resultado)).toEqual(['A', 'D']);
  });

  it('[RED] should exclude a pago expense with goodsReceivedDate from apenasAPagarJaRecebida', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { apenasAPagarJaRecebida: true });
    expect(resultado).not.toContain(despesaC);
  });

  it('[RED] should not filter by apenasAPagarJaRecebida when it is false or absent', () => {
    expect(
      idsDe(ExpenseReportService.applyFilters(TODAS, { apenasAPagarJaRecebida: false })),
    ).toEqual(['A', 'B', 'C', 'D']);
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, {}))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('[RED] should keep only the migracaoRevisar expenses when apenasRevisar is true', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, { apenasRevisar: true });
    expect(idsDe(resultado)).toEqual(['A']);
  });

  it('[RED] should not filter by apenasRevisar when it is false or absent', () => {
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, { apenasRevisar: false }))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, {}))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('[RED] should combine filters with AND (categoryId + status + apenasAPagarJaRecebida)', () => {
    const resultado = ExpenseReportService.applyFilters(TODAS, {
      categoryId: 'cat_compra',
      status: 'a_pagar',
      apenasAPagarJaRecebida: true,
    });
    expect(idsDe(resultado)).toEqual(['D']);
  });

  it('[RED] should return nothing when combined filters have no common expense', () => {
    expect(
      ExpenseReportService.applyFilters(TODAS, {
        categoryId: 'cat_compra',
        apenasRevisar: true,
      }),
    ).toEqual([]);
  });

  it('[RED] should return every expense when the filter object is empty', () => {
    expect(idsDe(ExpenseReportService.applyFilters(TODAS, {}))).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('ExpenseReportService - breakdownPorCategoria (nome da categoria orfa)', () => {
  it('[RED] should name an orphan category "Sem categoria" keeping its categoryId and type despesa_operacional', () => {
    const despesas = [despesa({ categoryId: 'cat_inexistente', dueDate: '2026-10-10', value: 75 })];
    const linhas = ExpenseReportService.breakdownPorCategoria(
      despesas,
      CATEGORIAS,
      '2026-10-01',
      '2026-10-31',
    );
    expect(linhas.length).toBe(1);
    expect(linhas[0].name).toBe('Sem categoria');
    expect(linhas[0].categoryId).toBe('cat_inexistente');
    expect(linhas[0].type).toBe('despesa_operacional');
  });
});
