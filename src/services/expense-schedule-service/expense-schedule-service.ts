import type { DateKey, ExpenseRecurrencePeriod, MonthKey } from '../../models/expense-model';

export interface InstallmentDraft {
  installmentNumber: number;
  installmentTotal: number;
  value: number; // reais, 2 casas
  dueDate: DateKey;
}

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
const CENTS_PER_REAL = 100;
const MIN_INSTALLMENTS = 1;
const MAX_INSTALLMENTS = 120;
const DAYS_PER_WEEK = 7;
const MONTH_KEY_LENGTH = 7;
const MONTHS_PER_YEAR = 12;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_MIN = 1;
const MONTH_MAX = 12;
const ANO_MIN = 2000;
const ANO_MAX = 2100;

const MSG_INSTALLMENT_COUNT_INVALID = `Quantidade de parcelas deve ser um inteiro entre ${MIN_INSTALLMENTS} e ${MAX_INSTALLMENTS}.`;
const MSG_TOTAL_NOT_POSITIVE = 'Valor total da despesa deve ser um número maior que zero.';
const MSG_PERIOD_INVALID = 'Período de recorrência inválido.';

export class ExpenseScheduleService {
  /** Data local no fuso informado (default America/Sao_Paulo) -> 'YYYY-MM-DD'. */
  static toDateKey(date: Date, timeZone: string = DEFAULT_TIME_ZONE): DateKey {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const valorDa = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value);
    return formatDateKey(valorDa('year'), valorDa('month'), valorDa('day'));
  }

  static monthKeyOf(date: DateKey): MonthKey {
    return date.slice(0, MONTH_KEY_LENGTH);
  }

  /** Ultimo dia do mes de `date`. */
  static endOfMonth(date: DateKey): DateKey {
    const { year, month } = parseDateKey(date);
    return formatDateKey(year, month, lastDayOfMonth(year, month));
  }

  static addDays(date: DateKey, days: number): DateKey {
    const { year, month, day } = parseDateKey(date);
    const instante = new Date(Date.UTC(year, month - 1, day + days));
    return formatDateKey(
      instante.getUTCFullYear(),
      instante.getUTCMonth() + 1,
      instante.getUTCDate(),
    );
  }

  /** anchor + months, preservando o DIA da ancora; clamp no ultimo dia do mes alvo. */
  static addMonthsClamped(anchor: DateKey, months: number): DateKey {
    const { year, month, day } = parseDateKey(anchor);
    const indiceMes = month - 1 + months;
    const anoAlvo = year + Math.floor(indiceMes / MONTHS_PER_YEAR);
    const mesAlvo = positiveModulo(indiceMes, MONTHS_PER_YEAR) + 1;
    const diaAlvo = Math.min(day, lastDayOfMonth(anoAlvo, mesAlvo));
    return formatDateKey(anoAlvo, mesAlvo, diaAlvo);
  }

  /**
   * Divide em `count` parcelas em centavos inteiros: 1..N-1 = floor(total/N),
   * a ultima recebe o resto. Soma exata. Lanca se total <= 0, count nao inteiro
   * ou fora de 1..120.
   */
  static splitInstallments(total: number, count: number): number[] {
    assertInstallmentCountValid(count);
    assertTotalValid(total);
    const totalCentavos = toCentavos(total);

    const centavosPorParcela = Math.floor(totalCentavos / count);
    const parcelas: number[] = [];
    for (let indice = 0; indice < count - 1; indice++) {
      parcelas.push(toReais(centavosPorParcela));
    }
    parcelas.push(toReais(totalCentavos - centavosPorParcela * (count - 1)));
    return parcelas;
  }

  /** N parcelas: valores de splitInstallments + vencimentos mensais calculados da 1a data. */
  static buildInstallments(
    total: number,
    count: number,
    firstDueDate: DateKey,
  ): InstallmentDraft[] {
    const valores = ExpenseScheduleService.splitInstallments(total, count);
    return valores.map((value, indice) => ({
      installmentNumber: indice + 1,
      installmentTotal: count,
      value,
      dueDate: ExpenseScheduleService.addMonthsClamped(firstDueDate, indice),
    }));
  }

  /**
   * Datas das ocorrencias da serie: ancora + k periodos (k>=0) com
   * data > generatedThrough (ou >= ancora se null) e <= upTo. Ordenadas.
   */
  static occurrenceDates(
    anchor: DateKey,
    period: ExpenseRecurrencePeriod,
    generatedThrough: DateKey | null,
    upTo: DateKey,
  ): DateKey[] {
    assertDateKeyValid(anchor, 'anchor');
    assertDateKeyValid(upTo, 'upTo');
    if (generatedThrough !== null) {
      assertDateKeyValid(generatedThrough, 'generatedThrough');
    }

    const datas: DateKey[] = [];
    for (let periodos = 0; ; periodos++) {
      const ocorrencia = occurrenceAt(anchor, period, periodos);
      if (ocorrencia > upTo) {
        break;
      }
      if (isAfterWatermark(ocorrencia, generatedThrough)) {
        datas.push(ocorrencia);
      }
    }
    return datas;
  }

  /** ID deterministico da ocorrencia: `${seriesId}_${dueDate}`. */
  static occurrenceId(seriesId: string, dueDate: DateKey): string {
    return `${seriesId}_${dueDate}`;
  }
}

function parseDateKey(date: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function pad2(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** month em 1..12. Day 0 do mes seguinte = ultimo dia do mes. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function positiveModulo(valor: number, modulo: number): number {
  return ((valor % modulo) + modulo) % modulo;
}

function occurrenceAt(anchor: DateKey, period: ExpenseRecurrencePeriod, periodos: number): DateKey {
  switch (period) {
    case 'semanal':
      return ExpenseScheduleService.addDays(anchor, periodos * DAYS_PER_WEEK);
    case 'mensal':
      return ExpenseScheduleService.addMonthsClamped(anchor, periodos);
    default:
      throw new Error(MSG_PERIOD_INVALID);
  }
}

function isAfterWatermark(ocorrencia: DateKey, generatedThrough: DateKey | null): boolean {
  return generatedThrough === null || ocorrencia > generatedThrough;
}

export function toCentavos(reais: number): number {
  return Math.round(reais * CENTS_PER_REAL);
}

function toReais(centavos: number): number {
  return centavos / CENTS_PER_REAL;
}

function assertInstallmentCountValid(count: number): void {
  const dentroDoIntervalo = count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS;
  if (!Number.isInteger(count) || !dentroDoIntervalo) {
    throw new Error(MSG_INSTALLMENT_COUNT_INVALID);
  }
}

function assertTotalValid(total: number): void {
  if (!Number.isFinite(total) || toCentavos(total) <= 0) {
    throw new Error(MSG_TOTAL_NOT_POSITIVE);
  }
}

export function assertDateKeyValid(date: DateKey, campo: string): void {
  if (!isDateKeyValid(date)) {
    throw new Error(
      `Data inválida em ${campo}: "${date}". Use o formato AAAA-MM-DD, com ano entre ${ANO_MIN} e ${ANO_MAX}.`,
    );
  }
}

function isDateKeyValid(date: DateKey): boolean {
  if (typeof date !== 'string' || !DATE_KEY_PATTERN.test(date)) {
    return false;
  }
  const { year, month, day } = parseDateKey(date);
  const mesValido = month >= MONTH_MIN && month <= MONTH_MAX;
  const anoValido = year >= ANO_MIN && year <= ANO_MAX;
  return anoValido && mesValido && day >= 1 && day <= lastDayOfMonth(year, month);
}
