import { Timestamp } from '@angular/fire/firestore';
import { Order } from '../../models/order-model';
import { RecurringOrder } from '../../models/recurring-order-model';
import { PaymentMethod } from '../../models/sell-model';
import { calcularTotalDoPedido } from '../order-service/order-payment-rules';
import { AgendaDeRecorrencia, RecorrenciaInvalidaError } from './recurrence-rules';
import {
  NovoPedidoRecorrente,
  ProdutoAtual,
  ResultadoOcorrencia,
  montarModeloDoPedido,
  montarPedidoDaOcorrencia
} from './recurring-order-build-rules';

/**
 * Regra critica (regra-de-negocio.md secao 5.4): montagem do modelo recorrente
 * e do pedido de cada ocorrencia. Puro: sem Firestore, sem HTTP.
 */

const EMPRESA = 'empresa-1';
const ts = (data: Date): Timestamp => Timestamp.fromDate(data);

function pedidoOrigem(overrides: Partial<Order> = {}): Order {
  return {
    id: 'pedido-origem',
    companyId: EMPRESA,
    orderNumber: 42,
    customerId: 'cliente-7',
    customerName: 'Maria Souza',
    customerPhone: '11999990000',
    items: [
      { idProduct: 'p-unit', productName: 'Pao frances', quantity: 3, priceAtSale: 1.5, priceAtCost: 0.7 },
      {
        idProduct: 'p-peso', productName: 'Queijo Minas', quantity: 1.5,
        priceAtSale: 19.99, priceAtCost: 12, soldByWeight: true
      }
    ],
    itemsTotal: 34.49,
    shippingCost: 5,
    total: 39.49,
    deliveryType: 'delivery',
    address: 'Rua A, 10',
    addressLat: -23.5,
    addressLng: -46.6,
    observations: 'Sem cebola',
    vendedorId: 'v-1',
    vendedorName: 'Joao',
    status: 'delivered',
    createdAt: ts(new Date(2026, 9, 1)),
    scheduledDate: ts(new Date(2026, 9, 15)),
    payments: [
      {
        id: 'pg-1', amount: 39.49, method: PaymentMethod.DINHEIRO, installments: 1,
        paidDate: ts(new Date(2026, 9, 15)), status: 'pago'
      }
    ],
    ...overrides
  };
}

function modeloRecorrente(overrides: Partial<RecurringOrder> = {}): RecurringOrder {
  return {
    id: 'rec-1',
    companyId: EMPRESA,
    sourceOrderId: 'pedido-origem',
    status: 'active',
    frequency: 'weekly',
    startDate: '2026-10-22',
    generateFrom: '2026-10-22',
    customerId: 'cliente-7',
    customerName: 'Maria Souza',
    customerPhone: '11999990000',
    items: [
      { idProduct: 'p-unit', productName: 'Pao frances', quantity: 3 },
      { idProduct: 'p-peso', productName: 'Queijo Minas', quantity: 1.5, soldByWeight: true }
    ],
    shippingCost: 5,
    deliveryType: 'delivery',
    address: 'Rua A, 10',
    addressLat: -23.5,
    addressLng: -46.6,
    observations: 'Sem cebola',
    vendedorId: 'v-1',
    vendedorName: 'Joao',
    createdAt: ts(new Date(2026, 9, 1)),
    ...overrides
  };
}

function produtosAtuais(): Map<string, ProdutoAtual> {
  return new Map<string, ProdutoAtual>([
    ['p-unit', { id: 'p-unit', companyId: EMPRESA, title: 'Pao frances', sellPrice: 2, buyPrice: 0.9 }],
    [
      'p-peso',
      {
        id: 'p-peso', companyId: EMPRESA, title: 'Queijo Minas',
        sellPrice: 19.99, buyPrice: 13.5, soldByWeight: true
      }
    ]
  ]);
}

/** Copia do objeto sem as chaves informadas (ausencia de chave, nao valor undefined). */
function semChaves<T extends object>(objeto: T, chaves: (keyof T & string)[]): T {
  const copia = { ...objeto };
  for (const chave of chaves) {
    delete copia[chave];
  }
  return copia;
}

