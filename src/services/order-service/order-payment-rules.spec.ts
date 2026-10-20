import { Timestamp } from '@angular/fire/firestore';
import { OrderItem, OrderPayment } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import {
  PagamentoInvalidoError,
  PedidoFinanceiro,
  aplicarAgendaParcelas,
  aplicarCancelamento,
  aplicarPagamento,
  arredondar2,
  avaliarNovoTotal,
  calcularPago,
  calcularPrevisto,
  calcularSaldo,
  calcularSaldoDescoberto,
  calcularTotalDoPedido,
  deveConcluir,
  gerarParcelasIguais,
  isPedidoEntregueLegado,
  listarPagamentos,
  listarPrevistas,
  proximaPrevista,
  resolverFormaFinal,
  resumirAgenda,
  validarNovoTotal,
  valorDePagamentoValido,
  ParcelaInput
} from './order-payment-rules';

/**
 * FRENTE 1 - Testes RED para regras puras de pagamentos e parcelas de Pedidos
 * (regra-de-negocio.md secao 5.3). Regra CRITICA: envolve dinheiro e transicao de estado.
 *
 * Todos os testes devem FALHAR por NotImplemented ate levi implementar.
 * Sem Firestore: Timestamp.fromDate e usado so como valor.
 *
 * Premissas assumidas onde a regra e omissa (ver lista no retorno do mike):
 * - gerarParcelasIguais: parcela 1 cai na data X; parcela k cai em X + (k-1) meses.
 * - gerarParcelasIguais: variante ANCORADA no dia original (31/01 -> 28/02 -> 31/03 -> 30/04).
 * - gerarParcelasIguais: parcelas nao-finais sao truncadas em centavos; a ultima absorve o resto.
 * - "+30 dias" = dia do calendario (Nov 10 + 30 dias = Dec 10).
 */

const dia = (ano: number, mes: number, dAux: number): Date => new Date(ano, mes - 1, dAux);
const ts = (d: Date): Timestamp => Timestamp.fromDate(d);
const tempo = (t: Timestamp | undefined): number => (t ? t.toDate().getTime() : -1);

const pedido = (overrides: Partial<PedidoFinanceiro> = {}): PedidoFinanceiro =>
  ({ total: 100, status: 'pending', ...overrides });

const pagoRow = (
  id: string,
  amount: number,
  method: PaymentMethod = PaymentMethod.DINHEIRO,
  paidDate: Date = dia(2026, 1, 5),
  installments = 1
): OrderPayment => ({ id, amount, method, installments, paidDate: ts(paidDate), status: 'pago' });

const previstoRow = (id: string, amount: number, dueDate: Date): OrderPayment => ({
  id,
  amount,
  method: PaymentMethod.DINHEIRO,
  installments: 1,
  dueDate: ts(dueDate),
  status: 'previsto'
});

const somaPrevistos = (payments: readonly OrderPayment[]): number =>
  arredondar2(payments.filter(p => p.status === 'previsto').reduce((acc, p) => acc + p.amount, 0));

const novoGerador = (): (() => string) => {
  let seq = 0;
  return () => 'nv-' + (++seq);
};

/** Captura o erro lancado; NotImplemented propaga e falha o teste (RED honesto). */
const capturarErro = (fn: () => unknown): PagamentoInvalidoError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PagamentoInvalidoError) {
      return e;
    }
    throw e;
  }
  throw new Error('esperava PagamentoInvalidoError, mas nada foi lancado');
};

