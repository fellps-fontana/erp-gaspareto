import { Timestamp } from '@angular/fire/firestore';
import { PaymentMethod, SaleItem } from '../../models/sell-model';
import {
  agruparPorCliente,
  calcularCards,
  custoDoItem,
  dataDaVenda,
  DetalheFaturamento,
  fatiasPorProduto,
  filtrarVendas,
  filtroSomentePeriodo,
  FiltroRelatorio,
  itemEhPorPeso,
  LinhaCliente,
  LinhaCmv,
  LinhaLucro,
  listarVendas,
  LIMITE_TOP,
  modoDetalheFaturamento,
  modoTopEfetivo,
  montarDetalheCmv,
  montarDetalheFaturamento,
  montarDetalheLucro,
  NomesClientes,
  ItemRanking,
  ProdutoRef,
  ProdutosPorId,
  rankingTopQuantidade,
  RankingQuantidade,
  ROTULO_BALCAO,
  ROTULO_CLIENTE_NAO_ENCONTRADO,
  ROTULO_FORMA_PENDENTE,
  ROTULO_OUTROS,
  ROTULO_PRODUTO_SEM_NOME,
  ROTULO_SEM_CLIENTE,
  serieDiaria,
  somarQuantidadeDoProduto,
  valorDoItem,
  VendaFiltrada,
  VendaRelatorio
} from './sale-report-rules';

// ---------- builders ----------

// Mes 1-based para legibilidade. Horario local (new Date(ano, mes, dia, h, m)).
const dia = (ano: number, mes: number, d: number, h = 0, m = 0): Date =>
  new Date(ano, mes - 1, d, h, m);
const ts = (d: Date): Timestamp => Timestamp.fromDate(d);

const INICIO = dia(2026, 10, 1);
const FIM = dia(2026, 10, 31, 23, 59);
const DATA_PADRAO = dia(2026, 10, 10, 12, 0);

const PRODUTOS: ProdutosPorId = new Map<string, ProdutoRef>([
  ['p-pizza', { title: 'Pizza', soldByWeight: false }],
  ['p-refri', { title: 'Refrigerante', soldByWeight: false }],
  ['p-queijo', { title: 'Queijo', soldByWeight: true }]
]);

const CLIENTES: NomesClientes = new Map<string, string>([
  ['cli-ana', 'Ana Souza'],
  ['cli-bruno', 'Bruno Lima']
]);

function item(over: Partial<SaleItem> = {}): SaleItem {
  return {
    idProduct: 'p-pizza',
    productName: 'Pizza',
    quantity: 1,
    priceAtSale: 10,
    priceAtCost: 4,
    ...over
  };
}

function venda(over: Partial<VendaRelatorio> = {}): VendaRelatorio {
  return {
    id: 'v1',
    companyId: 'empresa-1',
    total: 0,
    date: DATA_PADRAO,
    items: [item()],
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.DINHEIRO,
    status: 'completed',
    ...over
  };
}

function filtro(over: Partial<FiltroRelatorio> = {}): FiltroRelatorio {
  return {
    inicio: INICIO,
    fim: FIM,
    produtoId: '',
    origem: 'todos',
    clienteId: '',
    formaPagamento: 'todos',
    ...over
  };
}

/**
 * VendaFiltrada montada a mao para testar as funcoes downstream de forma isolada.
 * valor/custo saem da soma simples dos itens; os fixtures usam valores exatos (sem centavos
 * quebrados), para que a asercao nao dependa da regra de arredondamento.
 */
function vf(id: string, itens: SaleItem[], extra: Partial<VendaRelatorio> = {}): VendaFiltrada {
  const v = venda({ id, items: itens, ...extra });
  return {
    venda: v,
    data: v.date,
    itens,
    valor: itens.reduce((soma, i) => soma + i.priceAtSale * i.quantity, 0),
    custo: itens.reduce((soma, i) => soma + (i.priceAtCost || 0) * i.quantity, 0)
  };
}

/** Cenario misto: PDV, pedido com cliente, pedido sem cliente, peso 3 casas, custos fracionados,
 *  custo 0, valores 0.1/0.2 e uma venda cancelada (que deve sair do filtro). */
function cenarioMisto(): VendaRelatorio[] {
  return [
    venda({
      id: 'pdv-1',
      sale_type: 'pdv',
      date: dia(2026, 10, 5, 10, 0),
      paymentMethod: PaymentMethod.DINHEIRO,
      items: [
        item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 3, priceAtSale: 19.99, priceAtCost: 7.33 }),
        item({ idProduct: 'p-refri', productName: 'Refrigerante', quantity: 2, priceAtSale: 0.1, priceAtCost: 0.2 })
      ]
    }),
    venda({
      id: 'ped-ana',
      sale_type: 'order',
      customerId: 'cli-ana',
      date: dia(2026, 10, 6, 18, 30),
      paymentMethod: PaymentMethod.PIX,
      items: [
        item({
          idProduct: 'p-queijo',
          productName: 'Queijo',
          quantity: 0.333,
          priceAtSale: 45.5,
          priceAtCost: 12.1,
          soldByWeight: true
        }),
        item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 1, priceAtSale: 19.99, priceAtCost: 0 })
      ]
    }),
    venda({
      id: 'ped-sem-cliente',
      sale_type: 'order',
      date: dia(2026, 10, 7, 9, 15),
      paymentMethod: PaymentMethod.CARTAO,
      items: [
        item({ idProduct: 'p-refri', productName: 'Refrigerante', quantity: 1, priceAtSale: 0.2, priceAtCost: 0.1 }),
        item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 2, priceAtSale: 17.3, priceAtCost: 6.17 })
      ]
    }),
    venda({
      id: 'ped-bruno',
      sale_type: 'order',
      customerId: 'cli-bruno',
      date: dia(2026, 10, 8, 14, 0),
      paymentMethod: PaymentMethod.PIX,
      items: [
        item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 1, priceAtSale: 33.33, priceAtCost: 9.99 })
      ]
    }),
    venda({
      id: 'ped-cancelado',
      sale_type: 'order',
      customerId: 'cli-bruno',
      status: 'canceled',
      date: dia(2026, 10, 7, 11, 0),
      items: [item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 5, priceAtSale: 99.99, priceAtCost: 50 })]
    })
  ];
}

// ---------- helpers de asercao ----------

const ids = (vendas: VendaFiltrada[]): string[] => vendas.map(v => v.venda.id ?? '');

/** Soma em centavos inteiros (mesma regra do relatorio) para comparar com toBe sem ruido. */
function somaCentavos(valores: number[]): number {
  return valores.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
}

function comoGeral(d: DetalheFaturamento): Extract<DetalheFaturamento, { modo: 'geral' }> {
  if (d.modo !== 'geral') throw new Error('esperado modo geral');
  return d;
}

