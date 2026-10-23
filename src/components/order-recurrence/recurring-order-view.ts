import { RecurringOrder, RecurringOrderItem, RecurringOrderStatus } from '../../models/recurring-order-model';
import {
  CivilDate, hojeCivil, proximaOcorrenciaPendente
} from '../../services/recurring-order-service/recurrence-rules';
import { descreverRecorrencia } from './recurrence-labels';

/** Linha da aba "Recorrentes": so texto pronto para exibir; as datas vem de recurrence-rules. */
export interface RecurringOrderView {
  model: RecurringOrder;
  customerName: string;
  itemsSummary: string;
  frequencyLabel: string;
  status: RecurringOrderStatus;
  statusLabel: string;
  /** Texto da proxima data; vazio quando o modelo nao esta ativo. */
  nextDateLabel: string;
  issueLabel: string;
  canPause: boolean;
  canResume: boolean;
  canEnd: boolean;
  canEdit: boolean;
}

export const ROTULO_DO_STATUS: Record<RecurringOrderStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  ended: 'Encerrado'
};
const SEM_PROXIMAS_DATAS = 'sem próximas datas';

/** dd/MM/yyyy a partir de 'yyyy-MM-dd', sem passar por Date (sem fuso). */
export function formatarDataCivil(data: CivilDate): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function rotuloDoItem(item: RecurringOrderItem): string {
  const quantidade = item.soldByWeight
    ? `${item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
    : `${item.quantity}x`;
  return `${quantidade} ${item.productName}`;
}

export function montarLinhaRecorrente(model: RecurringOrder, agora: Date = new Date()): RecurringOrderView {
  const ativo = model.status === 'active';
  const pausado = model.status === 'paused';
  return {
    model,
    customerName: model.customerName,
    itemsSummary: model.items.map(rotuloDoItem).join(', '),
    frequencyLabel: descreverRecorrencia({ ...model, status: 'active' }),
    status: model.status,
    statusLabel: ROTULO_DO_STATUS[model.status],
    nextDateLabel: ativo ? rotuloDaProximaData(model, agora) : '',
    issueLabel: model.lastIssue
      ? `${formatarDataCivil(model.lastIssue.date)}: ${model.lastIssue.detail}`
      : '',
    canPause: ativo,
    canResume: pausado,
    canEnd: ativo || pausado,
    canEdit: ativo || pausado
  };
}

export function rotuloDaProximaData(model: RecurringOrder, agora: Date): string {
  try {
    const proxima = proximaOcorrenciaPendente(
      {
        frequency: model.frequency,
        startDate: model.startDate,
        weekdays: model.weekdays,
        endDate: model.endDate
      },
      {
        generateFrom: model.generateFrom,
        lastGeneratedDate: model.lastGeneratedDate,
        endDate: model.endDate
      },
      hojeCivil(agora)
    );
    return proxima ? formatarDataCivil(proxima) : SEM_PROXIMAS_DATAS;
  } catch {
    return SEM_PROXIMAS_DATAS;
  }
}