/** Devolve o pedido quando ok:true; falha explicita caso contrario. */
function pedidoDeResultadoOk(resultado: ResultadoOcorrencia): NovoPedidoRecorrente {
  if (!resultado.ok) {
    throw new Error(`esperava ok:true, veio problema ${resultado.problema.code}: ${resultado.problema.detail}`);
  }
  return resultado.pedido;
}

/** Devolve o problema quando ok:false; falha explicita caso contrario. */
function problemaDeResultadoFalho(resultado: ResultadoOcorrencia) {
  if (resultado.ok) {
    throw new Error('esperava ok:false, veio pedido gerado');
  }
  return resultado.problema;
}

/** Codigo do RecorrenciaInvalidaError lancado, ou 'NENHUM_ERRO' se nada for lancado. */
function codigoDoErro(fn: () => unknown): string {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof RecorrenciaInvalidaError) {
      return erro.codigo;
    }
    throw erro;
  }
  return 'NENHUM_ERRO';
}

describe('montarModeloDoPedido', () => {
  const agendaSemanal: AgendaDeRecorrencia = { frequency: 'weekly', startDate: '2026-10-22' };

  it('copia a agenda, marca status active e define generateFrom igual ao startDate', () => {
    const agenda: AgendaDeRecorrencia = {
      frequency: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-10-22', endDate: '2026-12-31'
    };

    const modelo = montarModeloDoPedido(pedidoOrigem(), agenda);

    expect(modelo.status).toBe('active');
    expect(modelo.frequency).toBe('weekdays');
    expect(modelo.weekdays).toEqual([1, 3, 5]);
    expect(modelo.startDate).toBe('2026-10-22');
    expect(modelo.endDate).toBe('2026-12-31');
    expect(modelo.generateFrom).toBe('2026-10-22');
    expect(modelo.sourceOrderId).toBe('pedido-origem');
  });

  it('itens do modelo nao carregam priceAtSale nem priceAtCost e mantem soldByWeight quando houver', () => {
    const modelo = montarModeloDoPedido(pedidoOrigem(), agendaSemanal);

    const [unitario, porPeso] = modelo.items;
    expect(unitario.idProduct).toBe('p-unit');
    expect(unitario.productName).toBe('Pao frances');
    expect(unitario.quantity).toBe(3);
    expect('priceAtSale' in unitario).toBe(false);
    expect('priceAtCost' in unitario).toBe(false);
    expect('soldByWeight' in unitario).toBe(false);

    expect(porPeso.idProduct).toBe('p-peso');
    expect(porPeso.quantity).toBe(1.5);
    expect(porPeso.soldByWeight).toBe(true);
    expect('priceAtSale' in porPeso).toBe(false);
    expect('priceAtCost' in porPeso).toBe(false);
  });

  it('nao copia payments, total, itemsTotal nem o status do pedido de origem', () => {
    const modelo = montarModeloDoPedido(pedidoOrigem({ status: 'delivered' }), agendaSemanal);

    expect('payments' in modelo).toBe(false);
    expect('total' in modelo).toBe(false);
    expect('itemsTotal' in modelo).toBe(false);
    expect(modelo.status).toBe('active');
  });

  it('copia cliente, telefone, frete, tipo de entrega, endereco, coordenadas, observacoes e vendedor', () => {
    const modelo = montarModeloDoPedido(pedidoOrigem(), agendaSemanal);

    expect(modelo.customerId).toBe('cliente-7');
    expect(modelo.customerName).toBe('Maria Souza');
    expect(modelo.customerPhone).toBe('11999990000');
    expect(modelo.shippingCost).toBe(5);
    expect(modelo.deliveryType).toBe('delivery');
    expect(modelo.address).toBe('Rua A, 10');
    expect(modelo.addressLat).toBe(-23.5);
    expect(modelo.addressLng).toBe(-46.6);
    expect(modelo.observations).toBe('Sem cebola');
    expect(modelo.vendedorId).toBe('v-1');
    expect(modelo.vendedorName).toBe('Joao');
  });

  it('campos opcionais ausentes ficam sem chave, nunca como undefined (Firestore rejeita undefined)', () => {
    const pedidoSemOpcionais = semChaves(pedidoOrigem(), [
      'customerId', 'customerPhone', 'address', 'addressLat', 'addressLng',
      'observations', 'vendedorId', 'vendedorName'
    ]);

    const modelo = montarModeloDoPedido(pedidoSemOpcionais, agendaSemanal);

    const chaves = Object.keys(modelo);
    for (const campo of [
      'customerId', 'customerPhone', 'address', 'addressLat', 'addressLng',
      'observations', 'vendedorId', 'vendedorName', 'weekdays', 'endDate'
    ]) {
      expect(chaves).not.toContain(campo);
    }
    expect(Object.values(modelo) as unknown[]).not.toContain(undefined);
  });

  it('endDate igual ao startDate e valido, pois o fim e inclusivo', () => {
    const agenda: AgendaDeRecorrencia = {
      frequency: 'weekly', startDate: '2026-10-22', endDate: '2026-10-22'
    };

    const modelo = montarModeloDoPedido(pedidoOrigem(), agenda);

    expect(modelo.endDate).toBe('2026-10-22');
  });

  it('frequency fora do enum lanca RecorrenciaInvalidaError FREQUENCIA_INVALIDA', () => {
    const agendaInvalida = { frequency: 'daily', startDate: '2026-10-22' } as unknown as AgendaDeRecorrencia;

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoOrigem(), agendaInvalida)))
      .toBe('FREQUENCIA_INVALIDA');
  });

  it('weekdays informado em frequency diferente de weekdays lanca DIAS_DA_SEMANA_INVALIDOS', () => {
    const agendaInvalida: AgendaDeRecorrencia = {
      frequency: 'weekly', startDate: '2026-10-22', weekdays: [1]
    };

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoOrigem(), agendaInvalida)))
      .toBe('DIAS_DA_SEMANA_INVALIDOS');
  });

  it('frequency weekdays com lista vazia lanca DIAS_DA_SEMANA_INVALIDOS', () => {
    const agendaInvalida: AgendaDeRecorrencia = {
      frequency: 'weekdays', startDate: '2026-10-22', weekdays: []
    };

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoOrigem(), agendaInvalida)))
      .toBe('DIAS_DA_SEMANA_INVALIDOS');
  });

  it('endDate anterior ao startDate lanca FIM_ANTES_DO_INICIO', () => {
    const agendaInvalida: AgendaDeRecorrencia = {
      frequency: 'weekly', startDate: '2026-10-22', endDate: '2026-10-21'
    };

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoOrigem(), agendaInvalida)))
      .toBe('FIM_ANTES_DO_INICIO');
  });

  it('data civil inexistente (2026-02-30) lanca DATA_INVALIDA', () => {
    const agendaInvalida: AgendaDeRecorrencia = { frequency: 'weekly', startDate: '2026-02-30' };

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoOrigem(), agendaInvalida)))
      .toBe('DATA_INVALIDA');
  });

  it('pedido sem id gera modelo sem a chave sourceOrderId', () => {
    const pedidoSemId = semChaves(pedidoOrigem(), ['id']);

    const modelo = montarModeloDoPedido(pedidoSemId, agendaSemanal);

    expect(Object.keys(modelo)).not.toContain('sourceOrderId');
  });

  it('pedido sem itens lanca RecorrenciaInvalidaError ITENS_INVALIDOS', () => {
    const pedidoVazio = pedidoOrigem({ items: [] });

    expect(codigoDoErro(() => montarModeloDoPedido(pedidoVazio, agendaSemanal)))
      .toBe('ITENS_INVALIDOS');
  });

  it('item com quantity 0, negativa ou NaN lanca RecorrenciaInvalidaError ITENS_INVALIDOS', () => {
    const itemComQuantidade = (quantity: number) => pedidoOrigem({
      items: [{ idProduct: 'p-unit', productName: 'Pao frances', quantity, priceAtSale: 1.5, priceAtCost: 0.7 }]
    });

    expect(codigoDoErro(() => montarModeloDoPedido(itemComQuantidade(0), agendaSemanal)))
      .toBe('ITENS_INVALIDOS');
    expect(codigoDoErro(() => montarModeloDoPedido(itemComQuantidade(-1), agendaSemanal)))
      .toBe('ITENS_INVALIDOS');
    expect(codigoDoErro(() => montarModeloDoPedido(itemComQuantidade(NaN), agendaSemanal)))
      .toBe('ITENS_INVALIDOS');
  });
});

