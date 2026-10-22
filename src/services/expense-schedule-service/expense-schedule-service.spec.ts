import { ExpenseScheduleService } from './expense-schedule-service';

// Describe isolado: logica pura, SEM emulador Firestore, SEM TestBed.
// ExpenseScheduleService e um conjunto de metodos estaticos puros.

// Verifica que a chamada lanca erro REAL da regra (nao o 'not implemented' do esqueleto).
function expectLancaErroDeRegra(fn: () => unknown): void {
  let mensagem: string | null = null;
  try {
    fn();
  } catch (erro) {
    mensagem = (erro as Error).message;
  }
  expect(mensagem).not.toBeNull();
  expect(mensagem).not.toBe('not implemented');
}

function somaCentavos(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + Math.round(valor * 100), 0);
}

describe('ExpenseScheduleService - toDateKey (logica pura, fuso fixo)', () => {
  it('[RED] should return the Sao Paulo date for an instant that is still the previous day there', () => {
    // 2026-03-01 02:30 UTC = 2026-02-28 23:30 em America/Sao_Paulo (UTC-3)
    const instante = new Date('2026-03-01T02:30:00Z');
    expect(ExpenseScheduleService.toDateKey(instante, 'America/Sao_Paulo')).toBe('2026-02-28');
  });

  it('[RED] should return the Sao Paulo date for an instant just after midnight there', () => {
    // 2026-03-01 03:30 UTC = 2026-03-01 00:30 em America/Sao_Paulo
    const instante = new Date('2026-03-01T03:30:00Z');
    expect(ExpenseScheduleService.toDateKey(instante, 'America/Sao_Paulo')).toBe('2026-03-01');
  });

  it('[RED] should default to America/Sao_Paulo when no timezone is informed', () => {
    const instante = new Date('2026-03-01T02:30:00Z');
    expect(ExpenseScheduleService.toDateKey(instante)).toBe('2026-02-28');
  });
});

