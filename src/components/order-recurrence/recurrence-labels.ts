import { RecurrenceFrequency, RecurringOrder, RecurringOrderStatus } from '../../models/recurring-order-model';
import { CodigoRecorrenciaInvalida } from '../../services/recurring-order-service/recurrence-rules';

/** Textos de apresentacao da recorrencia (sem regra de data: a agenda vem de recurrence-rules). */
export const OPCOES_DE_FREQUENCIA: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekdays', label: 'Dias da semana' }
];

/** Indice = valor do dia (0 = domingo). */
export const DIAS_DA_SEMANA: { value: number; label: string }[] = [
  'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'
].map((label, value) => ({ value, label }));

const ROTULO_DO_STATUS: Partial<Record<RecurringOrderStatus, string>> = {
  paused: ' (pausado)',
  ended: ' (encerrado)'
};

export const MENSAGENS_DE_RECORRENCIA: Record<CodigoRecorrenciaInvalida, string> = {
  FREQUENCIA_INVALIDA: 'Escolha uma frequência válida.',
  DIAS_DA_SEMANA_INVALIDOS: 'Marque ao menos um dia da semana.',
  DATA_INVALIDA: 'Informe uma data válida para a primeira ocorrência.',
  FIM_ANTES_DO_INICIO: 'A data de fim não pode ser anterior à primeira data.',
  ITENS_INVALIDOS: 'Este pedido não tem itens válidos para repetir.'
};

export const MENSAGEM_PADRAO_DE_RECORRENCIA = 'Não foi possível criar o pedido recorrente.';

/** Ex.: "Semanal", "Dias da semana: Seg, Qua (pausado)". */
export function descreverRecorrencia(modelo: Pick<RecurringOrder, 'frequency' | 'weekdays' | 'status'>): string {
  const base = OPCOES_DE_FREQUENCIA.find(o => o.value === modelo.frequency)?.label ?? modelo.frequency;
  const dias = modelo.frequency === 'weekdays' && modelo.weekdays
    ? `: ${[...modelo.weekdays].sort((a, b) => a - b).map(d => DIAS_DA_SEMANA[d]?.label).join(', ')}`
    : '';
  return `${base}${dias}${ROTULO_DO_STATUS[modelo.status] ?? ''}`;
}
