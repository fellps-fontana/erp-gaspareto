/**
 * Regras puras de aviso de contas a vencer (notificacoes despesasVencendo / parcelasVencendo).
 *
 * Sem Angular e sem Firestore: recebe os dados ja carregados e a data de referencia (DateKey).
 * Janela inclusiva: entra o que vence ate hoje + dias; o que ja venceu (anterior a hoje) tambem entra.
 */
import type { DateKey, Expense, ExpenseStatus } from '../../models/expense-model';
import type { Order } from '../../models/order-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
import { STATUS_PEDIDO, listarPrevistas } from '../order-service/order-payment-rules';

export const JANELA_AVISO_DIAS = 3;

const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const CLIENTE_SEM_NOME = 'Sem cliente';
const ID_AUSENTE = '';

export interface AvisoDespesa {
  expenseId: string;
  descricao: string;
  valor: number;
  dueDate: DateKey;
  vencida: boolean;
}

export interface AvisoParcela {
  orderId: string;
  clienteNome: string;
  valor: number;
  dueDate: DateKey;
  vencida: boolean;
}

export function despesasAVencer(
  expenses: Expense[],
  today: DateKey,
  dias: number = JANELA_AVISO_DIAS,
): AvisoDespesa[] {
  const limite = limiteDaJanela(today, dias);
  return expenses
    .filter((despesa) => estaAPagar(despesa) && despesa.dueDate <= limite)
    .map((despesa) => montarAvisoDespesa(despesa, today))
    .sort(ordenarPorVencimento);
}

export function parcelasAVencer(
  orders: Order[],
  today: DateKey,
  dias: number = JANELA_AVISO_DIAS,
): AvisoParcela[] {
  const limite = limiteDaJanela(today, dias);
  return orders
    .filter(naoCancelado)
    .flatMap((order) => parcelasAbertasDoPedido(order, today, limite))
    .sort(ordenarPorVencimento);
}

const limiteDaJanela = (today: DateKey, dias: number): DateKey =>
  ExpenseScheduleService.addDays(today, dias);

const estaAPagar = (despesa: Expense): boolean => despesa.status === STATUS_A_PAGAR;

const naoCancelado = (order: Order): boolean => order.status !== STATUS_PEDIDO.CANCELADO;

const ordenarPorVencimento = (a: { dueDate: DateKey }, b: { dueDate: DateKey }): number =>
  a.dueDate.localeCompare(b.dueDate);

function montarAvisoDespesa(despesa: Expense, today: DateKey): AvisoDespesa {
  return {
    expenseId: despesa.id ?? ID_AUSENTE,
    descricao: despesa.description,
    valor: despesa.value,
    dueDate: despesa.dueDate,
    vencida: despesa.dueDate < today,
  };
}

function parcelasAbertasDoPedido(order: Order, today: DateKey, limite: DateKey): AvisoParcela[] {
  return listarPrevistas(order).flatMap((parcela) => {
    if (parcela.dueDate === undefined) {
      return [];
    }
    const dueDate = ExpenseScheduleService.toDateKey(parcela.dueDate.toDate());
    if (dueDate > limite) {
      return [];
    }
    return [
      {
        orderId: order.id ?? ID_AUSENTE,
        clienteNome: order.customerName || CLIENTE_SEM_NOME,
        valor: parcela.amount,
        dueDate,
        vencida: dueDate < today,
      },
    ];
  });
}