function comoProduto(d: DetalheFaturamento): Extract<DetalheFaturamento, { modo: 'produto' }> {
  if (d.modo !== 'produto') throw new Error('esperado modo produto');
  return d;
}

function linhaDe<T>(linhas: T[], predicado: (l: T) => boolean, rotulo: string): T {
  const achada = linhas.find(predicado);
  if (!achada) throw new Error(`linha ausente: ${rotulo}`);
  return achada;
}

function linhaCmv(linhas: LinhaCmv[], idProduct: string, porPeso = false): LinhaCmv {
  return linhaDe(linhas, l => l.idProduct === idProduct && l.porPeso === porPeso, `${idProduct}/${porPeso}`);
}

function linhaLucro(linhas: LinhaLucro[], idProduct: string): LinhaLucro {
  return linhaDe(linhas, l => l.idProduct === idProduct, idProduct);
}

function linhaCliente(linhas: LinhaCliente[], tipo: LinhaCliente['tipo']): LinhaCliente {
  return linhaDe(linhas, l => l.tipo === tipo, tipo);
}

/** Um VendaFiltrada por produto (1 unidade, custo 0), com produtos montados na hora. */
function umPorProduto(lista: Array<{ id: string; nome: string; valor: number }>): {
  vendas: VendaFiltrada[];
  produtos: ProdutosPorId;
} {
  const produtos = new Map<string, ProdutoRef>(
    lista.map((p): [string, ProdutoRef] => [p.id, { title: p.nome, soldByWeight: false }])
  );
  const vendas = lista.map(p =>
    vf(`v-${p.id}`, [item({ idProduct: p.id, productName: p.nome, quantity: 1, priceAtSale: p.valor, priceAtCost: 0 })])
  );
  return { vendas, produtos };
}

// ---------- item ----------

describe('valorDoItem e custoDoItem - arredondamento a centavos', () => {
  it('arredonda 19.99 x 1.5 para 29.99 (meio centavo sobe, sem perder centavo por ponto flutuante)', () => {
    expect(valorDoItem(item({ priceAtSale: 19.99, quantity: 1.5 }))).toBe(29.99);
  });

  it('custo tambem arredonda a centavos: 19.99 x 1.5 = 29.99', () => {
    expect(custoDoItem(item({ priceAtCost: 19.99, quantity: 1.5 }))).toBe(29.99);
  });

  it('peso com 3 casas: 0.333 kg x 45.5 = 15.15 (arredondado a centavos)', () => {
    expect(valorDoItem(item({ priceAtSale: 45.5, quantity: 0.333, soldByWeight: true }))).toBe(15.15);
  });
});

describe('custoDoItem - priceAtCost ausente conta como zero', () => {
  it('priceAtCost undefined gera custo 0', () => {
    const semCusto = item({ priceAtCost: undefined as unknown as number, quantity: 2 });
    expect(custoDoItem(semCusto)).toBe(0);
  });

  it('priceAtCost NaN gera custo 0', () => {
    expect(custoDoItem(item({ priceAtCost: NaN, quantity: 2 }))).toBe(0);
  });
});

describe('dataDaVenda - leitura da data', () => {
  it('aceita objeto com toDate() (Timestamp do Firestore)', () => {
    const d = dia(2026, 10, 10, 9, 30);
    expect(dataDaVenda(venda({ date: ts(d) })).getTime()).toBe(d.getTime());
  });

  it('aceita Date direto', () => {
    const d = dia(2026, 10, 10, 9, 30);
    expect(dataDaVenda(venda({ date: d })).getTime()).toBe(d.getTime());
  });

  it('valor invalido resulta em Invalid Date (NaN)', () => {
    expect(dataDaVenda(venda({ date: 'nao-e-data' })).getTime()).toBeNaN();
  });
});

describe('itemEhPorPeso - soldByWeight do item vence o do produto', () => {
  const produtoPeso: ProdutoRef = { title: 'Queijo', soldByWeight: true };
  const produtoUnidade: ProdutoRef = { title: 'Pizza', soldByWeight: false };

  it('item soldByWeight true vence produto unidade', () => {
    expect(itemEhPorPeso(item({ soldByWeight: true }), produtoUnidade)).toBeTrue();
  });

  it('item soldByWeight false explicito vence produto por peso', () => {
    expect(itemEhPorPeso(item({ soldByWeight: false }), produtoPeso)).toBeFalse();
  });

  it('item sem o campo usa o produto (por peso)', () => {
    expect(itemEhPorPeso(item(), produtoPeso)).toBeTrue();
  });

  it('item sem o campo usa o produto (unidade)', () => {
    expect(itemEhPorPeso(item(), produtoUnidade)).toBeFalse();
  });

  it('sem campo no item e sem produto resulta em false', () => {
    expect(itemEhPorPeso(item(), undefined)).toBeFalse();
  });

  it('item soldByWeight true sem produto resulta em true', () => {
    expect(itemEhPorPeso(item({ soldByWeight: true }), undefined)).toBeTrue();
  });
});

// ---------- filtro unico ----------

describe('filtrarVendas - status cancelada', () => {
  it('venda com status canceled sai do filtro', () => {
    const r = filtrarVendas([venda({ id: 'cancelada', status: 'canceled' })], filtro());
    expect(ids(r)).toEqual([]);
  });

  it('venda sem status e venda com status completed entram, na ordem de entrada', () => {
    const r = filtrarVendas(
      [venda({ id: 'sem-status', status: undefined }), venda({ id: 'concluida', status: 'completed' })],
      filtro()
    );
    expect(ids(r)).toEqual(['sem-status', 'concluida']);
  });
});

describe('filtrarVendas - periodo inclusivo', () => {
  it('venda exatamente no inicio entra', () => {
    const r = filtrarVendas([venda({ id: 'no-inicio', date: INICIO })], filtro());
    expect(ids(r)).toEqual(['no-inicio']);
  });

  it('venda exatamente no fim entra', () => {
    const r = filtrarVendas([venda({ id: 'no-fim', date: FIM })], filtro());
    expect(ids(r)).toEqual(['no-fim']);
  });

  it('venda 1 ms antes do inicio sai', () => {
    const r = filtrarVendas([venda({ id: 'antes', date: new Date(INICIO.getTime() - 1) })], filtro());
    expect(ids(r)).toEqual([]);
  });

  it('venda 1 ms depois do fim sai', () => {
    const r = filtrarVendas([venda({ id: 'depois', date: new Date(FIM.getTime() + 1) })], filtro());
    expect(ids(r)).toEqual([]);
  });

  it('venda com data invalida sai', () => {
    const r = filtrarVendas([venda({ id: 'data-ruim', date: 'nao-e-data' })], filtro());
    expect(ids(r)).toEqual([]);
  });
});

