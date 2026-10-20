/**
 * Regras puras de pagamentos e parcelas de Pedidos (regra-de-negocio.md secao 5.3).
 *
 * Sem Angular e sem Firestore: o OrderService le o pedido dentro da transacao,
 * aplica estas funcoes e grava o resultado. Regra CRITICA (dinheiro + transicao
 * de estado) - coberta por order-payment-rules.spec.ts.
 */
import { Timestamp } from '@angular/fire/firestore';
import { Order, OrderItem, OrderPayment, OrderPaymentStatus } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import { calcularTotalItemPorPeso } from '../product-service/product-weight-rules';

export type CodigoPagamentoInvalido =
  | 'VALOR_INVALIDO' | 'ACIMA_DO_SALDO' | 'PEDIDO_CANCELADO' | 'PEDIDO_FINALIZADO'
  | 'PARCELA_INEXISTENTE' | 'CARTAO_NAO_PARCELA' | 'PARCELAS_NAO_FECHAM'
  | 'TOTAL_ABAIXO_DO_PAGO' | 'PARCELAS_NAO_REAJUSTADAS' | 'FORMA_INVALIDA'
  | 'PEDIDO_NAO_EDITAVEL';

export class PagamentoInvalidoError extends Error {
  constructor(public readonly codigo: CodigoPagamentoInvalido, message: string) {
    super(message);
  }
}

export type PedidoFinanceiro = Pick<Order,
  'total' | 'status' | 'payments' | 'paymentMethod' | 'installments' | 'paymentDate' | 'saleId'>;

export interface RegistrarPagamentoInput {
  amount: number;
  method: PaymentMethod;
  installments?: number;
  paidDate?: Date;    // default: agora
  parcelaId?: string; // pagamento de uma parcela prevista
}

export interface ResultadoPagamento {
  payments: OrderPayment[];
  saldo: number;
  zerouSaldo: boolean;
}
export interface ParcelaInput { amount: number; dueDate: Date; method: PaymentMethod; }
export interface FormaFinal { paymentMethod: PaymentMethod; installments: number; }

export const STATUS_PEDIDO = {
  ENTREGUE: 'delivered',
  FINALIZADO: 'finished',
  CANCELADO: 'canceled'
} as const;

const CENTAVOS_POR_UNIDADE = 100;
const DIAS_PARA_NOVA_PARCELA = 30;
const DIA_INICIAL_DO_MES = 1;
const PARCELA_MINIMA = 1;
const INSTALLMENTS_UNICO = 1;
const ID_PAGAMENTO_LEGADO = 'legado';

// ---------- centavos e datas ----------

const paraCentavos = (valor: number): number => Math.round(valor * CENTAVOS_POR_UNIDADE);
const deCentavos = (centavos: number): number => centavos / CENTAVOS_POR_UNIDADE;
const tempoDe = (data?: Timestamp): number => (data ? data.toDate().getTime() : 0);
export const vencimentoDe = (parcela: OrderPayment): Date =>
  parcela.dueDate?.toDate() ?? new Date(0);
const valorEhPositivo = (valor: number): boolean =>
  Number.isFinite(valor) && paraCentavos(valor) > 0;