describe('OrderPaymentRules - Pagamentos, parcelas e A receber de Pedidos [CRITICA]', () => {

  describe('arredondar2 - centavos', () => {
    it('[RED] deve retornar 0.3 para 0.1 + 0.2 (prova-flutuante)', () => {
      expect(arredondar2(0.1 + 0.2)).toBe(0.3);
    });

    it('[RED] deve manter valor ja em 2 casas', () => {
      expect(arredondar2(33.33)).toBe(33.33);
    });
  });

  describe('Derivados (nunca gravados): pago, saldo, previsto, saldoDescoberto', () => {
    it('[RED] calcularPago soma so os pagamentos com status pago', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 10), pagoRow('b', 30), previstoRow('c', 60, dia(2026, 11, 10))]
      });
      expect(calcularPago(order)).toBe(40);
    });

    it('[RED] calcularPago ignora estornado e cancelado', () => {
      const order = pedido({
        total: 100,
        payments: [
          pagoRow('a', 25),
          { ...pagoRow('b', 20), status: 'estornado' },
          { ...previstoRow('c', 15, dia(2026, 11, 10)), status: 'cancelado' }
        ]
      });
      expect(calcularPago(order)).toBe(25);
    });

    it('[RED] calcularSaldo = total - pago', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 40)] });
      expect(calcularSaldo(order)).toBe(60);
    });

    it('[RED] calcularSaldo usa centavos: total 0.3 pago 0.1 + 0.2 => saldo 0', () => {
      const order = pedido({ total: 0.3, payments: [pagoRow('a', 0.1), pagoRow('b', 0.2)] });
      expect(calcularSaldo(order)).toBe(0);
    });

    it('[RED] calcularPrevisto soma so os previsto', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('b', 35, dia(2026, 11, 10)), previstoRow('c', 25, dia(2026, 12, 10))]
      });
      expect(calcularPrevisto(order)).toBe(60);
    });

    it('[RED] calcularSaldoDescoberto = saldo - previsto (saldo 60, previsto 50 => 10)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('b', 50, dia(2026, 11, 10))]
      });
      expect(calcularSaldoDescoberto(order)).toBe(10);
    });

    it('[RED] calcularSaldoDescoberto sem previstas = saldo inteiro (pedido sem agenda)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 40)] });
      expect(calcularSaldoDescoberto(order)).toBe(60);
    });

    it('[RED] calcularSaldoDescoberto e negativo quando previsto excede saldo (borda: nao deve mascarar)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 90), previstoRow('b', 20, dia(2026, 11, 10))]
      });
      expect(calcularSaldoDescoberto(order)).toBe(-10);
    });
  });

  describe('Leitura de pedido antigo (sem migracao)', () => {
    it('[RED] finished sem payments vira 1 pago de valor cheio com method = paymentMethod, installments e paidDate = paymentDate', () => {
      const order = pedido({
        total: 80,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        installments: 2,
        paymentDate: ts(dia(2026, 3, 1))
      });
      const lista = listarPagamentos(order);
      expect(lista.length).toBe(1);
      expect(lista[0].status).toBe('pago');
      expect(lista[0].amount).toBe(80);
      expect(lista[0].method).toBe(PaymentMethod.PIX);
      expect(lista[0].installments).toBe(2);
      expect(tempo(lista[0].paidDate)).toBe(dia(2026, 3, 1).getTime());
    });

    it('[RED] finished antigo sem paymentMethod assume dinheiro', () => {
      const order = pedido({ total: 80, status: 'finished', paymentDate: ts(dia(2026, 3, 1)) });
      const lista = listarPagamentos(order);
      expect(lista.length).toBe(1);
      expect(lista[0].method).toBe(PaymentMethod.DINHEIRO);
    });

    it('[RED] finished antigo derivado conta como pago cheio (calcularPago = total, saldo 0)', () => {
      const order = pedido({
        total: 80,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        paymentDate: ts(dia(2026, 3, 1))
      });
      expect(calcularPago(order)).toBe(80);
      expect(calcularSaldo(order)).toBe(0);
    });

    it('[RED] finished com payments gravados usa os payments e nao a derivacao', () => {
      const order = pedido({
        total: 100,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        payments: [pagoRow('a', 100, PaymentMethod.CARTAO)]
      });
      const lista = listarPagamentos(order);
      expect(lista.length).toBe(1);
      expect(lista[0].method).toBe(PaymentMethod.CARTAO);
    });

    it('[RED] pending sem payments nao deriva nenhum pagamento', () => {
      expect(listarPagamentos(pedido({ status: 'pending' }))).toEqual([]);
    });

    it('[RED] delivered sem payments nao vira pago derivado (so e marcado legado)', () => {
      expect(listarPagamentos(pedido({ status: 'delivered' }))).toEqual([]);
    });

    it('[RED] isPedidoEntregueLegado: delivered sem saleId = true', () => {
      expect(isPedidoEntregueLegado(pedido({ status: 'delivered', saleId: undefined }))).toBe(true);
    });

    it('[RED] isPedidoEntregueLegado: delivered com saleId = false', () => {
      expect(isPedidoEntregueLegado(pedido({ status: 'delivered', saleId: 'sale-1' }))).toBe(false);
    });

    it('[RED] isPedidoEntregueLegado: pending ou finished sem saleId = false', () => {
      expect(isPedidoEntregueLegado(pedido({ status: 'pending' }))).toBe(false);
      expect(isPedidoEntregueLegado(pedido({ status: 'finished' }))).toBe(false);
    });
  });

  describe('aplicarPagamento - bloqueios', () => {
    it('[RED] valor zero lanca VALOR_INVALIDO', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido(), { amount: 0, method: PaymentMethod.DINHEIRO }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] valor negativo lanca VALOR_INVALIDO', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido(), { amount: -5, method: PaymentMethod.DINHEIRO }, novoGerador()));
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] valor acima do saldo lanca ACIMA_DO_SALDO (borda: 100.01 com saldo 100)', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }), { amount: 100.01, method: PaymentMethod.DINHEIRO }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('ACIMA_DO_SALDO');
    });

    it('[RED] valor exatamente igual ao saldo e aceito (borda: 100 com saldo 100)', () => {
      const r = aplicarPagamento(pedido({ total: 100 }), { amount: 100, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.saldo).toBe(0);
    });

    it('[RED] pedido canceled lanca PEDIDO_CANCELADO mesmo com valor valido', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ status: 'canceled' }), { amount: 10, method: PaymentMethod.DINHEIRO }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PEDIDO_CANCELADO');
    });

    it('[RED] pedido finished lanca PEDIDO_FINALIZADO (saldo ja zero)', () => {
      const order = pedido({ total: 100, status: 'finished', payments: [pagoRow('a', 100)] });
      const erro = capturarErro(() =>
        aplicarPagamento(order, { amount: 10, method: PaymentMethod.DINHEIRO }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PEDIDO_FINALIZADO');
    });

    it('[RED] method misto nunca e pagamento registravel: lanca FORMA_INVALIDA', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }), { amount: 10, method: PaymentMethod.MISTO }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('FORMA_INVALIDA');
    });

    it('[RED] pagamento permitido em status delivered e pending (antes da entrega tambem)', () => {
      const r1 = aplicarPagamento(pedido({ status: 'pending' }), { amount: 10, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, novoGerador());
      const r2 = aplicarPagamento(pedido({ status: 'delivered' }), { amount: 10, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r1.saldo).toBe(90);
      expect(r2.saldo).toBe(90);
    });
  });

  describe('aplicarPagamento - validacao de forma e normalizacao de parcelas (entrada invalida)', () => {
    it('[RED] method fora do enum PaymentMethod (bitcoin) lanca FORMA_INVALIDA', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }),
          { amount: 10, method: 'bitcoin' as unknown as PaymentMethod }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('FORMA_INVALIDA');
    });

    it('[RED] installments NaN lanca VALOR_INVALIDO (nao finito nao vira informativo)', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }),
          { amount: 10, method: PaymentMethod.PIX, installments: NaN }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] installments Infinity lanca VALOR_INVALIDO', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }),
          { amount: 10, method: PaymentMethod.PIX, installments: Infinity }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] installments nao numerico (abc) lanca VALOR_INVALIDO', () => {
      const erro = capturarErro(() =>
        aplicarPagamento(pedido({ total: 100 }),
          { amount: 10, method: PaymentMethod.PIX, installments: 'abc' as unknown as number }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] installments 2.7 normaliza por floor para 2 no pago', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 10, method: PaymentMethod.PIX, installments: 2.7, paidDate: dia(2026, 2, 1) }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago?.installments).toBe(2);
    });
  });

  describe('aplicarPagamento - caso feliz e flags', () => {
    it('[RED] pagamento avulso sem previstas cria pago com method, amount e paidDate informados', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 40, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, novoGerador());
      const pagos = r.payments.filter(p => p.status === 'pago');
      expect(pagos.length).toBe(1);
      expect(pagos[0].amount).toBe(40);
      expect(pagos[0].method).toBe(PaymentMethod.DINHEIRO);
      expect(tempo(pagos[0].paidDate)).toBe(dia(2026, 2, 1).getTime());
      expect(r.saldo).toBe(60);
      expect(r.zerouSaldo).toBe(false);
    });

    it('[RED] paidDate omitido usa agora (default) e ainda grava paidDate no pago', () => {
      const antes = Date.now();
      const r = aplicarPagamento(pedido({ total: 100 }), { amount: 10, method: PaymentMethod.DINHEIRO }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago).toBeDefined();
      expect(tempo(pago!.paidDate)).toBeGreaterThanOrEqual(antes - 1000);
      expect(tempo(pago!.paidDate)).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('[RED] zerouSaldo true quando o saldo chega a 0', () => {
      const r = aplicarPagamento(pedido({ total: 100, payments: [pagoRow('a', 60)] }),
        { amount: 40, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.saldo).toBe(0);
      expect(r.zerouSaldo).toBe(true);
    });
  });

  describe('aplicarPagamento - cartao e Pix', () => {
    it('[RED] cartao de valor parcial vira pago na hora e nao cria previsto', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 60, method: PaymentMethod.CARTAO, installments: 3, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.payments.some(p => p.status === 'previsto')).toBe(false);
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago).toBeDefined();
      expect(pago!.method).toBe(PaymentMethod.CARTAO);
      expect(r.saldo).toBe(40);
    });

    it('[RED] cartao preserva installments informativo (3) no pago', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 60, method: PaymentMethod.CARTAO, installments: 3, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.payments.find(p => p.status === 'pago')!.installments).toBe(3);
    });

    it('[RED] cartao de valor total (borda) zera saldo e nao cria previsto', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 100, method: PaymentMethod.CARTAO, installments: 2, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.zerouSaldo).toBe(true);
      expect(r.payments.some(p => p.status === 'previsto')).toBe(false);
    });

    it('[RED] Pix preserva installments informativo (3) no pago, sem trava de Pix a vista', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 50, method: PaymentMethod.PIX, installments: 3, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.payments.find(p => p.status === 'pago')!.installments).toBe(3);
    });

    it('[RED] installments menor que 1 normaliza para 1 em qualquer forma (Pix com 0 vira 1)', () => {
      const r = aplicarPagamento(pedido({ total: 100 }),
        { amount: 50, method: PaymentMethod.PIX, installments: 0, paidDate: dia(2026, 2, 1) }, novoGerador());
      expect(r.payments.find(p => p.status === 'pago')!.installments).toBe(1);
    });
  });

  describe('aplicarPagamento - pagamento de parcela especifica (parcelaId)', () => {
    it('[RED] parcelaId inexistente lanca PARCELA_INEXISTENTE', () => {
      const order = pedido({ total: 100, payments: [previstoRow('p1', 100, dia(2026, 11, 10))] });
      const erro = capturarErro(() =>
        aplicarPagamento(order, { amount: 10, method: PaymentMethod.DINHEIRO, parcelaId: 'nao-existe' }, novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PARCELA_INEXISTENTE');
    });

    it('[RED] pagar menos que a parcela: diferenca soma na proxima parcela prevista', () => {
      const order = pedido({
        total: 100,
        payments: [previstoRow('p1', 50, dia(2026, 11, 10)), previstoRow('p2', 50, dia(2026, 12, 10))]
      });
      const r = aplicarPagamento(order,
        { amount: 40, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.length).toBe(1);
      expect(previstos[0].id).toBe('p2');
      expect(previstos[0].amount).toBe(60);
      expect(r.saldo).toBe(60);
      expect(somaPrevistos(r.payments)).toBe(r.saldo);
    });

    it('[RED] pagar menos sem proxima parcela cria nova parcela com dueDate = dueDate da paga + 30 dias', () => {
      const order = pedido({ total: 100, payments: [previstoRow('p1', 100, dia(2026, 11, 10))] });
      const r = aplicarPagamento(order,
        { amount: 60, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.length).toBe(1);
      expect(previstos[0].amount).toBe(40);
      expect(tempo(previstos[0].dueDate)).toBe(dia(2026, 12, 10).getTime());
      expect(somaPrevistos(r.payments)).toBe(r.saldo);
    });

    it('[RED] pagamento de parcela registra o pago com o valor efetivamente pago (60) e method informado', () => {
      const order = pedido({ total: 100, payments: [previstoRow('p1', 100, dia(2026, 11, 10))] });
      const r = aplicarPagamento(order,
        { amount: 60, method: PaymentMethod.PIX, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago).toBeDefined();
      expect(pago!.amount).toBe(60);
      expect(pago!.method).toBe(PaymentMethod.PIX);
    });

    it('[RED] pagamento de parcela grava o pago com o dueDate da parcela paga (regra 5.3: posicao k/n)', () => {
      const order = pedido({
        total: 100,
        payments: [previstoRow('p1', 50, dia(2026, 11, 10)), previstoRow('p2', 50, dia(2026, 12, 10))]
      });
      const r = aplicarPagamento(order,
        { amount: 50, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago).toBeDefined();
      expect(tempo(pago!.dueDate)).toBe(dia(2026, 11, 10).getTime());
    });

    it('[RED] pagamento parcial de parcela grava dueDate da parcela paga e nao o da proxima', () => {
      const order = pedido({
        total: 100,
        payments: [previstoRow('p1', 50, dia(2026, 11, 10)), previstoRow('p2', 50, dia(2026, 12, 10))]
      });
      const r = aplicarPagamento(order,
        { amount: 40, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago!.amount).toBe(40);
      expect(tempo(pago!.dueDate)).toBe(dia(2026, 11, 10).getTime());
    });

    it('[RED] pagar mais que a parcela abate as proximas em cascata (50 sobre 30: proxima 30 vira 10)', () => {
      const order = pedido({
        total: 100,
        payments: [
          previstoRow('p1', 30, dia(2026, 11, 10)),
          previstoRow('p2', 30, dia(2026, 12, 10)),
          previstoRow('p3', 40, dia(2027, 1, 10))
        ]
      });
      const r = aplicarPagamento(order,
        { amount: 50, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.map(p => p.amount)).toEqual([10, 40]);
      expect(somaPrevistos(r.payments)).toBe(r.saldo);
    });

    it('[RED] cascata zera e remove parcela intermediaria e segue abatendo a proxima (35 sobre 10: 10 some, 65 sobra em 80)', () => {
      const order = pedido({
        total: 100,
        payments: [
          previstoRow('p1', 10, dia(2026, 11, 10)),
          previstoRow('p2', 10, dia(2026, 12, 10)),
          previstoRow('p3', 80, dia(2027, 1, 10))
        ]
      });
      const r = aplicarPagamento(order,
        { amount: 35, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: dia(2026, 11, 10) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.length).toBe(1);
      expect(previstos[0].amount).toBe(65);
      expect(r.saldo).toBe(65);
      expect(somaPrevistos(r.payments)).toBe(r.saldo);
    });
  });

  describe('aplicarPagamento - pagamento avulso (sem parcelaId)', () => {
    it('[RED] avulso com previstas abate das mais antigas (por dueDate, nao pela ordem do array)', () => {
      const order = pedido({
        total: 100,
        payments: [
          previstoRow('p2', 70, dia(2026, 12, 10)),
          previstoRow('p1', 30, dia(2026, 11, 10))
        ]
      });
      const r = aplicarPagamento(order, { amount: 50, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 11, 1) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.length).toBe(1);
      expect(previstos[0].id).toBe('p2');
      expect(previstos[0].amount).toBe(50);
      expect(r.saldo).toBe(50);
    });

    it('[RED] avulso com previstas grava o pago SEM dueDate (guarda de regressao: so parcelaId grava vencimento)', () => {
      const order = pedido({
        total: 100,
        payments: [previstoRow('p1', 100, dia(2026, 11, 10))]
      });
      const r = aplicarPagamento(order, { amount: 30, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 11, 1) }, novoGerador());
      const pago = r.payments.find(p => p.status === 'pago');
      expect(pago).toBeDefined();
      expect(pago!.dueDate).toBeUndefined();
    });

    it('[RED] avulso parcial abate so a parcela mais antiga sem removela (10 sobre 30: vira 20)', () => {
      const order = pedido({
        total: 100,
        payments: [
          previstoRow('p1', 30, dia(2026, 11, 10)),
          previstoRow('p2', 70, dia(2026, 12, 10))
        ]
      });
      const r = aplicarPagamento(order, { amount: 10, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 11, 1) }, novoGerador());
      const previstos = r.payments.filter(p => p.status === 'previsto');
      expect(previstos.map(p => p.amount)).toEqual([20, 70]);
      expect(somaPrevistos(r.payments)).toBe(r.saldo);
    });
  });

  describe('Invariante: existindo previstas, soma(previsto) == saldo', () => {
    it('[RED] mantem soma(previsto) == saldo apos agenda, avulso e pagamento de parcela em sequencia', () => {
      const agenda = gerarParcelasIguais(100, 3, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      const gerarId = novoGerador();
      const payments1 = aplicarAgendaParcelas(pedido({ total: 100 }), agenda, gerarId);
      expect(somaPrevistos(payments1)).toBe(100);

      const r1 = aplicarPagamento(pedido({ total: 100, payments: payments1 }),
        { amount: 25, method: PaymentMethod.DINHEIRO, paidDate: dia(2026, 2, 1) }, gerarId);
      expect(r1.saldo).toBe(75);
      expect(somaPrevistos(r1.payments)).toBe(r1.saldo);

      const segunda = r1.payments.filter(p => p.status === 'previsto')[1];
      const r2 = aplicarPagamento(pedido({ total: 100, payments: r1.payments }),
        { amount: 20, method: PaymentMethod.DINHEIRO, parcelaId: segunda.id, paidDate: dia(2026, 3, 1) }, gerarId);
      expect(r2.saldo).toBe(55);
      expect(somaPrevistos(r2.payments)).toBe(r2.saldo);
    });
  });

  describe('gerarParcelasIguais - N parcelas mensais', () => {
    it('[RED] 100 / 3 gera 33.33, 33.33, 33.34 (centavos sobrantes na ultima) e soma 100', () => {
      const parcelas = gerarParcelasIguais(100, 3, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      expect(parcelas.map(p => p.amount)).toEqual([33.33, 33.33, 33.34]);
      expect(arredondar2(parcelas.reduce((acc, p) => acc + p.amount, 0))).toBe(100);
    });

    it('[RED] 10 / 7 truncado: seis de 1.42 e a ultima absorve o resto (1.48)', () => {
      const parcelas = gerarParcelasIguais(10, 7, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      expect(parcelas.map(p => p.amount)).toEqual([1.42, 1.42, 1.42, 1.42, 1.42, 1.42, 1.48]);
    });

    it('[RED] 90 / 3 divide exato sem centavos sobrando', () => {
      const parcelas = gerarParcelasIguais(90, 3, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      expect(parcelas.map(p => p.amount)).toEqual([30, 30, 30]);
    });

    it('[RED] quantidade 1 gera uma parcela com o saldo inteiro', () => {
      const parcelas = gerarParcelasIguais(100, 1, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      expect(parcelas.length).toBe(1);
      expect(parcelas[0].amount).toBe(100);
    });

    it('[RED] propaga o method para todas as parcelas', () => {
      const parcelas = gerarParcelasIguais(100, 3, dia(2026, 2, 10), PaymentMethod.BOLETO);
      expect(parcelas.every(p => p.method === PaymentMethod.BOLETO)).toBe(true);
    });

    it('[RED] mensal a partir da data: parcela 1 em X, parcela 2 em X + 1 mes, parcela 3 em X + 2 meses', () => {
      const parcelas = gerarParcelasIguais(100, 3, dia(2026, 2, 10), PaymentMethod.DINHEIRO);
      expect(parcelas.map(p => p.dueDate.getTime())).toEqual([
        dia(2026, 2, 10).getTime(),
        dia(2026, 3, 10).getTime(),
        dia(2026, 4, 10).getTime()
      ]);
    });

    it('[RED] 31/01 + 1 mes = 28/02 (ano nao bissexto); variante ANCORADA: mes seguinte volta ao dia 31 quando existe', () => {
      const parcelas = gerarParcelasIguais(100, 4, dia(2026, 1, 31), PaymentMethod.DINHEIRO);
      expect(parcelas.map(p => p.dueDate.getTime())).toEqual([
        dia(2026, 1, 31).getTime(),
        dia(2026, 2, 28).getTime(),
        dia(2026, 3, 31).getTime(),
        dia(2026, 4, 30).getTime()
      ]);
    });

    it('[RED] 31/01/2028 + 1 mes = 29/02/2028 (ano bissexto)', () => {
      const parcelas = gerarParcelasIguais(100, 2, dia(2028, 1, 31), PaymentMethod.DINHEIRO);
      expect(parcelas[1].dueDate.getTime()).toBe(dia(2028, 2, 29).getTime());
    });
  });

  describe('aplicarAgendaParcelas - montar parcelas', () => {
    const pedidoComPago = (): PedidoFinanceiro =>
      pedido({ total: 100, payments: [pagoRow('pago1', 40)] });

    it('[RED] preserva os pago e substitui todos os previsto antigos pelas novas parcelas', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('pago1', 40), previstoRow('antiga', 60, dia(2026, 11, 10))]
      });
      const parcelas: ParcelaInput[] = [
        { amount: 30, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
        { amount: 30, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ];
      const r = aplicarAgendaParcelas(order, parcelas, novoGerador());
      expect(r.some(p => p.id === 'pago1' && p.status === 'pago' && p.amount === 40)).toBe(true);
      expect(r.some(p => p.id === 'antiga')).toBe(false);
      const previstos = r.filter(p => p.status === 'previsto');
      expect(previstos.map(p => p.amount)).toEqual([30, 30]);
      expect(somaPrevistos(r)).toBe(60);
    });

    it('[RED] previstas nascem com installments = 1 e status previsto, com dueDate gravado', () => {
      const r = aplicarAgendaParcelas(pedidoComPago(),
        [{ amount: 60, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO }], novoGerador());
      const previsto = r.find(p => p.status === 'previsto');
      expect(previsto).toBeDefined();
      expect(previsto!.installments).toBe(1);
      expect(tempo(previsto!.dueDate)).toBe(dia(2026, 12, 10).getTime());
    });

    it('[RED] soma diferente do saldo lanca PARCELAS_NAO_FECHAM (40 + 20 = 60 com saldo 60 ok; 40 + 10 nao fecha)', () => {
      const erro = capturarErro(() => aplicarAgendaParcelas(pedidoComPago(),
        [
          { amount: 40, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
          { amount: 10, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
        ], novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PARCELAS_NAO_FECHAM');
    });

    it('[RED] soma igual ao saldo com parcelas fechando aceita (borda: 40 + 20 = 60)', () => {
      const r = aplicarAgendaParcelas(pedidoComPago(), [
        { amount: 40, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
        { amount: 20, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador());
      expect(somaPrevistos(r)).toBe(60);
    });

    it('[RED] parcela com method cartao lanca CARTAO_NAO_PARCELA', () => {
      const erro = capturarErro(() => aplicarAgendaParcelas(pedidoComPago(), [
        { amount: 30, dueDate: dia(2026, 12, 10), method: PaymentMethod.CARTAO },
        { amount: 30, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro.codigo).toBe('CARTAO_NAO_PARCELA');
    });

    it('[RED] parcela com method misto lanca FORMA_INVALIDA (misto nunca e forma de parcela)', () => {
      const erro = capturarErro(() => aplicarAgendaParcelas(pedidoComPago(), [
        { amount: 30, dueDate: dia(2026, 12, 10), method: PaymentMethod.MISTO },
        { amount: 30, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('FORMA_INVALIDA');
    });

    it('[RED] agenda em pedido canceled lanca PEDIDO_CANCELADO mesmo com soma fechando o saldo', () => {
      const order = pedido({ total: 100, status: 'canceled', payments: [pagoRow('pago1', 40)] });
      const erro = capturarErro(() => aplicarAgendaParcelas(order, [
        { amount: 60, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PEDIDO_CANCELADO');
    });

    it('[RED] agenda em pedido finished lanca PEDIDO_FINALIZADO (saldo ja zerado)', () => {
      const order = pedido({ total: 100, status: 'finished', payments: [pagoRow('pago1', 100)] });
      const erro = capturarErro(() => aplicarAgendaParcelas(order, [
        { amount: 10, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro).toBeInstanceOf(PagamentoInvalidoError);
      expect(erro.codigo).toBe('PEDIDO_FINALIZADO');
    });

    it('[RED] parcela com valor zero lanca VALOR_INVALIDO (soma fecha: 0 + 60)', () => {
      const erro = capturarErro(() => aplicarAgendaParcelas(pedidoComPago(), [
        { amount: 0, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
        { amount: 60, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });

    it('[RED] parcela com valor negativo lanca VALOR_INVALIDO (soma fecha: -10 + 70)', () => {
      const erro = capturarErro(() => aplicarAgendaParcelas(pedidoComPago(), [
        { amount: -10, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
        { amount: 70, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro.codigo).toBe('VALOR_INVALIDO');
    });
  });

  describe('validarNovoTotal - edicao de itens/frete com pagamentos', () => {
    it('[RED] novoTotal menor que o pago lanca TOTAL_ABAIXO_DO_PAGO (novo 50 com pago 60)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      const erro = capturarErro(() => validarNovoTotal(order, 50, undefined, novoGerador()));
      expect(erro.codigo).toBe('TOTAL_ABAIXO_DO_PAGO');
    });

    it('[RED] novoTotal igual ao pago e aceito (borda: saldo zera)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      expect(() => validarNovoTotal(order, 60, undefined, novoGerador())).not.toThrow();
    });

    it('[RED] sem previstas e novoTotal >= pago: ok e devolve payments inalterados', () => {
      const payments = [pagoRow('a', 60)];
      const order = pedido({ total: 100, payments });
      const r = validarNovoTotal(order, 120, undefined, novoGerador());
      expect(r).toEqual(payments);
    });

    it('[RED] com previstas e sem novasParcelas: lanca PARCELAS_NAO_REAJUSTADAS (novo saldo 80, previstas somam 60)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const erro = capturarErro(() => validarNovoTotal(order, 120, undefined, novoGerador()));
      expect(erro.codigo).toBe('PARCELAS_NAO_REAJUSTADAS');
    });

    it('[RED] com previstas e novasParcelas que nao fecham o novo saldo: lanca PARCELAS_NAO_REAJUSTADAS (70 != 80)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const erro = capturarErro(() => validarNovoTotal(order, 120, [
        { amount: 70, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador()));
      expect(erro.codigo).toBe('PARCELAS_NAO_REAJUSTADAS');
    });

    it('[RED] com previstas e novasParcelas que fecham o novo saldo (80): substitui previstas e preserva pago', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const r = validarNovoTotal(order, 120, [
        { amount: 30, dueDate: dia(2026, 12, 10), method: PaymentMethod.DINHEIRO },
        { amount: 50, dueDate: dia(2027, 1, 10), method: PaymentMethod.DINHEIRO }
      ], novoGerador());
      expect(r.some(p => p.id === 'a' && p.status === 'pago' && p.amount === 40)).toBe(true);
      expect(r.some(p => p.id === 'p1')).toBe(false);
      expect(somaPrevistos(r)).toBe(80);
    });
  });

  describe('aplicarCancelamento - cancelar pedido com pagamentos', () => {
    it('[RED] previstas viram cancelado (com ou sem estorno)', () => {
      const order = pedido({
        total: 100,
        status: 'canceled',
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const r = aplicarCancelamento(order, false);
      expect(r.find(p => p.id === 'p1')!.status).toBe('cancelado');
    });

    it('[RED] estornar true: pago vira estornado (sai do Recebido)', () => {
      const order = pedido({ total: 100, status: 'canceled', payments: [pagoRow('a', 40)] });
      const r = aplicarCancelamento(order, true);
      expect(r.find(p => p.id === 'a')!.status).toBe('estornado');
      expect(r.find(p => p.id === 'a')!.amount).toBe(40);
    });

    it('[RED] estornar false: pago segue pago (sinal retido)', () => {
      const order = pedido({ total: 100, status: 'canceled', payments: [pagoRow('a', 40)] });
      const r = aplicarCancelamento(order, false);
      expect(r.find(p => p.id === 'a')!.status).toBe('pago');
    });

    it('[RED] estornar true tambem cancela as previstas (combinado)', () => {
      const order = pedido({
        total: 100,
        status: 'canceled',
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const r = aplicarCancelamento(order, true);
      expect(r.find(p => p.id === 'a')!.status).toBe('estornado');
      expect(r.find(p => p.id === 'p1')!.status).toBe('cancelado');
    });
  });

  describe('resolverFormaFinal - forma e parcelas na conclusao', () => {
    it('[RED] uma unica forma pago: devolve ela com installments do ultimo pago por paidDate', () => {
      const r = resolverFormaFinal([
        pagoRow('a', 50, PaymentMethod.CARTAO, dia(2026, 2, 5), 2),
        pagoRow('b', 50, PaymentMethod.CARTAO, dia(2026, 3, 5), 3)
      ]);
      expect(r).toEqual({ paymentMethod: PaymentMethod.CARTAO, installments: 3 });
    });

    it('[RED] ultimo por paidDate (nao pela ordem do array): array com mais novo primeiro', () => {
      const r = resolverFormaFinal([
        pagoRow('b', 50, PaymentMethod.CARTAO, dia(2026, 3, 5), 3),
        pagoRow('a', 50, PaymentMethod.CARTAO, dia(2026, 2, 5), 2)
      ]);
      expect(r).toEqual({ paymentMethod: PaymentMethod.CARTAO, installments: 3 });
    });

    it('[RED] mais de uma forma distinta entre os pago: MISTO com installments 1', () => {
      const r = resolverFormaFinal([
        pagoRow('a', 50, PaymentMethod.DINHEIRO, dia(2026, 2, 5)),
        pagoRow('b', 50, PaymentMethod.PIX, dia(2026, 3, 5))
      ]);
      expect(r).toEqual({ paymentMethod: PaymentMethod.MISTO, installments: 1 });
    });

    it('[RED] ignora estornado, cancelado e previsto na escolha da forma', () => {
      const r = resolverFormaFinal([
        pagoRow('a', 50, PaymentMethod.DINHEIRO, dia(2026, 2, 5)),
        { ...pagoRow('b', 20, PaymentMethod.PIX, dia(2026, 3, 5)), status: 'estornado' },
        { ...pagoRow('c', 10, PaymentMethod.BOLETO, dia(2026, 3, 6)), status: 'cancelado' },
        previstoRow('d', 20, dia(2026, 12, 10))
      ]);
      expect(r).toEqual({ paymentMethod: PaymentMethod.DINHEIRO, installments: 1 });
    });

    it('[RED] sem nenhum pago devolve null (borda: so previsto)', () => {
      expect(resolverFormaFinal([previstoRow('d', 20, dia(2026, 12, 10))])).toBeNull();
    });

    it('[RED] lista vazia devolve null', () => {
      expect(resolverFormaFinal([])).toBeNull();
    });
  });

  describe('deveConcluir - pedido vira finished', () => {
    it('[RED] status delivered e saldo 0 => true', () => {
      const payments = [pagoRow('a', 100)];
      expect(deveConcluir(pedido({ total: 100, status: 'delivered', payments }), payments)).toBe(true);
    });

    it('[RED] status pending com saldo 0 => false (conclui so depois da entrega)', () => {
      const payments = [pagoRow('a', 100)];
      expect(deveConcluir(pedido({ total: 100, status: 'pending', payments }), payments)).toBe(false);
    });

    it('[RED] status delivered com saldo > 0 => false', () => {
      const payments = [pagoRow('a', 60)];
      expect(deveConcluir(pedido({ total: 100, status: 'delivered', payments }), payments)).toBe(false);
    });

    it('[RED] delivered com saldo 0 em centavos (0.3 pago 0.1 + 0.2) => true', () => {
      const payments = [pagoRow('a', 0.1), pagoRow('b', 0.2)];
      expect(deveConcluir(pedido({ total: 0.3, status: 'delivered', payments }), payments)).toBe(true);
    });
  });

  describe('resumirAgenda - soma da agenda contra o saldo-alvo (centavos)', () => {
    it('[RED] 0.1 + 0.2 contra saldo 0.3 fecha, com diferenca zero (prova-flutuante)', () => {
      const r = resumirAgenda(0.3, [{ amount: 0.1 }, { amount: 0.2 }]);
      expect(r.soma).toBe(0.3);
      expect(r.diferenca).toBe(0);
      expect(r.fecha).toBe(true);
    });

    it('[RED] 3 x 33.33 contra saldo 100 nao fecha e a diferenca e +0.01 (falta)', () => {
      const r = resumirAgenda(100, [{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.33 }]);
      expect(r.soma).toBe(99.99);
      expect(r.diferenca).toBe(0.01);
      expect(r.fecha).toBe(false);
    });

    it('[RED] soma acima do saldo-alvo nao fecha e a diferenca e negativa (excede: 50 + 60 contra 100 = -10)', () => {
      const r = resumirAgenda(100, [{ amount: 50 }, { amount: 60 }]);
      expect(r.soma).toBe(110);
      expect(r.diferenca).toBe(-10);
      expect(r.fecha).toBe(false);
    });

    it('[RED] lista vazia nao fecha, mesmo com saldo-alvo zero (fecha = false)', () => {
      const r = resumirAgenda(0, []);
      expect(r.soma).toBe(0);
      expect(r.diferenca).toBe(0);
      expect(r.fecha).toBe(false);
    });

    it('[RED] linha com amount NaN faz fecha false e a soma conta so as linhas validas', () => {
      const r = resumirAgenda(100, [{ amount: 60 }, { amount: NaN }, { amount: 40 }]);
      expect(r.soma).toBe(100);
      expect(r.fecha).toBe(false);
    });

    it('[RED] linha com amount undefined faz fecha false (nao ignora silenciosamente)', () => {
      const r = resumirAgenda(100, [{ amount: 100 }, { amount: undefined as unknown as number }]);
      expect(r.soma).toBe(100);
      expect(r.fecha).toBe(false);
    });

    it('[RED] linha com amount zero faz fecha false e fica fora da soma', () => {
      const r = resumirAgenda(100, [{ amount: 100 }, { amount: 0 }]);
      expect(r.soma).toBe(100);
      expect(r.fecha).toBe(false);
    });

    it('[RED] linha com amount negativo faz fecha false e fica fora da soma', () => {
      const r = resumirAgenda(100, [{ amount: 110 }, { amount: -10 }]);
      expect(r.soma).toBe(110);
      expect(r.fecha).toBe(false);
    });

    it('[RED] soma exatamente igual ao saldo-alvo (40 + 60 contra 100) fecha', () => {
      const r = resumirAgenda(100, [{ amount: 40 }, { amount: 60 }]);
      expect(r.diferenca).toBe(0);
      expect(r.fecha).toBe(true);
    });
  });

  describe('avaliarNovoTotal - veredito de edicao de total (sem lancar)', () => {
    it('[RED] sem previstas e novoTotal acima do pago: OK com novoSaldo = novoTotal - pago (120 - 60 = 60)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      const r = avaliarNovoTotal(order, 120);
      expect(r.resultado).toBe('OK');
      expect(r.novoSaldo).toBe(60);
    });

    it('[RED] novoTotal menor que o pago: TOTAL_ABAIXO_DO_PAGO (novo 50 com pago 60)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      const r = avaliarNovoTotal(order, 50);
      expect(r.resultado).toBe('TOTAL_ABAIXO_DO_PAGO');
      expect(r.novoSaldo).toBe(-10);
    });

    it('[RED] novoTotal igual ao pago e OK com novoSaldo zero (borda: saldo zera)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      const r = avaliarNovoTotal(order, 60);
      expect(r.resultado).toBe('OK');
      expect(r.novoSaldo).toBe(0);
    });

    it('[RED] novoTotal igual ao pago com previstas existentes: PRECISA_REAJUSTAR (novo saldo 0, previstas somam 40)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 60), previstoRow('p1', 40, dia(2026, 11, 10))]
      });
      const r = avaliarNovoTotal(order, 60);
      expect(r.resultado).toBe('PRECISA_REAJUSTAR');
      expect(r.novoSaldo).toBe(0);
    });

    it('[RED] previstas que nao batem com o novo saldo: PRECISA_REAJUSTAR (novo saldo 80, previstas 60)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const r = avaliarNovoTotal(order, 120);
      expect(r.resultado).toBe('PRECISA_REAJUSTAR');
      expect(r.novoSaldo).toBe(80);
    });

    it('[RED] previstas que batem com o novo saldo (60 = 100 - 40): OK', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      const r = avaliarNovoTotal(order, 100);
      expect(r.resultado).toBe('OK');
      expect(r.novoSaldo).toBe(60);
    });

    it('[RED] pedido finished legado sem payments: pago cheio do total, subir o total e OK (novo 100 sobre 80 = saldo 20)', () => {
      const order = pedido({
        total: 80,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        paymentDate: ts(dia(2026, 3, 1))
      });
      const r = avaliarNovoTotal(order, 100);
      expect(r.resultado).toBe('OK');
      expect(r.novoSaldo).toBe(20);
    });

    it('[RED] pedido finished legado: novo total abaixo do valor cheio derivado lanca TOTAL_ABAIXO_DO_PAGO (70 < 80)', () => {
      const order = pedido({
        total: 80,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        paymentDate: ts(dia(2026, 3, 1))
      });
      expect(avaliarNovoTotal(order, 70).resultado).toBe('TOTAL_ABAIXO_DO_PAGO');
    });

    it('[RED] pedido pending sem payments: OK com novoSaldo igual ao novo total (50, pago 0)', () => {
      const r = avaliarNovoTotal(pedido({ total: 100, status: 'pending' }), 50);
      expect(r.resultado).toBe('OK');
      expect(r.novoSaldo).toBe(50);
    });
  });

  describe('avaliarNovoTotal - coerente com validarNovoTotal (mesmos dados)', () => {
    /** Codigo do erro lancado, ou undefined quando nao lanca. Erro que nao e PagamentoInvalidoError propaga. */
    const codigoDe = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (e) {
        if (e instanceof PagamentoInvalidoError) {
          return e.codigo;
        }
        throw e;
      }
    };

    it('[RED] OK <=> validarNovoTotal nao lanca (previstas 60 fechando o novo saldo 60 de total 100)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      expect(avaliarNovoTotal(order, 100).resultado).toBe('OK');
      expect(codigoDe(() => validarNovoTotal(order, 100, undefined, novoGerador()))).toBeUndefined();
    });

    it('[RED] TOTAL_ABAIXO_DO_PAGO <=> validarNovoTotal lanca TOTAL_ABAIXO_DO_PAGO (novo 50 com pago 60)', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 60)] });
      expect(avaliarNovoTotal(order, 50).resultado).toBe('TOTAL_ABAIXO_DO_PAGO');
      expect(codigoDe(() => validarNovoTotal(order, 50, undefined, novoGerador())))
        .toBe('TOTAL_ABAIXO_DO_PAGO');
    });

    it('[RED] PRECISA_REAJUSTAR <=> validarNovoTotal lanca PARCELAS_NAO_REAJUSTADAS (novo saldo 80, previstas 60)', () => {
      const order = pedido({
        total: 100,
        payments: [pagoRow('a', 40), previstoRow('p1', 60, dia(2026, 11, 10))]
      });
      expect(avaliarNovoTotal(order, 120).resultado).toBe('PRECISA_REAJUSTAR');
      expect(codigoDe(() => validarNovoTotal(order, 120, undefined, novoGerador())))
        .toBe('PARCELAS_NAO_REAJUSTADAS');
    });
  });

  describe('listarPrevistas - parcelas previstas do pedido', () => {
    it('[RED] devolve so previsto, por dueDate crescente (nao pela ordem do array)', () => {
      const order = pedido({
        total: 100,
        payments: [
          previstoRow('p-dez', 30, dia(2026, 12, 10)),
          pagoRow('a', 40),
          previstoRow('p-nov', 30, dia(2026, 11, 10))
        ]
      });
      expect(listarPrevistas(order).map(p => p.id)).toEqual(['p-nov', 'p-dez']);
    });

    it('[RED] ignora pago, cancelado e estornado (so a prevista entra)', () => {
      const order = pedido({
        total: 100,
        payments: [
          pagoRow('a', 40),
          { ...previstoRow('b', 10, dia(2026, 10, 25)), status: 'cancelado' },
          { ...previstoRow('c', 10, dia(2026, 10, 26)), status: 'estornado' },
          previstoRow('d', 60, dia(2026, 11, 10))
        ]
      });
      expect(listarPrevistas(order).map(p => p.id)).toEqual(['d']);
    });

    it('[RED] sem nenhuma previsto devolve lista vazia', () => {
      expect(listarPrevistas(pedido({ total: 100, payments: [pagoRow('a', 100)] }))).toEqual([]);
    });

    it('[RED] pedido sem payments devolve lista vazia', () => {
      expect(listarPrevistas(pedido({ total: 100 }))).toEqual([]);
    });
  });

  describe('proximaPrevista - menor dueDate entre as previstas', () => {
    it('[RED] devolve a previsto de menor dueDate (nao a primeira do array)', () => {
      const order = pedido({
        total: 100,
        payments: [previstoRow('p-dez', 30, dia(2026, 12, 10)), previstoRow('p-nov', 70, dia(2026, 11, 10))]
      });
      expect(proximaPrevista(order)!.id).toBe('p-nov');
    });

    it('[RED] ignora previstas canceladas ao escolher a proxima (Nov cancelada: proxima e Dez)', () => {
      const order = pedido({
        total: 100,
        payments: [
          { ...previstoRow('p-nov', 30, dia(2026, 11, 10)), status: 'cancelado' },
          previstoRow('p-dez', 70, dia(2026, 12, 10))
        ]
      });
      expect(proximaPrevista(order)!.id).toBe('p-dez');
    });

    it('[RED] undefined quando nao ha previstas', () => {
      expect(proximaPrevista(pedido({ total: 100, payments: [pagoRow('a', 100)] }))).toBeUndefined();
    });
  });

  describe('valorDePagamentoValido - valor dentro de (0, saldo]', () => {
    it('[RED] true quando o valor e igual ao saldo (100 com saldo 100)', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), 100)).toBe(true);
    });

    it('[RED] true para valor parcial menor que o saldo (40 com saldo 100)', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), 40)).toBe(true);
    });

    it('[RED] false para zero', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), 0)).toBe(false);
    });

    it('[RED] false para negativo (-5)', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), -5)).toBe(false);
    });

    it('[RED] false para NaN', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), NaN)).toBe(false);
    });

    it('[RED] false quando passa do saldo (100.01 com saldo 100)', () => {
      expect(valorDePagamentoValido(pedido({ total: 100 }), 100.01)).toBe(false);
    });

    it('[RED] saldo desconta o pago: com total 100 e pago 40, 60 e valido e 60.01 nao', () => {
      const order = pedido({ total: 100, payments: [pagoRow('a', 40)] });
      expect(valorDePagamentoValido(order, 60)).toBe(true);
      expect(valorDePagamentoValido(order, 60.01)).toBe(false);
    });

    it('[RED] centavos: saldo 0.3 aceita 0.1 + 0.2 (prova-flutuante)', () => {
      expect(valorDePagamentoValido(pedido({ total: 0.3 }), 0.1 + 0.2)).toBe(true);
    });

    it('[RED] pedido finished legado tem saldo zero: qualquer valor positivo e false', () => {
      const order = pedido({
        total: 80,
        status: 'finished',
        paymentMethod: PaymentMethod.PIX,
        paymentDate: ts(dia(2026, 3, 1))
      });
      expect(valorDePagamentoValido(order, 1)).toBe(false);
    });
  });

  describe('calcularTotalDoPedido - total = itens + frete', () => {
    const linhaItem = (priceAtSale: number, quantity: number, soldByWeight?: boolean): OrderItem => ({
      idProduct: 'prod-1',
      productName: 'Produto',
      quantity,
      priceAtSale,
      priceAtCost: 0,
      ...(soldByWeight !== undefined ? { soldByWeight } : {})
    });

    it('[RED] soma priceAtSale x quantity dos itens e adiciona o frete (21 + 15 + frete 10 = 46)', () => {
      const r = calcularTotalDoPedido(
        [linhaItem(10.5, 2), linhaItem(5, 3)],
        10
      );
      expect(r.itemsTotal).toBe(36);
      expect(r.total).toBe(46);
    });

    it('[RED] item soldByWeight usa preco por kg x peso com arredondamento (19.99 x 1.5 kg = 29.99)', () => {
      const r = calcularTotalDoPedido([linhaItem(19.99, 1.5, true)], 0);
      expect(r.itemsTotal).toBe(29.99);
      expect(r.total).toBe(29.99);
    });

    it('[RED] centavos: 0.1 x 3 fecha em 0.3 exato, sem ruido de ponto flutuante', () => {
      const r = calcularTotalDoPedido([linhaItem(0.1, 3)], 0);
      expect(r.itemsTotal).toBe(0.3);
      expect(r.total).toBe(0.3);
    });

    it('[RED] frete undefined conta como zero (total = itens)', () => {
      const r = calcularTotalDoPedido([linhaItem(10.5, 2), linhaItem(5, 3)], undefined as unknown as number);
      expect(r.total).toBe(36);
    });

    it('[RED] frete NaN conta como zero (total = itens)', () => {
      const r = calcularTotalDoPedido([linhaItem(10.5, 2), linhaItem(5, 3)], NaN);
      expect(r.total).toBe(36);
    });

    it('[RED] sem itens: itemsTotal zero e total = frete (12)', () => {
      const r = calcularTotalDoPedido([], 12);
      expect(r.itemsTotal).toBe(0);
      expect(r.total).toBe(12);
    });
  });
});