describe('filtrarVendas - origem', () => {
  const pdv = venda({ id: 'pdv', sale_type: 'pdv' });
  const pedido = venda({ id: 'pedido', sale_type: 'order' });

  it('origem pdv devolve so vendas de PDV', () => {
    expect(ids(filtrarVendas([pdv, pedido], filtro({ origem: 'pdv' })))).toEqual(['pdv']);
  });

  it('origem order devolve so vendas de pedido', () => {
    expect(ids(filtrarVendas([pdv, pedido], filtro({ origem: 'order' })))).toEqual(['pedido']);
  });

  it('origem todos devolve as duas', () => {
    expect(ids(filtrarVendas([pdv, pedido], filtro({ origem: 'todos' })))).toEqual(['pdv', 'pedido']);
  });
});

describe('filtrarVendas - cliente', () => {
  const ana = venda({ id: 'ana', sale_type: 'order', customerId: 'cli-ana' });
  const bruno = venda({ id: 'bruno', sale_type: 'order', customerId: 'cli-bruno' });
  const semCliente = venda({ id: 'sem-cliente', sale_type: 'order' });

  it('filtro de cliente devolve so a venda daquele customerId', () => {
    expect(ids(filtrarVendas([ana, bruno, semCliente], filtro({ clienteId: 'cli-ana' })))).toEqual(['ana']);
  });

  it('filtro de cliente nunca deixa passar venda de PDV, mesmo que tenha customerId', () => {
    const pdvComCliente = venda({ id: 'pdv-com-cliente', sale_type: 'pdv', customerId: 'cli-ana' });
    const pdvSemCliente = venda({ id: 'pdv-sem-cliente', sale_type: 'pdv' });
    const r = filtrarVendas([pdvComCliente, pdvSemCliente], filtro({ clienteId: 'cli-ana' }));
    expect(ids(r)).toEqual([]);
  });

  it('sem filtro de cliente (vazio) entram vendas de todos os clientes e sem cliente', () => {
    expect(ids(filtrarVendas([ana, bruno, semCliente], filtro({ clienteId: '' })))).toEqual([
      'ana',
      'bruno',
      'sem-cliente'
    ]);
  });
});

describe('filtrarVendas - forma de pagamento', () => {
  it('filtro de forma devolve so as vendas daquela forma', () => {
    const pix = venda({ id: 'pix', paymentMethod: PaymentMethod.PIX });
    const dinheiro = venda({ id: 'dinheiro', paymentMethod: PaymentMethod.DINHEIRO });
    expect(ids(filtrarVendas([pix, dinheiro], filtro({ formaPagamento: PaymentMethod.PIX })))).toEqual(['pix']);
  });

  it('forma misto filtra as vendas com forma misto', () => {
    const misto = venda({ id: 'misto', paymentMethod: PaymentMethod.MISTO });
    const pix = venda({ id: 'pix', paymentMethod: PaymentMethod.PIX });
    expect(ids(filtrarVendas([misto, pix], filtro({ formaPagamento: PaymentMethod.MISTO })))).toEqual(['misto']);
  });

  it('venda sem paymentMethod NAO passa quando a forma e especifica', () => {
    const semForma = venda({ id: 'sem-forma', paymentMethod: undefined });
    expect(ids(filtrarVendas([semForma], filtro({ formaPagamento: PaymentMethod.PIX })))).toEqual([]);
  });

  it('venda sem paymentMethod PASSA quando a forma e todos', () => {
    const semForma = venda({ id: 'sem-forma', paymentMethod: undefined });
    expect(ids(filtrarVendas([semForma], filtro({ formaPagamento: 'todos' })))).toEqual(['sem-forma']);
  });
});

describe('filtrarVendas - produto reduz os itens', () => {
  it('venda mista entra so com os itens do produto; valor e custo somam so esses itens', () => {
    const mista = venda({
      id: 'mista',
      items: [
        item({ idProduct: 'p-pizza', quantity: 2, priceAtSale: 10, priceAtCost: 4 }),
        item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 1.5, priceAtSale: 20, priceAtCost: 8, soldByWeight: true })
      ]
    });
    const r = filtrarVendas([mista], filtro({ produtoId: 'p-pizza' }));
    expect(ids(r)).toEqual(['mista']);
    expect(r[0].itens.map(i => i.idProduct)).toEqual(['p-pizza']);
    expect(r[0].valor).toBe(20);
    expect(r[0].custo).toBe(8);
  });

  it('venda sem nenhum item do produto sai', () => {
    const soQueijo = venda({
      id: 'so-queijo',
      items: [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 1, priceAtSale: 20, priceAtCost: 8 })]
    });
    expect(ids(filtrarVendas([soQueijo], filtro({ produtoId: 'p-pizza' })))).toEqual([]);
  });

  it('venda sem items (undefined) sai quando ha filtro de produto', () => {
    const semItems = venda({ id: 'sem-items', items: undefined as unknown as SaleItem[] });
    expect(ids(filtrarVendas([semItems], filtro({ produtoId: 'p-pizza' })))).toEqual([]);
  });

  it('venda com items vazio sai quando ha filtro de produto', () => {
    const vazia = venda({ id: 'vazia', items: [] });
    expect(ids(filtrarVendas([vazia], filtro({ produtoId: 'p-pizza' })))).toEqual([]);
  });
});

describe('filtrarVendas - valor ignora Sale.total', () => {
  it('valor e a soma dos itens mesmo quando Sale.total e maior (frete fora)', () => {
    const comFrete = venda({
      id: 'frete',
      total: 25,
      items: [item({ priceAtSale: 10, quantity: 2, priceAtCost: 4 })]
    });
    const r = filtrarVendas([comFrete], filtro());
    expect(r[0].valor).toBe(20);
  });
});

describe('filtrarVendas - filtros combinados', () => {
  it('so a venda que cumpre todos os filtros ao mesmo tempo passa, com itens reduzidos ao produto', () => {
    const pizza = item({ idProduct: 'p-pizza', quantity: 1, priceAtSale: 10, priceAtCost: 4 });
    const queijo = item({
      idProduct: 'p-queijo',
      productName: 'Queijo',
      quantity: 1,
      priceAtSale: 20,
      priceAtCost: 8,
      soldByWeight: true
    });
    const candidatas = [
      venda({
        id: 'ok',
        sale_type: 'order',
        customerId: 'cli-ana',
        paymentMethod: PaymentMethod.PIX,
        date: dia(2026, 10, 15, 12, 0),
        items: [pizza, queijo]
      }),
      venda({ id: 'outro-cliente', sale_type: 'order', customerId: 'cli-bruno', paymentMethod: PaymentMethod.PIX, items: [pizza] }),
      venda({ id: 'pdv', sale_type: 'pdv', paymentMethod: PaymentMethod.PIX, items: [pizza] }),
      venda({
        id: 'outra-forma',
        sale_type: 'order',
        customerId: 'cli-ana',
        paymentMethod: PaymentMethod.DINHEIRO,
        items: [pizza]
      }),
      venda({
        id: 'cancelada',
        sale_type: 'order',
        customerId: 'cli-ana',
        paymentMethod: PaymentMethod.PIX,
        status: 'canceled',
        items: [pizza]
      }),
      venda({
        id: 'fora-periodo',
        sale_type: 'order',
        customerId: 'cli-ana',
        paymentMethod: PaymentMethod.PIX,
        date: dia(2026, 11, 2, 10, 0),
        items: [pizza]
      }),
      venda({
        id: 'sem-produto',
        sale_type: 'order',
        customerId: 'cli-ana',
        paymentMethod: PaymentMethod.PIX,
        items: [queijo]
      })
    ];

    const r = filtrarVendas(
      candidatas,
      filtro({ origem: 'order', clienteId: 'cli-ana', formaPagamento: PaymentMethod.PIX, produtoId: 'p-pizza' })
    );
    expect(ids(r)).toEqual(['ok']);
    expect(r[0].itens.map(i => i.idProduct)).toEqual(['p-pizza']);
    expect(r[0].valor).toBe(10);
  });
});