describe('ExpenseScheduleService - datas (logica pura)', () => {
  it('[RED] should extract the YYYY-MM month key from a date key', () => {
    expect(ExpenseScheduleService.monthKeyOf('2026-03-01')).toBe('2026-03');
  });

  it('[RED] should return the last day of a 31-day month', () => {
    expect(ExpenseScheduleService.endOfMonth('2026-10-10')).toBe('2026-10-31');
  });

  it('[RED] should return 28/02 for a non-leap February', () => {
    expect(ExpenseScheduleService.endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('[RED] should return 29/02 for a leap February', () => {
    expect(ExpenseScheduleService.endOfMonth('2024-02-10')).toBe('2024-02-29');
  });

  it('[RED] should add days crossing the month boundary', () => {
    expect(ExpenseScheduleService.addDays('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('[RED] should add days crossing the year boundary', () => {
    expect(ExpenseScheduleService.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('[RED] should clamp 31/jan + 1 month to 28/fev in a non-leap year', () => {
    expect(ExpenseScheduleService.addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('[RED] should clamp 31/jan + 1 month to 29/fev in a leap year', () => {
    expect(ExpenseScheduleService.addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('[RED] should restore the anchor day after a clamped month (31/jan + 2 = 31/mar)', () => {
    expect(ExpenseScheduleService.addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('[RED] should cross the year boundary when adding months', () => {
    expect(ExpenseScheduleService.addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('ExpenseScheduleService - splitInstallments (regra critica de centavos)', () => {
  it('[RED] should split 100 in 3 as 33.33 / 33.33 / 33.34', () => {
    expect(ExpenseScheduleService.splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('[RED] should keep the exact sum when the total has broken cents (0.10 / 3)', () => {
    const partes = ExpenseScheduleService.splitInstallments(0.1, 3);
    expect(partes.length).toBe(3);
    expect(somaCentavos(partes)).toBe(10);
  });

  it('[RED] should keep the exact sum for 99.99 / 7 with the rest in the last installment', () => {
    const partes = ExpenseScheduleService.splitInstallments(99.99, 7);
    expect(partes).toEqual([14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.31]);
    expect(somaCentavos(partes)).toBe(9999);
  });

  it('[RED] should keep the exact sum for 1000 / 12', () => {
    const partes = ExpenseScheduleService.splitInstallments(1000, 12);
    expect(partes.length).toBe(12);
    expect(somaCentavos(partes)).toBe(100000);
    expect(partes[11]).toBe(83.37);
  });

  it('[RED] should return the whole total for a single installment (N=1)', () => {
    expect(ExpenseScheduleService.splitInstallments(50, 1)).toEqual([50]);
  });

  it('[RED] should accept the maximum of 120 installments and keep the exact sum', () => {
    const partes = ExpenseScheduleService.splitInstallments(100.01, 120);
    expect(partes.length).toBe(120);
    expect(partes.slice(0, 119).every((p) => p === 0.83)).toBeTrue();
    expect(partes[119]).toBe(1.24);
    expect(somaCentavos(partes)).toBe(10001);
  });

  it('[RED] should throw when count is 0', () => {
    expectLancaErroDeRegra(() => ExpenseScheduleService.splitInstallments(100, 0));
  });

  it('[RED] should throw when count is 121', () => {
    expectLancaErroDeRegra(() => ExpenseScheduleService.splitInstallments(100, 121));
  });

  it('[RED] should throw when count is not an integer (1.5)', () => {
    expectLancaErroDeRegra(() => ExpenseScheduleService.splitInstallments(100, 1.5));
  });

  it('[RED] should throw when total is zero', () => {
    expectLancaErroDeRegra(() => ExpenseScheduleService.splitInstallments(0, 3));
  });

  it('[RED] should throw when total is negative', () => {
    expectLancaErroDeRegra(() => ExpenseScheduleService.splitInstallments(-10, 3));
  });
});

describe('ExpenseScheduleService - buildInstallments (vencimentos calculados da 1a data)', () => {
  it('[RED] should build 31/jan -> 28/fev -> 31/mar with exact values', () => {
    expect(ExpenseScheduleService.buildInstallments(100, 3, '2026-01-31')).toEqual([
      { installmentNumber: 1, installmentTotal: 3, value: 33.33, dueDate: '2026-01-31' },
      { installmentNumber: 2, installmentTotal: 3, value: 33.33, dueDate: '2026-02-28' },
      { installmentNumber: 3, installmentTotal: 3, value: 33.34, dueDate: '2026-03-31' },
    ]);
  });

  it('[RED] should cross the year boundary when generating due dates', () => {
    const parcelas = ExpenseScheduleService.buildInstallments(30, 3, '2026-11-15');
    expect(parcelas.map((p) => p.dueDate)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });
});

describe("ExpenseScheduleService - occurrenceDates (recorrencia, janela e marca-d'agua)", () => {
  it('[RED] should generate weekly occurrences every 7 days from the anchor when generatedThrough is null', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-01', 'semanal', null, '2026-01-22'),
    ).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']);
  });

  it('[RED] should generate monthly occurrences computed from the anchor, keeping day 31 when the month allows (Mar 31)', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-31', 'mensal', null, '2026-05-31'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('[RED] should only generate occurrences strictly after generatedThrough', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-01', 'semanal', '2026-01-08', '2026-01-22'),
    ).toEqual(['2026-01-15', '2026-01-22']);
  });

  it('[RED] should continue a clamped monthly series from generatedThrough (Feb 28 -> Mar 31, Apr 30)', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-31', 'mensal', '2026-02-28', '2026-04-30'),
    ).toEqual(['2026-03-31', '2026-04-30']);
  });

  it('[RED] should include an occurrence that falls exactly on upTo at end of month', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-31', 'mensal', null, '2026-02-28'),
    ).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('[RED] should return an empty list when upTo is before the anchor', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-03-01', 'mensal', null, '2026-02-28'),
    ).toEqual([]);
  });

  it('[RED] should return an empty list when generatedThrough already covers upTo', () => {
    expect(
      ExpenseScheduleService.occurrenceDates('2026-01-01', 'semanal', '2026-01-22', '2026-01-22'),
    ).toEqual([]);
  });
});

describe('ExpenseScheduleService - occurrenceId (ID deterministico)', () => {
  it('[RED] should build the id as seriesId_dueDate', () => {
    expect(ExpenseScheduleService.occurrenceId('serie_1', '2026-03-31')).toBe('serie_1_2026-03-31');
  });
});
