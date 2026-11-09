// Funcoes puras de validacao compartilhadas pelos services de Despesas.
// Sem Angular e sem Firestore: lancam Error com mensagem em portugues.

import { ExpenseRecurrencePeriod } from '../../models/expense-model';
import {
  assertDateKeyValid,
  toCentavos,
} from '../expense-schedule-service/expense-schedule-service';

export { assertDateKeyValid as assertDateKey };

const PERIODOS_DE_RECORRENCIA: readonly string[] = ['semanal', 'mensal'];

const MSG_VALOR_INVALIDO = 'Valor da despesa deve ser um número maior que zero.';
const MSG_PERIODO_INVALIDO = 'Período de recorrência inválido. Use semanal ou mensal.';

/**
 * Valor em reais: finito e com pelo menos 1 centavo. A conversao em centavos e a
 * mesma do ExpenseScheduleService; o valor gravado nao e normalizado aqui.
 */
export function assertExpenseValue(value: number): void {
  const numero = Number(value);
  if (!Number.isFinite(numero) || toCentavos(numero) <= 0) {
    throw new Error(MSG_VALOR_INVALIDO);
  }
}

/** Periodo de recorrencia: somente os valores aceitos pelo dominio. */
export function assertRecurrencePeriod(period: string): asserts period is ExpenseRecurrencePeriod {
  if (!PERIODOS_DE_RECORRENCIA.includes(period)) {
    throw new Error(MSG_PERIODO_INVALIDO);
  }
}

/** Copia o objeto sem as chaves cujo valor e undefined (Firestore recusa undefined). */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, valor]) => valor !== undefined),
  ) as Partial<T>;
}

/** Copia o objeto sem as chaves listadas em `campos`. */
export function omitFields<T extends object>(obj: T, campos: ReadonlySet<string>): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([chave]) => !campos.has(chave)),
  ) as Partial<T>;
}