describe('filtroSomentePeriodo', () => {
  it('preserva so inicio e fim e zera produto, origem, cliente e forma', () => {
    const entrada = filtro({
      produtoId: 'p-pizza',
      origem: 'order',
      clienteId: 'cli-ana',
      formaPagamento: PaymentMethod.PIX
    });
    expect(filtroSomentePeriodo(entrada)).toEqual({
      inicio: INICIO,
      fim: FIM,
      produtoId: '',
      origem: 'todos',
      clienteId: '',
      formaPagamento: 'todos'
    });
  });

  it('filtrar pelo periodo deixa passar venda de outro cliente, outro produto e outra forma', () => {
    const outra = venda({
      id: 'outra',
      sale_type: 'order',
      customerId: 'cli-bruno',
      paymentMethod: PaymentMethod.DINHEIRO,
      items: [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 1, priceAtSale: 20, priceAtCost: 8, soldByWeight: true })]
    });
    const r = filtrarVendas(
      [outra],
      filtroSomentePeriodo(filtro({ produtoId: 'p-pizza', origem: 'pdv', clienteId: 'cli-ana', formaPagamento: PaymentMethod.PIX }))
    );
    expect(ids(r)).toEqual(['outra']);
  });
});

// ---------- cards ----------

describe('calcularCards', () => {
  it('faturamento, custo total, lucro = faturamento - custo, qtd de vendas e margem em %', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-pizza', quantity: 2, priceAtSale: 10, priceAtCost: 4 })]),
      vf('b', [item({ idProduct: 'p-refri', quantity: 4, priceAtSale: 5, priceAtCost: 1 })])
    ];
    const card = calcularCards(vs);
    expect(card.faturamento).toBe(40);
    expect(card.custoTotal).toBe(12);
    expect(card.lucro).toBe(28);
    expect(card.qtdVendas).toBe(2);
    expect(card.margem).toBeCloseTo(70, 6);
  });

  it('margem e 0 quando o faturamento e 0 (sem divisao por zero), lucro negativo pelo custo', () => {
    const card = calcularCards([vf('a', [item({ priceAtSale: 0, priceAtCost: 3, quantity: 1 })])]);
    expect(card.faturamento).toBe(0);
    expect(card.lucro).toBe(-3);
    expect(card.margem).toBe(0);
  });

  it('venda com dois itens do produto filtrado conta como 1 venda', () => {
    const card = calcularCards([
      vf('a', [
        item({ idProduct: 'p-pizza', quantity: 1, priceAtSale: 10, priceAtCost: 4 }),
        item({ idProduct: 'p-pizza', quantity: 2, priceAtSale: 10, priceAtCost: 4 })
      ])
    ]);
    expect(card.qtdVendas).toBe(1);
    expect(card.faturamento).toBe(30);
  });

  it('lista vazia devolve tudo zero', () => {
    expect(calcularCards([])).toEqual({ faturamento: 0, custoTotal: 0, lucro: 0, qtdVendas: 0, margem: 0 });
  });
});

// ---------- quantidade vendida do produto ----------

describe('somarQuantidadeDoProduto', () => {
  it('soma unidades do produto em todas as vendas', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-pizza', quantity: 2 })]),
      vf('b', [item({ idProduct: 'p-pizza', quantity: 3 })])
    ];
    expect(somarQuantidadeDoProduto(vs, 'p-pizza')).toBe(5);
  });

  it('soma kg com decimais: 2.5 + 0.25 = 2.75', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 2.5, soldByWeight: true })]),
      vf('b', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 0.25, soldByWeight: true })])
    ];
    expect(somarQuantidadeDoProduto(vs, 'p-queijo')).toBe(2.75);
  });

  it('sem erro de ponto flutuante: 0.1 + 0.2 = 0.3', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 0.1, soldByWeight: true })]),
      vf('b', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 0.2, soldByWeight: true })])
    ];
    expect(somarQuantidadeDoProduto(vs, 'p-queijo')).toBe(0.3);
  });

  it('ignora itens de outro produto', () => {
    const vs = [
      vf('a', [
        item({ idProduct: 'p-pizza', quantity: 4 }),
        item({ idProduct: 'p-refri', productName: 'Refrigerante', quantity: 9 })
      ])
    ];
    expect(somarQuantidadeDoProduto(vs, 'p-pizza')).toBe(4);
  });

  it('lista vazia devolve 0', () => {
    expect(somarQuantidadeDoProduto([], 'p-pizza')).toBe(0);
  });
});

// ---------- invariantes de soma (igualdade exata) ----------

describe('invariantes de soma - cenario misto, igualdade exata (toBe)', () => {
  it('cenario entrega 4 vendas apos o filtro (cancelada sai)', () => {
    const vs = filtrarVendas(cenarioMisto(), filtro());
    expect(calcularCards(vs).qtdVendas).toBe(4);
  });

  it('soma de listarVendas, fatiasPorProduto e serieDiaria bate com o card de faturamento', () => {
    const vs = filtrarVendas(cenarioMisto(), filtro());
    const card = calcularCards(vs);
    expect(somaCentavos(listarVendas(vs, CLIENTES).map(l => l.valor))).toBe(card.faturamento);
    expect(somaCentavos(fatiasPorProduto(vs, PRODUTOS).map(f => f.valor))).toBe(card.faturamento);
    expect(somaCentavos(serieDiaria(vs, INICIO, FIM).map(s => s.valor))).toBe(card.faturamento);
  });

  it('com produto filtrado, soma de porDia e de porCliente bate com o card de faturamento', () => {
    const f = filtro({ produtoId: 'p-pizza' });
    const vs = filtrarVendas(cenarioMisto(), f);
    const card = calcularCards(vs);
    const det = comoProduto(montarDetalheFaturamento(vs, f, PRODUTOS, CLIENTES));
    expect(somaCentavos(det.porDia.map(d => d.valor))).toBe(card.faturamento);
    expect(somaCentavos(det.porCliente.map(l => l.valor))).toBe(card.faturamento);
  });

  it('soma do custoTotal do CMV bate com o card de custo', () => {
    const vs = filtrarVendas(cenarioMisto(), filtro());
    const cmv = montarDetalheCmv(vs, PRODUTOS);
    expect(somaCentavos(cmv.map(l => l.custoTotal))).toBe(calcularCards(vs).custoTotal);
  });

  it('lucro bruto: somas de faturamento, custo e lucro das linhas batem com o card nos 3 campos', () => {
    const vs = filtrarVendas(cenarioMisto(), filtro());
    const card = calcularCards(vs);
    const linhas = montarDetalheLucro(vs, PRODUTOS);
    expect(somaCentavos(linhas.map(l => l.faturamento))).toBe(card.faturamento);
    expect(somaCentavos(linhas.map(l => l.custo))).toBe(card.custoTotal);
    expect(somaCentavos(linhas.map(l => l.lucro))).toBe(card.lucro);
  });
});

