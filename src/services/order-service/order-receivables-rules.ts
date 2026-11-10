/**
 * Visoes derivadas de A receber / Recebido de Pedidos (regra-de-negocio.md secao 5.3).
 *
 * Funcoes puras unicas, sem colecao nova: a aba A receber de Pedidos e a
 * sub-aba A receber do Relatorio usam as MESMAS funcoes, pra os numeros baterem.
 * Pago e saldo vem de order-payment-rules (nenhuma formula de saldo aqui).
 */
import { Order, OrderPayment, OrderPaymentStatus } from '../../models/order-model';
import {
  STATUS_PEDIDO,
  arredondar2,
  calcularPago,
  calcularSaldo,
  listarPagamentos,
  ordenarPorVencimento,
  vencimentoDe
} from './order-payment-rules';

export interface ParcelaReceber {
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerId?: string;
  paymentId: string;
  k: number;
  n: number;
  amount: number;
  dueDate: Date;
  diasAtraso: number; // > 0 = vencida
}

export interface AbaAReceber {
  vencido: number;
  venceEsteMes: number;
  proximos: number;
  quantidadeVencidas: number;
  vencidas: ParcelaReceber[];
  esteMes: ParcelaReceber[];
  proximosMeses: ParcelaReceber[];
}

export interface MesPanorama {
  mes: number; // 0-11
  recebido: number;
  previsto: number;
  vencido: number;
}

export interface PanoramaAnual {
  ano: number;
  meses: MesPanorama[];
  recebidoAno: number;
  aReceberAno: number;
  vencidoTotal: number;
}

export interface MovimentoMes {
  orderId: string;
  orderNumber: number;
  customerName: string;
  tipo: 'recebido' | 'previsto' | 'vencido';
  amount: number;
  data: Date;
}

export interface ResumoValores {
  total: number;
  pago: number;
  saldo: number;
}

interface RecebimentoPedido {
  orderId: string;
  orderNumber: number;
  customerName: string;
  amount: number;
  data: Date;
}

const STATUS_NA_SEQUENCIA_DE_PARCELAS: readonly OrderPaymentStatus[] = ['previsto', 'pago'];
const MESES_DO_ANO = 12;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ---------- datas e valores ----------

const somar = (valores: readonly number[]): number =>
  arredondar2(valores.reduce((acc, valor) => acc + valor, 0));

const inicioDoDia = (data: Date): Date =>
  new Date(data.getFullYear(), data.getMonth(), data.getDate());

const diasEntre = (inicio: Date, fim: Date): number =>
  Math.round((fim.getTime() - inicio.getTime()) / MS_POR_DIA);

const estaNoMes = (data: Date, ano: number, mes: number): boolean =>
  data.getFullYear() === ano && data.getMonth() === mes;

const estaNoPeriodo = (data: Date, inicio: Date, fim: Date): boolean =>
  data.getTime() >= inicio.getTime() && data.getTime() <= fim.getTime();

const idDoPedido = (order: Order): string => order.id ?? '';

export function calcularDiasAtraso(vencimento: Date, hoje: Date): number {
  return Math.max(0, diasEntre(inicioDoDia(vencimento), inicioDoDia(hoje)));
}

const estaVencida = (parcela: ParcelaReceber): boolean => parcela.diasAtraso > 0;

const naoCancelado = (order: Order): boolean => order.status !== STATUS_PEDIDO.CANCELADO;

// ---------- leitura por pedido ----------

/** Parcelas da agenda (previstas e ja pagas com dueDate), da mais antiga para a mais nova. */
function sequenciaDeParcelasDoPedido(order: Order): OrderPayment[] {
  return ordenarPorVencimento(
    listarPagamentos(order).filter(
      p => STATUS_NA_SEQUENCIA_DE_PARCELAS.includes(p.status) && p.dueDate !== undefined
    )
  );
}

function montarParcelaReceber(
  order: Order,
  parcela: OrderPayment,
  posicao: number,
  totalDeParcelas: number,
  hoje: Date
): ParcelaReceber {
  const vencimento = vencimentoDe(parcela);
  return {
    orderId: idDoPedido(order),
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerId: order.customerId,
    paymentId: parcela.id,
    k: posicao + 1,
    n: totalDeParcelas,
    amount: parcela.amount,
    dueDate: vencimento,
    diasAtraso: calcularDiasAtraso(vencimento, hoje)
  };
}

/** So as previstas viram linha de A receber; k/n contam tambem as ja pagas da agenda. */
function parcelasReceberDoPedido(order: Order, hoje: Date): ParcelaReceber[] {
  const sequencia = sequenciaDeParcelasDoPedido(order);
  return sequencia
    .map((parcela, posicao) => ({ parcela, posicao }))
    .filter(({ parcela }) => parcela.status === 'previsto')
    .map(({ parcela, posicao }) =>
      montarParcelaReceber(order, parcela, posicao, sequencia.length, hoje)
    );
}

function recebimentosDoPedido(order: Order): RecebimentoPedido[] {
  return listarPagamentos(order).flatMap(pagamento => {
    const data = pagamento.paidDate?.toDate();
    if (pagamento.status !== 'pago' || !data) return [];
    return [{
      orderId: idDoPedido(order),
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      amount: pagamento.amount,
      data
    }];
  });
}

