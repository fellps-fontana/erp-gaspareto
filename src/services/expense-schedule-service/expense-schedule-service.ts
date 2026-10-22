import { DateKey, ExpenseRecurrencePeriod, MonthKey } from '../../models/expense-model';

export interface InstallmentDraft {
  installmentNumber: number;
  installmentTotal: number;
  value: number;      // reais, 2 casas
  dueDate: DateKey;
}

export class ExpenseScheduleService {
  /** Data local (fuso informado, default America/Sao_Paulo) -> 'YYYY-MM-DD'. */
  static toDateKey(date: Date, timeZone: string = 'America/Sao_Paulo'): DateKey {
    throw new Error('not implemented');
  }

  static monthKeyOf(date: DateKey): MonthKey {
    throw new Error('not implemented');
  }

  /** Último dia do mês de `date`. */
  static endOfMonth(date: DateKey): DateKey {
    throw new Error('not implemented');
  }

  static addDays(date: DateKey, days: number): DateKey {
    throw new Error('not implemented');
  }

  /** anchor + months, preservando o DIA da âncora; clamp no último dia do mês alvo. */
  static addMonthsClamped(anchor: DateKey, months: number): DateKey {
    throw new Error('not implemented');
  }

  /**
   * Divide em `count` parcelas em centavos inteiros: 1..N-1 = floor(total/N),
   * a última recebe o resto. Soma exata. Lança se total <= 0, count não inteiro
   * ou fora de 1..120.
   */
  static splitInstallments(total: number, count: number): number[] {
    throw new Error('not implemented');
  }

  /** N parcelas: valores de splitInstallments + vencimentos mensais calculados da 1ª data. */
  static buildInstallments(total: number, count: number, firstDueDate: DateKey): InstallmentDraft[] {
    throw new Error('not implemented');
  }

  /**
   * Datas das ocorrências da série: âncora + k períodos (k>=0) com
   * data > generatedThrough (ou >= âncora se null) e <= upTo. Ordenadas.
   */
  static occurrenceDates(
    anchor: DateKey,
    period: ExpenseRecurrencePeriod,
    generatedThrough: DateKey | null,
    upTo: DateKey
  ): DateKey[] {
    throw new Error('not implemented');
  }

  /** ID determinístico da ocorrência: `${seriesId}_${dueDate}`. */
  static occurrenceId(seriesId: string, dueDate: DateKey): string {
    throw new Error('not implemented');
  }
}