// ---------- modal Faturamento ----------

describe('modoDetalheFaturamento', () => {
  it('sem produto no filtro o modo e geral', () => {
    expect(modoDetalheFaturamento(filtro({ produtoId: '' }))).toBe('geral');
  });

  it('com produto no filtro o modo e produto', () => {
    expect(modoDetalheFaturamento(filtro({ produtoId: 'p-pizza' }))).toBe('produto');
  });
});

describe('montarDetalheFaturamento', () => {
  it('modo geral (sem produto): traz vendas listadas e pizza, sem porDia/porCliente, total = card', () => {
    const f = filtro();
    const vs = filtrarVendas(cenarioMisto(), f);
    const det = montarDetalheFaturamento(vs, f, PRODUTOS, CLIENTES);
    const geral = comoGeral(det);
    expect(det.total).toBe(calcularCards(vs).faturamento);
    expect(geral.vendas.length).toBe(4);
    expect(geral.pizza.length).toBeGreaterThan(0);
    expect('porDia' in det).toBeFalse();
  });

  it('modo produto: traz porDia (31 dias) e porCliente, total = card', () => {
    const f = filtro({ produtoId: 'p-pizza' });
    const vs = filtrarVendas(cenarioMisto(), f);
    const det = comoProduto(montarDetalheFaturamento(vs, f, PRODUTOS, CLIENTES));
    expect(det.total).toBe(calcularCards(vs).faturamento);
    expect(det.porDia.length).toBe(31);
    expect(det.porCliente.length).toBeGreaterThan(0);
  });
});