describe('montarPedidoDaOcorrencia', () => {
  it('retorna ok:true com status pending', () => {
    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais());

    expect(resultado.ok).toBe(true);
    expect(pedidoDeResultadoOk(resultado).status).toBe('pending');
  });

  it('preenche recurringOrderId com o id do modelo e occurrenceDate com a data da ocorrencia', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    expect(pedido.recurringOrderId).toBe('rec-1');
    expect(pedido.occurrenceDate).toBe('2026-10-22');
  });

  it('scheduledDate e a meia-noite local da data da ocorrencia', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    expect(pedido.scheduledDate?.toDate()).toEqual(new Date(2026, 9, 22, 0, 0, 0, 0));
  });

  it('nasce sem payments, mesmo que o modelo traga qualquer coisa parecida', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    expect('payments' in pedido).toBe(false);
  });

  it('itens recebem priceAtSale e priceAtCost atuais do produto (sellPrice e buyPrice)', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    const unitario = pedido.items[0];
    expect(unitario.idProduct).toBe('p-unit');
    expect(unitario.quantity).toBe(3);
    expect(unitario.priceAtSale).toBe(2);
    expect(unitario.priceAtCost).toBe(0.9);
  });

  it('item por peso: soldByWeight true e total pela formula de peso (19.99 x 1.5 = 29.99)', () => {
    const modeloSoPeso = modeloRecorrente({
      items: [{ idProduct: 'p-peso', productName: 'Queijo Minas', quantity: 1.5, soldByWeight: true }],
      shippingCost: 0
    });

    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloSoPeso, '2026-10-22', produtosAtuais())
    );

    const porPeso = pedido.items[0];
    expect(porPeso.soldByWeight).toBe(true);
    expect(porPeso.quantity).toBe(1.5);
    expect(porPeso.priceAtSale).toBe(19.99);
    expect(pedido.itemsTotal).toBeCloseTo(29.99, 2);
    expect(pedido.total).toBeCloseTo(29.99, 2);
  });

  it('itemsTotal e total (itens + frete) batem com calcularTotalDoPedido', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    const esperado = calcularTotalDoPedido(pedido.items, pedido.shippingCost);
    expect(pedido.itemsTotal).toBeCloseTo(esperado.itemsTotal, 2);
    expect(pedido.total).toBeCloseTo(esperado.total, 2);
    expect(pedido.itemsTotal).toBeCloseTo(35.99, 2);
    expect(pedido.total).toBeCloseTo(40.99, 2);
  });

  it('cliente, endereco, frete, tipo de entrega, observacoes e vendedor vem do modelo', () => {
    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosAtuais())
    );

    expect(pedido.customerId).toBe('cliente-7');
    expect(pedido.customerName).toBe('Maria Souza');
    expect(pedido.customerPhone).toBe('11999990000');
    expect(pedido.address).toBe('Rua A, 10');
    expect(pedido.addressLat).toBe(-23.5);
    expect(pedido.addressLng).toBe(-46.6);
    expect(pedido.deliveryType).toBe('delivery');
    expect(pedido.shippingCost).toBe(5);
    expect(pedido.observations).toBe('Sem cebola');
    expect(pedido.vendedorId).toBe('v-1');
    expect(pedido.vendedorName).toBe('Joao');
  });

  it('campos opcionais ausentes no modelo ficam sem chave no pedido gerado', () => {
    const modeloSemOpcionais = semChaves(modeloRecorrente(), [
      'customerId', 'customerPhone', 'address', 'addressLat', 'addressLng',
      'observations', 'vendedorId', 'vendedorName'
    ]);

    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloSemOpcionais, '2026-10-22', produtosAtuais())
    );

    const chaves = Object.keys(pedido);
    for (const campo of [
      'customerId', 'customerPhone', 'address', 'addressLat', 'addressLng',
      'observations', 'vendedorId', 'vendedorName'
    ]) {
      expect(chaves).not.toContain(campo);
    }
    expect(Object.values(pedido) as unknown[]).not.toContain(undefined);
  });

  it('produto ausente do Map gera ok:false com PRODUTO_INDISPONIVEL citando o produto', () => {
    const produtosSemPeso = new Map<string, ProdutoAtual>([
      ['p-unit', { id: 'p-unit', companyId: EMPRESA, title: 'Pao frances', sellPrice: 2, buyPrice: 0.9 }]
    ]);

    const problema = problemaDeResultadoFalho(
      montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosSemPeso)
    );

    expect(problema.code).toBe('PRODUTO_INDISPONIVEL');
    expect(problema.detail).toContain('Queijo Minas');
  });

  it('produto de outra empresa gera ok:false com PRODUTO_INDISPONIVEL', () => {
    const produtosOutraEmpresa = produtosAtuais();
    produtosOutraEmpresa.set('p-unit', {
      id: 'p-unit', companyId: 'empresa-2', title: 'Pao frances', sellPrice: 2, buyPrice: 0.9
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosOutraEmpresa);

    expect(resultado.ok).toBe(false);
    expect(problemaDeResultadoFalho(resultado).code).toBe('PRODUTO_INDISPONIVEL');
  });

  it('sellPrice NaN em item unitario gera ok:false', () => {
    const produtosNaN = produtosAtuais();
    produtosNaN.set('p-unit', {
      id: 'p-unit', companyId: EMPRESA, title: 'Pao frances', sellPrice: NaN, buyPrice: 0.9
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosNaN);

    expect(resultado.ok).toBe(false);
  });

  it('sellPrice Infinity em item por peso gera ok:false', () => {
    const produtosInfinito = produtosAtuais();
    produtosInfinito.set('p-peso', {
      id: 'p-peso', companyId: EMPRESA, title: 'Queijo Minas',
      sellPrice: Infinity, buyPrice: 13.5, soldByWeight: true
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosInfinito);

    expect(resultado.ok).toBe(false);
  });

  it('um item invalido entre varios validos pula a ocorrencia inteira (sem pedido)', () => {
    const produtosUmRuim = produtosAtuais();
    produtosUmRuim.set('p-peso', {
      id: 'p-peso', companyId: EMPRESA, title: 'Queijo Minas',
      sellPrice: NaN, buyPrice: 13.5, soldByWeight: true
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosUmRuim);

    expect(resultado.ok).toBe(false);
    expect('pedido' in resultado).toBe(false);
    expect(problemaDeResultadoFalho(resultado).code).toBe('PRODUTO_INDISPONIVEL');
  });

  it('productName do item gerado vem do produto atual, nao do snapshot do modelo', () => {
    const modeloNomeAntigo = modeloRecorrente({
      items: [{ idProduct: 'p-peso', productName: 'Nome antigo', quantity: 1.5, soldByWeight: true }]
    });

    const pedido = pedidoDeResultadoOk(
      montarPedidoDaOcorrencia(modeloNomeAntigo, '2026-10-22', produtosAtuais())
    );

    expect(pedido.items[0].productName).toBe('Queijo Minas');
  });

  it('soldByWeight do modelo true e produto atual sem peso gera ok:false PRODUTO_INDISPONIVEL', () => {
    const modeloComPesoIndevido = modeloRecorrente({
      items: [{ idProduct: 'p-unit', productName: 'Pao frances', quantity: 3, soldByWeight: true }]
    });

    const problema = problemaDeResultadoFalho(
      montarPedidoDaOcorrencia(modeloComPesoIndevido, '2026-10-22', produtosAtuais())
    );

    expect(problema.code).toBe('PRODUTO_INDISPONIVEL');
  });

  it('soldByWeight ausente no modelo e produto atual por peso gera ok:false PRODUTO_INDISPONIVEL', () => {
    const modeloSemPeso = modeloRecorrente({
      items: [{ idProduct: 'p-peso', productName: 'Queijo Minas', quantity: 1.5 }]
    });

    const problema = problemaDeResultadoFalho(
      montarPedidoDaOcorrencia(modeloSemPeso, '2026-10-22', produtosAtuais())
    );

    expect(problema.code).toBe('PRODUTO_INDISPONIVEL');
  });

  it('sellPrice negativo em item unitario gera ok:false', () => {
    const produtosNegativo = produtosAtuais();
    produtosNegativo.set('p-unit', {
      id: 'p-unit', companyId: EMPRESA, title: 'Pao frances', sellPrice: -2, buyPrice: 0.9
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosNegativo);

    expect(resultado.ok).toBe(false);
  });

  it('sellPrice negativo em item por peso gera ok:false', () => {
    const produtosNegativo = produtosAtuais();
    produtosNegativo.set('p-peso', {
      id: 'p-peso', companyId: EMPRESA, title: 'Queijo Minas',
      sellPrice: -19.99, buyPrice: 13.5, soldByWeight: true
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosNegativo);

    expect(resultado.ok).toBe(false);
  });

  it('sellPrice 0 e aceito: ok:true com priceAtSale 0', () => {
    const produtosGratis = produtosAtuais();
    produtosGratis.set('p-unit', {
      id: 'p-unit', companyId: EMPRESA, title: 'Pao frances', sellPrice: 0, buyPrice: 0.9
    });

    const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtosGratis);

    expect(resultado.ok).toBe(true);
    expect(pedidoDeResultadoOk(resultado).items[0].priceAtSale).toBe(0);
  });

  describe('buyPrice (custo) invalido', () => {
    /** Mapa de produtos atuais com o buyPrice do produto informado trocado. */
    function produtosComCusto(idProduto: string, buyPrice: number): Map<string, ProdutoAtual> {
      const mapa = produtosAtuais();
      const atual = mapa.get(idProduto) as ProdutoAtual;
      mapa.set(idProduto, { ...atual, buyPrice });
      return mapa;
    }

    /** Esperado: ok:false PRODUTO_INDISPONIVEL, sem chave pedido. */
    function esperaCustoInvalido(produtos: Map<string, ProdutoAtual>): void {
      const resultado = montarPedidoDaOcorrencia(modeloRecorrente(), '2026-10-22', produtos);

      expect(resultado.ok).toBe(false);
      expect('pedido' in resultado).toBe(false);
      expect(problemaDeResultadoFalho(resultado).code).toBe('PRODUTO_INDISPONIVEL');
    }

    it('buyPrice NaN em item unitario gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-unit', NaN));
    });

    it('buyPrice NaN em item por peso gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-peso', NaN));
    });

    it('buyPrice Infinity em item unitario gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-unit', Infinity));
    });

    it('buyPrice Infinity em item por peso gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-peso', Infinity));
    });

    it('buyPrice ausente (undefined) em item unitario gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-unit', undefined as unknown as number));
    });

    it('buyPrice ausente (undefined) em item por peso gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-peso', undefined as unknown as number));
    });

    it('buyPrice negativo em item unitario gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-unit', -0.9));
    });

    it('buyPrice negativo em item por peso gera ok:false PRODUTO_INDISPONIVEL sem pedido', () => {
      esperaCustoInvalido(produtosComCusto('p-peso', -13.5));
    });

    it('buyPrice 0 em item unitario e aceito: ok:true com priceAtCost 0', () => {
      const resultado = montarPedidoDaOcorrencia(
        modeloRecorrente(), '2026-10-22', produtosComCusto('p-unit', 0)
      );

      expect(resultado.ok).toBe(true);
      expect(pedidoDeResultadoOk(resultado).items[0].priceAtCost).toBe(0);
    });

    it('buyPrice 0 em item por peso e aceito: ok:true com priceAtCost 0', () => {
      const resultado = montarPedidoDaOcorrencia(
        modeloRecorrente(), '2026-10-22', produtosComCusto('p-peso', 0)
      );

      expect(resultado.ok).toBe(true);
      expect(pedidoDeResultadoOk(resultado).items[1].priceAtCost).toBe(0);
    });
  });
});
