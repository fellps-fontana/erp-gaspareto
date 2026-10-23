import { Order } from '../../models/order-model';
import {
  AgendaDeRecorrencia, CivilDate, hojeCivil, proximaDataDeOcorrencia
} from '../../services/recurring-order-service/recurrence-rules';

/** Data civil (yyyy-MM-dd, local) de um Date/Timestamp do pedido; undefined se ausente. */
export function dataCivilDoPedido(date: Order['scheduledDate']): CivilDate | undefined {
  if (!date) return undefined;
  const d = typeof (date as { toDate?: unknown }).toDate === 'function'
    ? (date as { toDate(): Date }).toDate()
    : new Date(date as unknown as Date);
  return hojeCivil(d);
}

/**
 * 1a data sugerida: primeira da agenda depois da base (scheduledDate do pedido, ou hoje).
 * Devolve undefined quando a agenda ainda nao esta completa (ex.: weekdays sem dia marcado).
 */
export function primeiraDataSugerida(
  agenda: Omit<AgendaDeRecorrencia, 'startDate'>,
  base: CivilDate
): CivilDate | undefined {
  if (agenda.frequency === 'weekdays' && !agenda.weekdays?.length) return undefined;
  try {
    return proximaDataDeOcorrencia({ ...agenda, startDate: base, endDate: undefined }, base) ?? undefined;
  } catch {
    return undefined;
  }
}