describe('fatiasPorProduto - pizza', () => {
  it('ate 5 produtos: sem fatia Outros', () => {
    const { vendas, produtos } = umPorProduto([
      { id: 'p1', nome: 'Alfa', valor: 50 },
      { id: 'p2', nome: 'Beta', valor: 40 },
      { id: 'p3', nome: 'Gama', valor: 30 },
      { id: 'p4', nome: 'Delta', valor: 20 },
      { id: 'p5', nome: 'Epsilon', valor: 10 }
    ]);
    const fatias = fatiasPorProduto(vendas, produtos);
    expect(fatias.length).toBe(5);
    expect(fatias.some(f => f.nome === ROTULO_OUTROS)).toBeFalse();
  });

  it('8 produtos: 5 maiores + Outros (idProduct null) = soma dos 3 restantes; percentuais somam ~100', () => {
    const { vendas, produtos } = umPorProduto([
      { id: 'p1', nome: 'Alfa', valor: 80 },
      { id: 'p2', nome: 'Beta', valor: 70 },
      { id: 'p3', nome: 'Gama', valor: 60 },
      { id: 'p4', nome: 'Delta', valor: 50 },
      { id: 'p5', nome: 'Epsilon', valor: 40 },
      { id: 'p6', nome: 'Zeta', valor: 30 },
      { id: 'p7', nome: 'Eta', valor: 20 },
      { id: 'p8', nome: 'Teta', valor: 10 }
    ]);
    const fatias = fatiasPorProduto(vendas, produtos);
    expect(fatias.length).toBe(6);
    expect(fatias.slice(0, 5).map(f => f.idProduct)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    const outros = fatias[5];
    expect(outros.idProduct).toBeNull();
    expect(outros.nome).toBe(ROTULO_OUTROS);
    expect(outros.valor).toBe(60); // 30 + 20 + 10
    expect(fatias.reduce((acc, f) => acc + f.percentual, 0)).toBeCloseTo(100, 6);
  });

  it('empate na 5a posicao: desempata por nome (Leite antes de Mel)', () => {
    const { vendas, produtos } = umPorProduto([
      { id: 'p1', nome: 'Alfa', valor: 100 },
      { id: 'p2', nome: 'Beta', valor: 90 },
      { id: 'p3', nome: 'Gama', valor: 80 },
      { id: 'p4', nome: 'Delta', valor: 70 },
      { id: 'p5', nome: 'Mel', valor: 50 },
      { id: 'p6', nome: 'Leite', valor: 50 }
    ]);
    const fatias = fatiasPorProduto(vendas, produtos);
    expect(fatias[4].nome).toBe('Leite');
    expect(fatias[4].idProduct).toBe('p6');
    expect(fatias[5].nome).toBe(ROTULO_OUTROS);
    expect(fatias[5].valor).toBe(50);
  });

  it('empate com mesmo nome na 5a posicao: desempata por id (p-1 antes de p-2)', () => {
    const { vendas, produtos } = umPorProduto([
      { id: 'p-alfa', nome: 'Alfa', valor: 100 },
      { id: 'p-beta', nome: 'Beta', valor: 90 },
      { id: 'p-gama', nome: 'Gama', valor: 80 },
      { id: 'p-delta', nome: 'Delta', valor: 70 },
      { id: 'p-2', nome: 'Mel', valor: 50 },
      { id: 'p-1', nome: 'Mel', valor: 50 }
    ]);
    const fatias = fatiasPorProduto(vendas, produtos);
    expect(fatias[4].idProduct).toBe('p-1');
    expect(fatias[5].nome).toBe(ROTULO_OUTROS);
    expect(fatias[5].valor).toBe(50);
  });

  it('produto com valor 0 nao gera fatia (nem entra em Outros)', () => {
    const { vendas, produtos } = umPorProduto([
      { id: 'p1', nome: 'Alfa', valor: 50 },
      { id: 'p2', nome: 'Beta', valor: 40 },
      { id: 'p3', nome: 'Gama', valor: 30 },
      { id: 'p4', nome: 'Delta', valor: 20 },
      { id: 'p5', nome: 'Epsilon', valor: 10 },
      { id: 'p-zero', nome: 'Brinde', valor: 0 }
    ]);
    const fatias = fatiasPorProduto(vendas, produtos);
    expect(fatias.length).toBe(5);
    expect(fatias.some(f => f.idProduct === 'p-zero')).toBeFalse();
    expect(fatias.some(f => f.nome === ROTULO_OUTROS)).toBeFalse();
  });
});

describe('listarVendas', () => {
  it('ordena por data desc', () => {
    const vs = [
      vf('antiga', [item()], { date: dia(2026, 10, 1, 9, 0) }),
      vf('nova', [item()], { date: dia(2026, 10, 9, 9, 0) }),
      vf('meio', [item()], { date: dia(2026, 10, 5, 9, 0) })
    ];
    expect(listarVendas(vs, CLIENTES).map(l => l.id)).toEqual(['nova', 'meio', 'antiga']);
  });

  it('venda de PDV aparece como Balcao e origem pdv', () => {
    const [linha] = listarVendas([vf('pdv', [item()], { sale_type: 'pdv' })], CLIENTES);
    expect(linha.clienteNome).toBe(ROTULO_BALCAO);
    expect(linha.origem).toBe('pdv');
  });

  it('pedido sem customerId aparece como Sem cliente', () => {
    const [linha] = listarVendas([vf('sem', [item()], { sale_type: 'order' })], CLIENTES);
    expect(linha.clienteNome).toBe(ROTULO_SEM_CLIENTE);
  });

  it('pedido com cliente aparece com o nome do cliente', () => {
    const [linha] = listarVendas(
      [vf('ana', [item()], { sale_type: 'order', customerId: 'cli-ana' })],
      CLIENTES
    );
    expect(linha.clienteNome).toBe('Ana Souza');
  });

  it('customerId fora do mapa aparece como Cliente nao encontrado', () => {
    const [linha] = listarVendas(
      [vf('fantasma', [item()], { sale_type: 'order', customerId: 'cli-fantasma' })],
      CLIENTES
    );
    expect(linha.clienteNome).toBe(ROTULO_CLIENTE_NAO_ENCONTRADO);
  });

  it('forma undefined vira formaPagamento null e label Em aberto', () => {
    const [linha] = listarVendas(
      [vf('sem-forma', [item()], { sale_type: 'order', paymentMethod: undefined })],
      CLIENTES
    );
    expect(linha.formaPagamento).toBeNull();
    expect(linha.formaPagamentoLabel).toBe(ROTULO_FORMA_PENDENTE);
  });

  it('forma misto aparece com label Misto', () => {
    const [linha] = listarVendas(
      [vf('misto', [item()], { sale_type: 'order', paymentMethod: PaymentMethod.MISTO })],
      CLIENTES
    );
    expect(linha.formaPagamento).toBe(PaymentMethod.MISTO);
    expect(linha.formaPagamentoLabel).toBe('Misto');
  });

  it('forma PIX aparece com label Pix e valor = VendaFiltrada.valor', () => {
    const [linha] = listarVendas(
      [vf('pix', [item({ priceAtSale: 10, quantity: 2 })], { paymentMethod: PaymentMethod.PIX })],
      CLIENTES
    );
    expect(linha.formaPagamentoLabel).toBe('Pix');
    expect(linha.valor).toBe(20);
  });
});

describe('serieDiaria', () => {
  it('preenche dias sem venda com 0 e inclui inicio e fim', () => {
    const vs = [
      vf('a', [item({ priceAtSale: 10 })], { date: dia(2026, 10, 1, 8, 0) }),
      vf('b', [item({ priceAtSale: 5 })], { date: dia(2026, 10, 4, 20, 0) })
    ];
    expect(serieDiaria(vs, dia(2026, 10, 1), dia(2026, 10, 4))).toEqual([
      { dia: '2026-10-01', valor: 10 },
      { dia: '2026-10-02', valor: 0 },
      { dia: '2026-10-03', valor: 0 },
      { dia: '2026-10-04', valor: 5 }
    ]);
  });

  it('agrupa pelo dia LOCAL: venda 23:59 cai no proprio dia, a da 00:00 do dia seguinte', () => {
    const vs = [
      vf('fim-do-dia', [item({ priceAtSale: 7 })], { date: dia(2026, 10, 5, 23, 59) }),
      vf('virada', [item({ priceAtSale: 3 })], { date: dia(2026, 10, 6, 0, 0) })
    ];
    expect(serieDiaria(vs, dia(2026, 10, 5), dia(2026, 10, 6))).toEqual([
      { dia: '2026-10-05', valor: 7 },
      { dia: '2026-10-06', valor: 3 }
    ]);
  });

  it('atravessa virada de mes e de ano, chave yyyy-MM-dd', () => {
    const vs = [
      vf('31-dez', [item({ priceAtSale: 7 })], { date: dia(2026, 12, 31, 10, 0) }),
      vf('1-jan', [item({ priceAtSale: 3 })], { date: dia(2027, 1, 1, 10, 0) })
    ];
    expect(serieDiaria(vs, dia(2026, 12, 30), dia(2027, 1, 2))).toEqual([
      { dia: '2026-12-30', valor: 0 },
      { dia: '2026-12-31', valor: 7 },
      { dia: '2027-01-01', valor: 3 },
      { dia: '2027-01-02', valor: 0 }
    ]);
  });
});

describe('agruparPorCliente', () => {
  it('venda de PDV vira linha tipo balcao com nome Balcao e clienteId null', () => {
    const linhas = agruparPorCliente([vf('pdv', [item({ priceAtSale: 10 })], { sale_type: 'pdv' })], CLIENTES);
    expect(linhas).toEqual([
      { tipo: 'balcao', clienteId: null, nome: ROTULO_BALCAO, qtdVendas: 1, valor: 10 }
    ]);
  });

  it('pedido sem customerId vira linha tipo sem-cliente com nome Sem cliente', () => {
    const linhas = agruparPorCliente(
      [vf('sem', [item({ priceAtSale: 10 })], { sale_type: 'order' })],
      CLIENTES
    );
    expect(linhas).toEqual([
      { tipo: 'sem-cliente', clienteId: null, nome: ROTULO_SEM_CLIENTE, qtdVendas: 1, valor: 10 }
    ]);
  });

  it('Balcao e Sem cliente sao linhas distintas', () => {
    const linhas = agruparPorCliente(
      [
        vf('pdv', [item({ priceAtSale: 10 })], { sale_type: 'pdv' }),
        vf('sem', [item({ priceAtSale: 10 })], { sale_type: 'order' })
      ],
      CLIENTES
    );
    expect(linhas.length).toBe(2);
    expect(linhaCliente(linhas, 'balcao').valor).toBe(10);
    expect(linhaCliente(linhas, 'sem-cliente').valor).toBe(10);
  });

  it('pedidos do mesmo cliente agregam em uma linha com qtdVendas e valor somados', () => {
    const linhas = agruparPorCliente(
      [
        vf('p1', [item({ priceAtSale: 30 })], { sale_type: 'order', customerId: 'cli-ana' }),
        vf('p2', [item({ priceAtSale: 20 })], { sale_type: 'order', customerId: 'cli-ana' })
      ],
      CLIENTES
    );
    expect(linhas).toEqual([
      { tipo: 'cliente', clienteId: 'cli-ana', nome: 'Ana Souza', qtdVendas: 2, valor: 50 }
    ]);
  });

  it('ordena por valor desc', () => {
    const linhas = agruparPorCliente(
      [
        vf('ana', [item({ priceAtSale: 20 })], { sale_type: 'order', customerId: 'cli-ana' }),
        vf('bruno', [item({ priceAtSale: 50 })], { sale_type: 'order', customerId: 'cli-bruno' }),
        vf('pdv', [item({ priceAtSale: 35 })], { sale_type: 'pdv' })
      ],
      CLIENTES
    );
    expect(linhas.map(l => l.nome)).toEqual(['Bruno Lima', ROTULO_BALCAO, 'Ana Souza']);
    expect(linhas.map(l => l.valor)).toEqual([50, 35, 20]);
  });
});

// ---------- modal CMV ----------

describe('montarDetalheCmv', () => {
  it('uma linha por produto com quantidade, custo total e custo unitario medio ponderado', () => {
    const vs = [
      vf('v1', [item({ idProduct: 'p-pizza', quantity: 2, priceAtSale: 10, priceAtCost: 4 })]),
      vf('v2', [item({ idProduct: 'p-pizza', quantity: 1, priceAtSale: 10, priceAtCost: 6 })]),
      vf('v3', [item({ idProduct: 'p-refri', quantity: 4, priceAtSale: 3, priceAtCost: 1 })])
    ];
    const linhas = montarDetalheCmv(vs, PRODUTOS);
    expect(linhas.length).toBe(2);
    const pizza = linhaCmv(linhas, 'p-pizza');
    expect(pizza.quantidade).toBe(3);
    expect(pizza.custoTotal).toBe(14);
    expect(pizza.custoUnitarioMedio).toBeCloseTo(14 / 3, 6);
    expect(pizza.custoZero).toBeFalse();
    const refri = linhaCmv(linhas, 'p-refri');
    expect(refri.quantidade).toBe(4);
    expect(refri.custoTotal).toBe(4);
    expect(refri.custoUnitarioMedio).toBe(1);
  });

  it('custoZero true quando um item tem priceAtCost 0, e essa linha ordena primeiro', () => {
    const vs = [
      vf('zero', [item({ idProduct: 'p-refri', quantity: 1, priceAtSale: 10, priceAtCost: 0 })]),
      vf('normal', [item({ idProduct: 'p-pizza', quantity: 5, priceAtSale: 10, priceAtCost: 4 })])
    ];
    const linhas = montarDetalheCmv(vs, PRODUTOS);
    expect(linhas[0].idProduct).toBe('p-refri');
    expect(linhas[0].custoZero).toBeTrue();
    expect(linhaCmv(linhas, 'p-pizza').custoZero).toBeFalse();
  });

  it('custoZero true quando priceAtCost esta ausente (undefined), e essa linha ordena primeiro', () => {
    const semCusto = item({ idProduct: 'p-refri', quantity: 1, priceAtSale: 10, priceAtCost: undefined as unknown as number });
    const vs = [
      vf('sem-custo', [semCusto]),
      vf('normal', [item({ idProduct: 'p-pizza', quantity: 5, priceAtSale: 10, priceAtCost: 4 })])
    ];
    const linhas = montarDetalheCmv(vs, PRODUTOS);
    expect(linhas[0].idProduct).toBe('p-refri');
    expect(linhas[0].custoZero).toBeTrue();
  });

  it('mesmo produto vendido por unidade e por peso gera duas linhas separadas', () => {
    const vs = [
      vf('un', [item({ idProduct: 'p-pizza', quantity: 2, priceAtSale: 10, priceAtCost: 4 })]),
      vf('kg', [
        item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 1.5, priceAtSale: 10, priceAtCost: 4, soldByWeight: true })
      ])
    ];
    const linhas = montarDetalheCmv(vs, PRODUTOS);
    expect(linhas.length).toBe(2);
    expect(linhaCmv(linhas, 'p-pizza', false).quantidade).toBe(2);
    expect(linhaCmv(linhas, 'p-pizza', true).quantidade).toBe(1.5);
  });
});