function adicionarDias(data: Date, dias: number): Date {
  const resultado = new Date(data.getTime());
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

function diasNoMes(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
}

/** Soma meses mantendo o dia original; quando o mes nao tem esse dia, usa o ultimo dia do mes. */
function adicionarMesesAncorado(data: Date, meses: number): Date {
  const primeiroDoMes = new Date(
    data.getFullYear(), data.getMonth() + meses, DIA_INICIAL_DO_MES,
    data.getHours(), data.getMinutes(), data.getSeconds(), data.getMilliseconds()
  );
  primeiroDoMes.setDate(Math.min(data.getDate(), diasNoMes(primeiroDoMes)));
  return primeiroDoMes;
}

// ---------- derivados (nunca gravados) ----------

const centavosComStatus = (payments: readonly OrderPayment[], status: OrderPaymentStatus): number =>
  payments
    .filter(p => p.status === status)
    .reduce((acc, p) => acc + paraCentavos(p.amount), 0);

const saldoEmCentavos = (total: number, payments: readonly OrderPayment[]): number =>
  paraCentavos(total) - centavosComStatus(payments, 'pago');

/** Pedido finished antigo (sem payments) vira um pago de valor cheio. */
const pagamentoLegado = (order: PedidoFinanceiro): OrderPayment => ({
  id: ID_PAGAMENTO_LEGADO,
  amount: order.total,
  method: order.paymentMethod ?? PaymentMethod.DINHEIRO,
  installments: order.installments ?? INSTALLMENTS_UNICO,
  status: 'pago',
  ...(order.paymentDate ? { paidDate: order.paymentDate } : {})
});

export function arredondar2(valor: number): number {
  return deCentavos(paraCentavos(valor));
}

export function listarPagamentos(order: PedidoFinanceiro): OrderPayment[] {
  if (order.payments !== undefined) {
    return order.payments;
  }
  if (order.status === STATUS_PEDIDO.FINALIZADO) {
    return [pagamentoLegado(order)];
  }
  return [];
}

export function calcularPago(order: PedidoFinanceiro): number {
  return deCentavos(centavosComStatus(listarPagamentos(order), 'pago'));
}

export function calcularSaldo(order: PedidoFinanceiro): number {
  return deCentavos(saldoEmCentavos(order.total, listarPagamentos(order)));
}

export function calcularPrevisto(order: PedidoFinanceiro): number {
  return deCentavos(centavosComStatus(listarPagamentos(order), 'previsto'));
}

export function calcularSaldoDescoberto(order: PedidoFinanceiro): number {
  const pagamentos = listarPagamentos(order);
  return deCentavos(
    saldoEmCentavos(order.total, pagamentos) - centavosComStatus(pagamentos, 'previsto')
  );
}

export function isPedidoEntregueLegado(order: PedidoFinanceiro): boolean {
  return order.status === STATUS_PEDIDO.ENTREGUE && !order.saleId;
}

// ---------- validacoes ----------

function validarStatusAceitaPagamento(order: PedidoFinanceiro): void {
  if (order.status === STATUS_PEDIDO.CANCELADO) {
    throw new PagamentoInvalidoError('PEDIDO_CANCELADO', 'Pedido cancelado nao aceita pagamento.');
  }
  if (order.status === STATUS_PEDIDO.FINALIZADO) {
    throw new PagamentoInvalidoError('PEDIDO_FINALIZADO', 'Pedido concluido, saldo ja zerado.');
  }
}

const FORMAS_REGISTRAVEIS: readonly PaymentMethod[] =
  Object.values(PaymentMethod).filter(forma => forma !== PaymentMethod.MISTO);

function validarFormaRegistravel(method: PaymentMethod): void {
  if (!FORMAS_REGISTRAVEIS.includes(method)) {
    throw new PagamentoInvalidoError(
      'FORMA_INVALIDA', 'Forma de pagamento invalida ou nao registravel.'
    );
  }
}

function validarInstallments(installments: number | undefined): void {
  if (installments !== undefined && !Number.isFinite(installments)) {
    throw new PagamentoInvalidoError(
      'VALOR_INVALIDO', 'Numero de parcelas deve ser um valor finito.'
    );
  }
}

const cabeNoSaldo = (order: PedidoFinanceiro, valor: number): boolean =>
  paraCentavos(valor) <= saldoEmCentavos(order.total, listarPagamentos(order));

function validarValorDoPagamento(order: PedidoFinanceiro, valor: number): void {
  if (!valorEhPositivo(valor)) {
    throw new PagamentoInvalidoError(
      'VALOR_INVALIDO', 'Valor do pagamento deve ser maior que zero.'
    );
  }
  if (!cabeNoSaldo(order, valor)) {
    throw new PagamentoInvalidoError('ACIMA_DO_SALDO', 'Valor do pagamento acima do saldo.');
  }
}

function validarParcelaAgendada(parcela: ParcelaInput): void {
  if (parcela.method === PaymentMethod.CARTAO) {
    throw new PagamentoInvalidoError(
      'CARTAO_NAO_PARCELA',
      'Cartao nao pode ser parcela prevista; pagamento de cartao e sempre pago na hora.'
    );
  }
  validarFormaRegistravel(parcela.method);
  if (!valorEhPositivo(parcela.amount)) {
    throw new PagamentoInvalidoError('VALOR_INVALIDO', 'Valor de parcela deve ser maior que zero.');
  }
}

function validarAgenda(
  parcelas: readonly ParcelaInput[],
  saldoCentavos: number,
  codigoSoma: 'PARCELAS_NAO_FECHAM' | 'PARCELAS_NAO_REAJUSTADAS'
): void {
  parcelas.forEach(validarParcelaAgendada);
  const somaCentavos = parcelas.reduce((acc, p) => acc + paraCentavos(p.amount), 0);
  if (somaCentavos !== saldoCentavos) {
    throw new PagamentoInvalidoError(codigoSoma, 'Soma das parcelas nao fecha o saldo do pedido.');
  }
}

function validarQuantidadeDeParcelas(quantidade: number): void {
  if (!Number.isInteger(quantidade) || quantidade < PARCELA_MINIMA) {
    throw new PagamentoInvalidoError(
      'VALOR_INVALIDO',
      'Quantidade de parcelas deve ser inteiro maior ou igual a 1.'
    );
  }
}

// ---------- montagem de linhas ----------

/** Parcelas informativas do pagamento: inteiro >= 1; ausente vira 1. */
const normalizarInstallments = (installments: number): number =>
  Math.max(INSTALLMENTS_UNICO, Math.floor(installments));

const parcelasInformativas = (installments: number | undefined): number =>
  installments === undefined ? INSTALLMENTS_UNICO : normalizarInstallments(installments);

/** dueDate so entra quando o pago quita uma parcela (posicao k/n); avulso nao tem vencimento. */
const pagamentoPago = (
  id: string, input: RegistrarPagamentoInput, dueDate?: Timestamp
): OrderPayment => ({
  id,
  amount: arredondar2(input.amount),
  method: input.method,
  installments: parcelasInformativas(input.installments),
  paidDate: Timestamp.fromDate(input.paidDate ?? new Date()),
  status: 'pago',
  ...(dueDate ? { dueDate } : {})
});

const novaPrevista = (id: string, parcela: ParcelaInput): OrderPayment => ({
  id,
  amount: arredondar2(parcela.amount),
  method: parcela.method,
  installments: INSTALLMENTS_UNICO,
  dueDate: Timestamp.fromDate(parcela.dueDate),
  status: 'previsto'
});

const comStatus = (pagamento: OrderPayment, status: OrderPaymentStatus): OrderPayment =>
  ({ ...pagamento, status });

const comCentavos = (pagamento: OrderPayment, centavos: number): OrderPayment =>
  ({ ...pagamento, amount: deCentavos(centavos) });

const previstos = (payments: readonly OrderPayment[]): OrderPayment[] =>
  payments.filter(p => p.status === 'previsto');

export const ordenarPorVencimento = (parcelas: readonly OrderPayment[]): OrderPayment[] =>
  [...parcelas].sort((a, b) => vencimentoDe(a).getTime() - vencimentoDe(b).getTime());

/** Consome o abatimento parcela a parcela na ordem recebida; parcela zerada some da lista. */
function abaterSequencia(
  parcelas: readonly OrderPayment[], abatimentoCentavos: number
): OrderPayment[] {
  let restante = abatimentoCentavos;
  return parcelas.flatMap(parcela => {
    if (restante <= 0) {
      return [parcela];
    }
    const valorCentavos = paraCentavos(parcela.amount);
    const consumido = Math.min(valorCentavos, restante);
    restante -= consumido;
    return valorCentavos > consumido ? [comCentavos(parcela, valorCentavos - consumido)] : [];
  });
}

/** Soma o credito na primeira parcela da lista (a proxima no vencimento). */
function creditarPrimeira(
  parcelas: readonly OrderPayment[], creditoCentavos: number
): OrderPayment[] {
  if (parcelas.length === 0) {
    return [];
  }
  const [primeira, ...demais] = parcelas;
  return [comCentavos(primeira, paraCentavos(primeira.amount) + creditoCentavos), ...demais];
}

/**
 * Reaplica as previstas ajustadas mantendo a ordem original do array.
 * Previstas que nao voltam na lista ajustada saem (parcela paga ou consumida).
 * Pagos e demais status ficam intactos.
 */
function reconciliar(
  payments: readonly OrderPayment[],
  previstasAjustadas: readonly OrderPayment[],
  extras: readonly OrderPayment[]
): OrderPayment[] {
  const porId = new Map(previstasAjustadas.map(p => [p.id, p] as const));
  const mantidos = payments.flatMap(p => {
    if (p.status !== 'previsto') {
      return [p];
    }
    const ajustada = porId.get(p.id);
    return ajustada ? [ajustada] : [];
  });
  return [...mantidos, ...extras];
}

// ---------- registrar pagamento ----------

function localizarParcela(payments: readonly OrderPayment[], parcelaId: string): OrderPayment {
  const parcela = payments.find(p => p.id === parcelaId && p.status === 'previsto');
  if (!parcela) {
    throw new PagamentoInvalidoError(
      'PARCELA_INEXISTENTE',
      `Parcela ${parcelaId} nao existe entre as previstas.`
    );
  }
  return parcela;
}

/** Pagamento avulso: abate das previstas mais antigas (por vencimento). */
function aplicarAvulso(payments: readonly OrderPayment[], valorCentavos: number): OrderPayment[] {
  const ajustadas = abaterSequencia(ordenarPorVencimento(previstos(payments)), valorCentavos);
  return reconciliar(payments, ajustadas, []);
}

const novaParcelaDaDiferenca = (
  parcela: OrderPayment,
  diferencaCentavos: number,
  gerarId: () => string
): OrderPayment => novaPrevista(gerarId(), {
  amount: deCentavos(diferencaCentavos),
  dueDate: adicionarDias(vencimentoDe(parcela), DIAS_PARA_NOVA_PARCELA),
  method: parcela.method
});

/**
 * Pagamento de uma parcela especifica. Pagou menos: a diferenca vai para a proxima
 * prevista (ou nova parcela +30 dias). Pagou mais: o excesso abate as proximas em cascata.
 */
function aplicarNaParcela(
  payments: readonly OrderPayment[],
  parcela: OrderPayment,
  valorCentavos: number,
  gerarId: () => string
): OrderPayment[] {
  const ordenadas = ordenarPorVencimento(previstos(payments));
  const indice = ordenadas.findIndex(p => p.id === parcela.id);
  const anteriores = ordenadas.slice(0, indice);
  const posteriores = ordenadas.slice(indice + 1);
  const diferencaCentavos = paraCentavos(parcela.amount) - valorCentavos;

  const ajustadas = diferencaCentavos < 0
    ? abaterSequencia(posteriores, -diferencaCentavos)
    : creditarPrimeira(posteriores, diferencaCentavos);
  const semProximaParcela = diferencaCentavos > 0 && posteriores.length === 0;
  const extras = semProximaParcela
    ? [novaParcelaDaDiferenca(parcela, diferencaCentavos, gerarId)]
    : [];

  return reconciliar(payments, [...anteriores, ...ajustadas], extras);
}

export function aplicarPagamento(
  order: PedidoFinanceiro,
  input: RegistrarPagamentoInput,
  gerarId: () => string
): ResultadoPagamento {
  validarStatusAceitaPagamento(order);
  validarFormaRegistravel(input.method);
  validarValorDoPagamento(order, input.amount);
  validarInstallments(input.installments);

  const payments = listarPagamentos(order);
  const valorCentavos = paraCentavos(input.amount);
  const parcela = input.parcelaId === undefined
    ? undefined
    : localizarParcela(payments, input.parcelaId);
  const pagamento = pagamentoPago(gerarId(), input, parcela?.dueDate);
  const restantes = parcela === undefined
    ? aplicarAvulso(payments, valorCentavos)
    : aplicarNaParcela(payments, parcela, valorCentavos, gerarId);

  const novos = [...restantes, pagamento];
  const saldoCentavos = saldoEmCentavos(order.total, novos);
  return { payments: novos, saldo: deCentavos(saldoCentavos), zerouSaldo: saldoCentavos === 0 };
}

// ---------- montar parcelas ----------

export function gerarParcelasIguais(
  saldo: number,
  quantidade: number,
  primeiraData: Date,
  method: PaymentMethod
): ParcelaInput[] {
  validarQuantidadeDeParcelas(quantidade);
  const totalCentavos = paraCentavos(saldo);
  const valorBaseCentavos = Math.floor(totalCentavos / quantidade);
  const valorUltimaCentavos = totalCentavos - valorBaseCentavos * (quantidade - 1);

  return Array.from({ length: quantidade }, (_, indice) => ({
    amount: deCentavos(indice === quantidade - 1 ? valorUltimaCentavos : valorBaseCentavos),
    dueDate: adicionarMesesAncorado(primeiraData, indice),
    method
  }));
}

/** Substitui todas as previstas pelas novas parcelas; pagos e demais status sao preservados. */
function substituirPrevistas(
  payments: readonly OrderPayment[],
  parcelas: readonly ParcelaInput[],
  gerarId: () => string
): OrderPayment[] {
  const mantidos = payments.filter(p => p.status !== 'previsto');
  return [...mantidos, ...parcelas.map(p => novaPrevista(gerarId(), p))];
}

export function aplicarAgendaParcelas(
  order: PedidoFinanceiro,
  parcelas: ParcelaInput[],
  gerarId: () => string
): OrderPayment[] {
  validarStatusAceitaPagamento(order);
  const payments = listarPagamentos(order);
  validarAgenda(parcelas, saldoEmCentavos(order.total, payments), 'PARCELAS_NAO_FECHAM');
  return substituirPrevistas(payments, parcelas, gerarId);
}

// ---------- edicao de total e cancelamento ----------

/** Predicado unico do veredito de edicao de total (validarNovoTotal e avaliarNovoTotal). */
function resultadoNovoTotal(
  payments: readonly OrderPayment[],
  novoTotalCentavos: number
): ResultadoNovoTotal {
  const pagoCentavos = centavosComStatus(payments, 'pago');
  if (novoTotalCentavos < pagoCentavos) {
    return 'TOTAL_ABAIXO_DO_PAGO';
  }
  const novoSaldoCentavos = novoTotalCentavos - pagoCentavos;
  const previstoCentavos = centavosComStatus(payments, 'previsto');
  const semPrevistas = previstoCentavos === 0;
  return semPrevistas || previstoCentavos === novoSaldoCentavos ? 'OK' : 'PRECISA_REAJUSTAR';
}

export function validarNovoTotal(
  order: PedidoFinanceiro,
  novoTotal: number,
  novasParcelas: ParcelaInput[] | undefined,
  gerarId: () => string
): OrderPayment[] {
  const payments = listarPagamentos(order);
  const novoTotalCentavos = paraCentavos(novoTotal);
  const resultado = resultadoNovoTotal(payments, novoTotalCentavos);
  if (resultado === 'TOTAL_ABAIXO_DO_PAGO') {
    throw new PagamentoInvalidoError(
      'TOTAL_ABAIXO_DO_PAGO', 'Novo total nao pode ficar abaixo do ja pago.'
    );
  }

  if (novasParcelas !== undefined) {
    const novoSaldoCentavos = novoTotalCentavos - centavosComStatus(payments, 'pago');
    validarAgenda(novasParcelas, novoSaldoCentavos, 'PARCELAS_NAO_REAJUSTADAS');
    return substituirPrevistas(payments, novasParcelas, gerarId);
  }
  if (resultado === 'PRECISA_REAJUSTAR') {
    throw new PagamentoInvalidoError(
      'PARCELAS_NAO_REAJUSTADAS',
      'Edicao de total com parcelas previstas exige reajustar as parcelas.'
    );
  }
  return payments;
}

export function aplicarCancelamento(order: PedidoFinanceiro, estornar: boolean): OrderPayment[] {
  return listarPagamentos(order).map(p => {
    if (p.status === 'previsto') {
      return comStatus(p, 'cancelado');
    }
    if (p.status === 'pago' && estornar) {
      return comStatus(p, 'estornado');
    }
    return p;
  });
}

// ---------- conclusao ----------

export function resolverFormaFinal(payments: readonly OrderPayment[]): FormaFinal | null {
  const pagos = payments.filter(p => p.status === 'pago');
  if (pagos.length === 0) {
    return null;
  }
  const formas = new Set(pagos.map(p => p.method));
  if (formas.size > 1) {
    return { paymentMethod: PaymentMethod.MISTO, installments: INSTALLMENTS_UNICO };
  }
  const ultimo = pagos.reduce((a, b) => (tempoDe(b.paidDate) >= tempoDe(a.paidDate) ? b : a));
  return { paymentMethod: ultimo.method, installments: ultimo.installments };
}

export function deveConcluir(order: PedidoFinanceiro, payments: readonly OrderPayment[]): boolean {
  return order.status === STATUS_PEDIDO.ENTREGUE && saldoEmCentavos(order.total, payments) === 0;
}

const FORMA_DE_TOTAL_ZERO: FormaFinal = {
  paymentMethod: PaymentMethod.DINHEIRO,
  installments: INSTALLMENTS_UNICO
};

/**
 * Forma final na conclusao. Pedido de saldo zero sem pago (total 0)
 * conclui em dinheiro, 1 parcela.
 */
export function resolverFormaDeConclusao(
  order: PedidoFinanceiro,
  payments: readonly OrderPayment[]
): FormaFinal | null {
  if (!deveConcluir(order, payments)) {
    return null;
  }
  return resolverFormaFinal(payments) ?? FORMA_DE_TOTAL_ZERO;
}

// ---------- apoio a tela (mesma regra do servico, sem duplicar no componente) ----------

export interface LinhaAgenda { amount: number; }

export interface ResumoAgenda { soma: number; diferenca: number; fecha: boolean; }

export type ResultadoNovoTotal = 'OK' | 'TOTAL_ABAIXO_DO_PAGO' | 'PRECISA_REAJUSTAR';

export interface AvaliacaoNovoTotal { resultado: ResultadoNovoTotal; novoSaldo: number; }

/** Soma das linhas da agenda contra o saldo-alvo (diferenca = saldoAlvo - soma), em centavos. */
export function resumirAgenda(saldoAlvo: number, linhas: readonly LinhaAgenda[]): ResumoAgenda {
  const validas = linhas.filter(linha => valorEhPositivo(linha.amount));
  const somaCentavos = validas.reduce((acc, linha) => acc + paraCentavos(linha.amount), 0);
  const diferencaCentavos = paraCentavos(saldoAlvo) - somaCentavos;
  const todasValidas = validas.length === linhas.length;
  return {
    soma: deCentavos(somaCentavos),
    diferenca: deCentavos(diferencaCentavos),
    fecha: linhas.length > 0 && todasValidas && diferencaCentavos === 0
  };
}

/** Veredito de edicao de total, coerente com validarNovoTotal, sem lancar. */
export function avaliarNovoTotal(order: PedidoFinanceiro, novoTotal: number): AvaliacaoNovoTotal {
  const payments = listarPagamentos(order);
  const novoTotalCentavos = paraCentavos(novoTotal);
  const novoSaldoCentavos = novoTotalCentavos - centavosComStatus(payments, 'pago');
  return {
    resultado: resultadoNovoTotal(payments, novoTotalCentavos),
    novoSaldo: deCentavos(novoSaldoCentavos)
  };
}

/** Parcelas 'previsto' do pedido, por vencimento crescente. */
export function listarPrevistas(order: PedidoFinanceiro): OrderPayment[] {
  return ordenarPorVencimento(previstos(listarPagamentos(order)));
}

/** Proxima parcela prevista (menor dueDate) ou undefined. */
export function proximaPrevista(order: PedidoFinanceiro): OrderPayment | undefined {
  return listarPrevistas(order)[0];
}

/** 0 < valor <= saldo, em centavos. */
export function valorDePagamentoValido(order: PedidoFinanceiro, valor: number): boolean {
  return valorEhPositivo(valor) && cabeNoSaldo(order, valor);
}

export interface TotalDoPedido { itemsTotal: number; total: number; }

/**
 * Total do pedido = soma dos itens (peso via calcularTotalItemPorPeso) + frete.
 * Fonte unica para o servico (updateOrder) e para a tela (pre-check de edicao).
 */
const totalDaLinha = (item: OrderItem): number =>
  item.soldByWeight
    ? calcularTotalItemPorPeso(item.priceAtSale, item.quantity)
    : item.priceAtSale * item.quantity;

export function calcularTotalDoPedido(
  items: readonly OrderItem[],
  shippingCost: number
): TotalDoPedido {
  const itemsCentavos = items.reduce((acc, item) => acc + paraCentavos(totalDaLinha(item)), 0);
  const freteCentavos = paraCentavos(Number(shippingCost) || 0);
  return {
    itemsTotal: deCentavos(itemsCentavos),
    total: deCentavos(itemsCentavos + freteCentavos)
  };
}