// ---------- listas base (fonte unica de todas as visoes) ----------

/** Parcelas previstas de pedidos nao cancelados, por vencimento crescente. */
export function listarParcelasReceber(orders: readonly Order[], hoje: Date): ParcelaReceber[] {
  return orders
    .filter(naoCancelado)
    .flatMap(order => parcelasReceberDoPedido(order, hoje))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Pagamentos recebidos de todos os pedidos (inclui finished, sinal retido e legado). */
function listarRecebimentos(orders: readonly Order[]): RecebimentoPedido[] {
  return orders.flatMap(recebimentosDoPedido);
}

// ---------- aba A receber ----------

export function montarAbaAReceber(orders: readonly Order[], hoje: Date): AbaAReceber {
  const parcelas = listarParcelasReceber(orders, hoje);
  const vencidas = parcelas.filter(estaVencida);
  const naoVencidas = parcelas.filter(p => !estaVencida(p));
  const doMesAtual = (data: Date): boolean =>
    estaNoMes(data, hoje.getFullYear(), hoje.getMonth());
  const esteMes = naoVencidas.filter(p => doMesAtual(p.dueDate));
  const proximosMeses = naoVencidas.filter(p => !doMesAtual(p.dueDate));

  return {
    vencido: somar(vencidas.map(p => p.amount)),
    venceEsteMes: somar(esteMes.map(p => p.amount)),
    proximos: somar(proximosMeses.map(p => p.amount)),
    quantidadeVencidas: vencidas.length,
    vencidas,
    esteMes,
    proximosMeses
  };
}

// ---------- panorama anual ----------

function montarMesPanorama(
  mes: number,
  ano: number,
  recebimentos: readonly RecebimentoPedido[],
  parcelas: readonly ParcelaReceber[]
): MesPanorama {
  const doMes = (data: Date): boolean => estaNoMes(data, ano, mes);
  return {
    mes,
    recebido: somar(recebimentos.filter(r => doMes(r.data)).map(r => r.amount)),
    previsto: somar(parcelas.filter(p => !estaVencida(p) && doMes(p.dueDate)).map(p => p.amount)),
    vencido: somar(parcelas.filter(p => estaVencida(p) && doMes(p.dueDate)).map(p => p.amount))
  };
}

export function montarPanoramaAnual(
  orders: readonly Order[],
  ano: number,
  hoje: Date
): PanoramaAnual {
  const parcelas = listarParcelasReceber(orders, hoje);
  const recebimentos = listarRecebimentos(orders);
  const meses = Array.from({ length: MESES_DO_ANO }, (_, mes) =>
    montarMesPanorama(mes, ano, recebimentos, parcelas)
  );

  return {
    ano,
    meses,
    recebidoAno: somar(meses.map(m => m.recebido)),
    aReceberAno: somar(meses.map(m => m.previsto)),
    vencidoTotal: somar(parcelas.filter(estaVencida).map(p => p.amount))
  };
}

// ---------- movimento do mes (clique no mes do panorama) ----------

const movimentoDeRecebimento = (recebimento: RecebimentoPedido): MovimentoMes => ({
  orderId: recebimento.orderId,
  orderNumber: recebimento.orderNumber,
  customerName: recebimento.customerName,
  tipo: 'recebido',
  amount: recebimento.amount,
  data: recebimento.data
});

const movimentoDeParcela = (parcela: ParcelaReceber): MovimentoMes => ({
  orderId: parcela.orderId,
  orderNumber: parcela.orderNumber,
  customerName: parcela.customerName,
  tipo: estaVencida(parcela) ? 'vencido' : 'previsto',
  amount: parcela.amount,
  data: parcela.dueDate
});

export function listarMovimentoDoMes(
  orders: readonly Order[],
  ano: number,
  mes: number,
  hoje: Date
): MovimentoMes[] {
  const recebidos = listarRecebimentos(orders)
    .filter(r => estaNoMes(r.data, ano, mes))
    .map(movimentoDeRecebimento);
  const aReceber = listarParcelasReceber(orders, hoje)
    .filter(p => estaNoMes(p.dueDate, ano, mes))
    .map(movimentoDeParcela);

  return [...recebidos, ...aReceber].sort((a, b) => a.data.getTime() - b.data.getTime());
}

// ---------- totais ----------

export function calcularRecebidoNoPeriodo(
  orders: readonly Order[],
  inicio: Date,
  fim: Date
): number {
  return somar(
    listarRecebimentos(orders)
      .filter(r => estaNoPeriodo(r.data, inicio, fim))
      .map(r => r.amount)
  );
}

export function calcularAReceberTotal(orders: readonly Order[], hoje: Date): number {
  return somar(listarParcelasReceber(orders, hoje).map(p => p.amount));
}

export function resumirValoresPedidos(orders: readonly Order[]): ResumoValores {
  return {
    total: somar(orders.map(order => order.total)),
    pago: somar(orders.map(order => calcularPago(order))),
    saldo: somar(orders.map(order => calcularSaldo(order)))
  };
}