// ---------- modal Lucro Bruto ----------

describe('montarDetalheLucro', () => {
  const produtosLucro: ProdutosPorId = new Map<string, ProdutoRef>([
    ['p-arroz', { title: 'Arroz', soldByWeight: false }],
    ['p-cuca', { title: 'Cuca', soldByWeight: false }],
    ['p-zebra', { title: 'Zebra', soldByWeight: false }],
    ['p-brinde', { title: 'Brinde', soldByWeight: false }],
    ['p-negativo', { title: 'Negativo', soldByWeight: false }]
  ]);

  // Arroz: fat 100, custo 40, lucro 60. Cuca e Zebra: lucro 30 (empate). Brinde: fat 0, lucro -5.
  // Negativo: fat 50, custo 80, lucro -30.
  const vendasLucro = (): VendaFiltrada[] => [
    vf('arroz', [item({ idProduct: 'p-arroz', productName: 'Arroz', quantity: 2, priceAtSale: 50, priceAtCost: 20 })]),
    vf('zebra', [item({ idProduct: 'p-zebra', productName: 'Zebra', quantity: 2, priceAtSale: 30, priceAtCost: 15 })]),
    vf('cuca', [item({ idProduct: 'p-cuca', productName: 'Cuca', quantity: 2, priceAtSale: 30, priceAtCost: 15 })]),
    vf('brinde', [item({ idProduct: 'p-brinde', productName: 'Brinde', quantity: 1, priceAtSale: 0, priceAtCost: 5 })]),
    vf('negativo', [item({ idProduct: 'p-negativo', productName: 'Negativo', quantity: 2, priceAtSale: 25, priceAtCost: 40 })])
  ];

  it('ordena por lucro desc, empate por nome, lucro negativo no fim', () => {
    const linhas = montarDetalheLucro(vendasLucro(), produtosLucro);
    expect(linhas.map(l => l.nome)).toEqual(['Arroz', 'Cuca', 'Zebra', 'Brinde', 'Negativo']);
  });

  it('margem por linha em %; 0 quando o faturamento e 0; lucro negativo tem margem negativa', () => {
    const linhas = montarDetalheLucro(vendasLucro(), produtosLucro);
    expect(linhaLucro(linhas, 'p-arroz').margem).toBeCloseTo(60, 6);
    expect(linhaLucro(linhas, 'p-brinde').margem).toBe(0);
    expect(linhaLucro(linhas, 'p-negativo').margem).toBeCloseTo(-60, 6);
  });
});

// ---------- Top 5 (quantidade) ----------

describe('rankingTopQuantidade - unidade e kg separados', () => {
  it('unidade e kg ficam em rankings separados', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-pizza', productName: 'Pizza', quantity: 2 })]),
      vf('b', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 1.5, priceAtSale: 45.5, priceAtCost: 12.1 })])
    ];
    const ranking = rankingTopQuantidade(vs, PRODUTOS);
    expect(ranking.unidade).toEqual([{ idProduct: 'p-pizza', nome: 'Pizza', quantidade: 2 }]);
    expect(ranking.peso).toEqual([{ idProduct: 'p-queijo', nome: 'Queijo', quantidade: 1.5 }]);
  });

  it('produto de 10 kg nao entra no ranking de unidade', () => {
    const vs = [
      vf('kg', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 10, priceAtSale: 45.5, priceAtCost: 12.1 })])
    ];
    const ranking = rankingTopQuantidade(vs, PRODUTOS);
    expect(ranking.unidade).toEqual([]);
    expect(ranking.peso).toEqual([{ idProduct: 'p-queijo', nome: 'Queijo', quantidade: 10 }]);
  });
});

describe('rankingTopQuantidade - limite e quantidade', () => {
  const sete = [1, 2, 3, 4, 5, 6, 7];
  const vs = sete.map(n =>
    vf(`v${n}`, [item({ idProduct: `p${n}`, productName: `Prod${n}`, quantity: n, priceAtSale: 1, priceAtCost: 0 })])
  );
  const produtos: ProdutosPorId = new Map<string, ProdutoRef>(
    sete.map((n): [string, ProdutoRef] => [`p${n}`, { title: `Prod${n}`, soldByWeight: false }])
  );

  it('no maximo LIMITE_TOP por lista, ordenada por quantidade desc', () => {
    const ranking = rankingTopQuantidade(vs, produtos);
    expect(ranking.unidade.length).toBe(LIMITE_TOP);
    expect(ranking.unidade.map(i => i.quantidade)).toEqual([7, 6, 5, 4, 3]);
  });

  it('quantidades de kg somam com 3 casas sem ruido: 0.1 + 0.2 = 0.3', () => {
    const pesos = [
      vf('a', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 0.1, priceAtSale: 45.5, priceAtCost: 12.1, soldByWeight: true })]),
      vf('b', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 0.2, priceAtSale: 45.5, priceAtCost: 12.1, soldByWeight: true })])
    ];
    const ranking = rankingTopQuantidade(pesos, PRODUTOS);
    expect(ranking.peso.length).toBe(1);
    expect(ranking.peso[0].quantidade).toBe(0.3);
  });
});

describe('rankingTopQuantidade - classificacao por item e produto', () => {
  it('item sem soldByWeight com produto por peso entra como peso', () => {
    const vs = [vf('a', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 2 })])];
    const ranking = rankingTopQuantidade(vs, PRODUTOS);
    expect(ranking.peso).toEqual([{ idProduct: 'p-queijo', nome: 'Queijo', quantidade: 2 }]);
    expect(ranking.unidade).toEqual([]);
  });

  it('item soldByWeight false explicito entra como unidade mesmo com produto por peso', () => {
    const vs = [
      vf('a', [item({ idProduct: 'p-queijo', productName: 'Queijo', quantity: 4, soldByWeight: false })])
    ];
    const ranking = rankingTopQuantidade(vs, PRODUTOS);
    expect(ranking.unidade).toEqual([{ idProduct: 'p-queijo', nome: 'Queijo', quantidade: 4 }]);
    expect(ranking.peso).toEqual([]);
  });
});

describe('rankingTopQuantidade - nome do produto', () => {
  it('productName do item vence o titulo do produto', () => {
    const produtos: ProdutosPorId = new Map<string, ProdutoRef>([['p-x', { title: 'Titulo', soldByWeight: false }]]);
    const vs = [vf('a', [item({ idProduct: 'p-x', productName: 'Nome Item', quantity: 1 })])];
    expect(rankingTopQuantidade(vs, produtos).unidade[0].nome).toBe('Nome Item');
  });

  it('sem productName no item, usa o titulo do produto', () => {
    const produtos: ProdutosPorId = new Map<string, ProdutoRef>([['p-x', { title: 'Titulo', soldByWeight: false }]]);
    const vs = [vf('a', [item({ idProduct: 'p-x', productName: undefined as unknown as string, quantity: 1 })])];
    expect(rankingTopQuantidade(vs, produtos).unidade[0].nome).toBe('Titulo');
  });

  it('sem productName e sem produto no mapa, usa Produto S/N', () => {
    const vs = [vf('a', [item({ idProduct: 'p-sumido', productName: undefined as unknown as string, quantity: 1 })])];
    expect(rankingTopQuantidade(vs, new Map()).unidade[0].nome).toBe(ROTULO_PRODUTO_SEM_NOME);
  });
});

describe('rankingTopQuantidade - com produto filtrado', () => {
  it('so o produto filtrado aparece no ranking (pizza soma as 4 vendas validas: 3 + 1 + 2 + 1)', () => {
    const vs = filtrarVendas(cenarioMisto(), filtro({ produtoId: 'p-pizza' }));
    const ranking = rankingTopQuantidade(vs, PRODUTOS);
    expect(ranking.unidade).toEqual([{ idProduct: 'p-pizza', nome: 'Pizza', quantidade: 7 }]);
    expect(ranking.peso).toEqual([]);
  });
});

describe('modoTopEfetivo', () => {
  const X: ItemRanking = { idProduct: 'p1', nome: 'Pizza', quantidade: 2 };
  const vazio: RankingQuantidade = { unidade: [], peso: [] };

  it('preferido com dados e mantido (unidade)', () => {
    expect(modoTopEfetivo({ unidade: [X], peso: [X] }, 'unidade')).toBe('unidade');
  });

  it('preferido com dados e mantido (peso)', () => {
    expect(modoTopEfetivo({ unidade: [X], peso: [X] }, 'peso')).toBe('peso');
  });

  it('preferido peso vazio e unidade com dados: cai para unidade', () => {
    expect(modoTopEfetivo({ unidade: [X], peso: [] }, 'peso')).toBe('unidade');
  });

  it('preferido unidade vazio e peso com dados: cai para peso', () => {
    expect(modoTopEfetivo({ unidade: [], peso: [X] }, 'unidade')).toBe('peso');
  });

  it('ambos vazios: devolve o preferido', () => {
    expect(modoTopEfetivo(vazio, 'peso')).toBe('peso');
    expect(modoTopEfetivo(vazio, 'unidade')).toBe('unidade');
  });
});
