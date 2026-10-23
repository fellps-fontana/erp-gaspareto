import { Timestamp } from '@angular/fire/firestore';
import { Order, OrderPayment, OrderPaymentStatus } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import {
  calcularAReceberTotal,
  calcularDiasAtraso,
  calcularRecebidoNoPeriodo,
  listarMovimentoDoMes,
  listarParcelasReceber,
  montarAbaAReceber,
  montarPanoramaAnual,
  resumirValoresPedidos
} from './order-receivables-rules';

// Data de referencia fixa: 20/10/2026 15:30 (hora local). Nunca usar new Date() nas asserts.
const HOJE = new Date(2026, 9, 20, 15, 30);

// Mes 1-based para legibilidade. Sempre meia-noite local.
const dia = (ano: number, mes: number, d: number): Date => new Date(ano, mes - 1, d);
const ts = (d: Date): Timestamp => Timestamp.fromDate(d);

function pedido(over: Partial<Order>): Order {
  return {
    companyId: 'empresa-1',
    orderNumber: 1,
    customerName: 'Cliente Teste',
    customerId: 'cli-1',
    items: [],
    itemsTotal: 100,
    shippingCost: 0,
    total: 100,
    deliveryType: 'pickup',
    status: 'delivered',
    createdAt: ts(dia(2026, 1, 1)),
    ...over
  };
}

function parcela(id: string, amount: number, status: OrderPaymentStatus, vence: Date): OrderPayment {
  return {
    id,
    amount,
    method: PaymentMethod.BOLETO,
    installments: 1,
    dueDate: ts(vence),
    status
  };
}

function pagamento(id: string, amount: number, pagoEm: Date, status: OrderPaymentStatus = 'pago'): OrderPayment {
  return {
    id,
    amount,
    method: PaymentMethod.DINHEIRO,
    installments: 1,
    paidDate: ts(pagoEm),
    status
  };
}

/** Pagamento de parcela ja paga: carrega o dueDate da parcela (regra 5.3, posicao k/n). */
function pagoDaParcela(id: string, amount: number, vence: Date, pagoEm: Date): OrderPayment {
  return { ...pagamento(id, amount, pagoEm), dueDate: ts(vence) };
}

describe('calcularDiasAtraso - vencida = dueDate anterior ao inicio do dia de hoje', () => {
  it('parcela com vencimento no futuro tem zero dias de atraso', () => {
    expect(calcularDiasAtraso(dia(2026, 10, 25), HOJE)).toBe(0);
  });

  it('parcela que vence hoje tem zero dias de atraso, qualquer que seja a hora do vencimento', () => {
    expect(calcularDiasAtraso(new Date(2026, 9, 20, 0, 0, 0), HOJE)).toBe(0);
    expect(calcularDiasAtraso(new Date(2026, 9, 20, 23, 59, 59), HOJE)).toBe(0);
  });

  it('parcela vencida ontem tem 1 dia de atraso, mesmo com vencimento no fim do dia anterior', () => {
    expect(calcularDiasAtraso(new Date(2026, 9, 19, 23, 59, 59), HOJE)).toBe(1);
  });

  it('parcela vencida ha N dias tem N dias de atraso (17/10 com hoje 20/10 = 3)', () => {
    expect(calcularDiasAtraso(dia(2026, 10, 17), HOJE)).toBe(3);
  });

  it('conta dias corridos em intervalo longo (10/03 ate 20/10/2026 = 224 dias)', () => {
    expect(calcularDiasAtraso(dia(2026, 3, 10), HOJE)).toBe(224);
  });
});

describe('listarParcelasReceber', () => {
  it('inclui so pagamentos previstos de pedido nao cancelado', () => {
    const orders = [
      pedido({
        orderNumber: 1,
        payments: [
          parcela('p-prev', 100, 'previsto', dia(2026, 11, 10)),
          pagamento('p-pago', 40, dia(2026, 10, 1))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);

    expect(parcelas.length).toBe(1);
    expect(parcelas[0].paymentId).toBe('p-prev');
    expect(parcelas[0].amount).toBe(100);
  });

  it('ignora parcelas de pedido cancelado mesmo que estejam previstas', () => {
    const orders = [
      pedido({
        status: 'canceled',
        payments: [parcela('c-prev', 100, 'cancelado', dia(2026, 11, 10))]
      })
    ];

    expect(listarParcelasReceber(orders, HOJE).length).toBe(0);
  });

  it('ignora pagamentos estornados e parcelas canceladas', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('e-1', 30, dia(2026, 10, 5), 'estornado'),
          parcela('x-1', 45, 'cancelado', dia(2026, 11, 5))
        ]
      })
    ];

    expect(listarParcelasReceber(orders, HOJE).length).toBe(0);
  });

  it('calcula k/n pela posicao entre as parcelas do pedido ordenadas por dueDate', () => {
    const orders = [
      pedido({
        orderNumber: 7,
        payments: [
          parcela('p-c', 100, 'previsto', dia(2026, 11, 10)),
          parcela('p-a', 100, 'previsto', dia(2026, 9, 10)),
          parcela('p-b', 100, 'previsto', dia(2026, 10, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(porId('p-a').k).toBe(1);
    expect(porId('p-a').n).toBe(3);
    expect(porId('p-b').k).toBe(2);
    expect(porId('p-b').n).toBe(3);
    expect(porId('p-c').k).toBe(3);
    expect(porId('p-c').n).toBe(3);
  });

  it('calcula k/n de cada pedido separadamente', () => {
    const orders = [
      pedido({
        orderNumber: 1,
        payments: [
          parcela('a-1', 10, 'previsto', dia(2026, 11, 1)),
          parcela('a-2', 10, 'previsto', dia(2026, 12, 1))
        ]
      }),
      pedido({
        orderNumber: 2,
        payments: [parcela('b-1', 20, 'previsto', dia(2026, 11, 15))]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(porId('a-2').k).toBe(2);
    expect(porId('a-2').n).toBe(2);
    expect(porId('b-1').k).toBe(1);
    expect(porId('b-1').n).toBe(1);
  });

  it('[RED] k/n conta a parcela ja paga: 1a de 5 paga, previstas aparecem como 2/5..5/5 (Maria #42)', () => {
    const orders = [
      pedido({
        orderNumber: 42,
        customerName: 'Maria',
        payments: [
          pagoDaParcela('p1', 20, dia(2026, 1, 10), dia(2026, 1, 10)),
          parcela('p2', 20, 'previsto', dia(2026, 2, 10)),
          parcela('p3', 20, 'previsto', dia(2026, 3, 10)),
          parcela('p4', 20, 'previsto', dia(2026, 4, 10)),
          parcela('p5', 20, 'previsto', dia(2026, 5, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(parcelas.length).toBe(4);
    expect(porId('p2').k).toBe(2);
    expect(porId('p3').k).toBe(3);
    expect(porId('p4').k).toBe(4);
    expect(porId('p5').k).toBe(5);
    parcelas.forEach(p => expect(p.n).toBe(5));
  });

  it('[RED] parcela cancelada com dueDate nao entra em n nem em k (5 parcelas, 1 cancelada: n = 4)', () => {
    const orders = [
      pedido({
        payments: [
          pagoDaParcela('p1', 20, dia(2026, 1, 10), dia(2026, 1, 10)),
          parcela('p2', 20, 'previsto', dia(2026, 2, 10)),
          parcela('p3', 20, 'cancelado', dia(2026, 3, 10)),
          parcela('p4', 20, 'previsto', dia(2026, 4, 10)),
          parcela('p5', 20, 'previsto', dia(2026, 5, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(parcelas.length).toBe(3);
    expect(porId('p2').k).toBe(2);
    expect(porId('p4').k).toBe(3);
    expect(porId('p5').k).toBe(4);
    parcelas.forEach(p => expect(p.n).toBe(4));
  });

  it('[RED] pagamento estornado com dueDate nao entra em n (pago + estornado + 2 previstas: n = 3, k 2/3 e 3/3)', () => {
    const estornado = { ...pagoDaParcela('e1', 20, dia(2026, 2, 10), dia(2026, 2, 10)), status: 'estornado' as const };
    const orders = [
      pedido({
        payments: [
          pagoDaParcela('p1', 20, dia(2026, 1, 10), dia(2026, 1, 10)),
          estornado,
          parcela('p3', 40, 'previsto', dia(2026, 3, 10)),
          parcela('p4', 20, 'previsto', dia(2026, 4, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(porId('p3').k).toBe(2);
    expect(porId('p4').k).toBe(3);
    parcelas.forEach(p => expect(p.n).toBe(3));
  });

  it('[RED] pagamento avulso sem dueDate nao entra em n nem em k (pago avulso + pago com dueDate + 2 previstas: n = 3, k 2/3 e 3/3)', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('av', 30, dia(2026, 1, 5)),
          pagoDaParcela('p1', 30, dia(2026, 1, 10), dia(2026, 1, 10)),
          parcela('p2', 35, 'previsto', dia(2026, 2, 10)),
          parcela('p3', 35, 'previsto', dia(2026, 3, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(porId('p2').k).toBe(2);
    expect(porId('p3').k).toBe(3);
    parcelas.forEach(p => expect(p.n).toBe(3));
  });

  it('[RED] pago com dueDate fora da ordem conta na posicao pelo vencimento (prev Jan, pago Feb, prev Mar: 1/3 e 3/3)', () => {
    const orders = [
      pedido({
        payments: [
          parcela('p-jan', 40, 'previsto', dia(2026, 1, 10)),
          pagoDaParcela('p-fev', 30, dia(2026, 2, 10), dia(2026, 2, 10)),
          parcela('p-mar', 30, 'previsto', dia(2026, 3, 10))
        ]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);
    const porId = (id: string) => parcelas.find(p => p.paymentId === id)!;

    expect(porId('p-jan').k).toBe(1);
    expect(porId('p-jan').n).toBe(3);
    expect(porId('p-mar').k).toBe(3);
    expect(porId('p-mar').n).toBe(3);
  });

  it('calcula diasAtraso em dias inteiros para parcela vencida', () => {
    const orders = [
      pedido({
        payments: [parcela('v-17', 10, 'previsto', dia(2026, 10, 17))]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);

    expect(parcelas[0].diasAtraso).toBe(3);
  });

  it('parcela que vence hoje nao esta vencida (diasAtraso zero)', () => {
    const orders = [
      pedido({
        payments: [parcela('hoje', 10, 'previsto', dia(2026, 10, 20))]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);

    expect(parcelas[0].diasAtraso).toBe(0);
  });

  it('parcela que vence no futuro tem diasAtraso zero', () => {
    const orders = [
      pedido({
        payments: [parcela('futura', 10, 'previsto', dia(2026, 10, 25))]
      })
    ];

    const parcelas = listarParcelasReceber(orders, HOJE);

    expect(parcelas[0].diasAtraso).toBe(0);
  });
});

describe('montarAbaAReceber', () => {
  it('separa vencidas, vence este mes e proximos meses com os totais dos cards', () => {
    const orders = [
      pedido({ orderNumber: 1, payments: [parcela('a1', 100, 'previsto', dia(2026, 10, 10))] }),
      pedido({
        orderNumber: 2,
        payments: [
          parcela('b1', 50, 'previsto', dia(2026, 10, 20)),
          parcela('b2', 50, 'previsto', dia(2026, 10, 31))
        ]
      }),
      pedido({
        orderNumber: 3,
        payments: [
          parcela('c1', 200, 'previsto', dia(2026, 11, 1)),
          parcela('c2', 30, 'previsto', dia(2026, 12, 15))
        ]
      })
    ];

    const aba = montarAbaAReceber(orders, HOJE);

    expect(aba.vencido).toBe(100);
    expect(aba.venceEsteMes).toBe(100);
    expect(aba.proximos).toBe(230);
    expect(aba.quantidadeVencidas).toBe(1);
    expect(aba.vencidas.length).toBe(1);
    expect(aba.esteMes.length).toBe(2);
    expect(aba.proximosMeses.length).toBe(2);
  });

  it('vencida de mes anterior entra em vencido e na quantidade de vencidas', () => {
    const orders = [
      pedido({
        payments: [
          parcela('ant', 80, 'previsto', dia(2026, 9, 1)),
          parcela('ontem', 20, 'previsto', dia(2026, 10, 19))
        ]
      })
    ];

    const aba = montarAbaAReceber(orders, HOJE);

    expect(aba.vencido).toBe(100);
    expect(aba.quantidadeVencidas).toBe(2);
    expect(aba.vencidas.length).toBe(2);
  });

  it('ordena vencidas e esteMes por dueDate crescente', () => {
    const orders = [
      pedido({
        payments: [
          parcela('v-15', 10, 'previsto', dia(2026, 10, 15)),
          parcela('v-05', 10, 'previsto', dia(2026, 10, 5)),
          parcela('m-31', 30, 'previsto', dia(2026, 10, 31)),
          parcela('m-20', 10, 'previsto', dia(2026, 10, 20))
        ]
      })
    ];

    const aba = montarAbaAReceber(orders, HOJE);

    expect(aba.vencidas.map(p => p.paymentId)).toEqual(['v-05', 'v-15']);
    expect(aba.esteMes.map(p => p.paymentId)).toEqual(['m-20', 'm-31']);
  });

  it('nao inclui pedido cancelado nos cards nem nos grupos', () => {
    const orders = [
      pedido({
        status: 'canceled',
        payments: [parcela('x', 500, 'cancelado', dia(2026, 10, 1))]
      })
    ];

    const aba = montarAbaAReceber(orders, HOJE);

    expect(aba.vencido).toBe(0);
    expect(aba.venceEsteMes).toBe(0);
    expect(aba.proximos).toBe(0);
    expect(aba.quantidadeVencidas).toBe(0);
  });
});

describe('montarPanoramaAnual', () => {
  it('retorna 12 meses e recebido pelo paidDate dos pagamentos pagos', () => {
    const orders = [
      pedido({
        total: 40,
        payments: [pagamento('r-1', 40, dia(2026, 3, 5))]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.ano).toBe(2026);
    expect(panorama.meses.length).toBe(12);
    expect(panorama.meses.map(m => m.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(panorama.meses[2].recebido).toBe(40);
    expect(panorama.meses[2].previsto).toBe(0);
    expect(panorama.meses[2].vencido).toBe(0);
    expect(panorama.recebidoAno).toBe(40);
  });

  it('previsto do mes = previstas nao vencidas por dueDate; vencido do mes = previstas vencidas', () => {
    const orders = [
      pedido({
        payments: [
          parcela('y-nov', 100, 'previsto', dia(2026, 11, 15)),
          parcela('y-mar', 50, 'previsto', dia(2026, 3, 10)),
          parcela('y-hoje', 70, 'previsto', dia(2026, 10, 20))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.meses[10].previsto).toBe(100);
    expect(panorama.meses[10].vencido).toBe(0);
    expect(panorama.meses[2].vencido).toBe(50);
    expect(panorama.meses[2].previsto).toBe(0);
    expect(panorama.meses[9].previsto).toBe(70);
    expect(panorama.meses[9].vencido).toBe(0);
  });

  it('aReceberAno soma so previstas nao vencidas com dueDate no proprio ano', () => {
    const orders = [
      pedido({
        payments: [
          parcela('nov-2026', 100, 'previsto', dia(2026, 11, 15)),
          parcela('hoje-2026', 70, 'previsto', dia(2026, 10, 20)),
          parcela('venc-2026', 50, 'previsto', dia(2026, 3, 10)),
          parcela('prox-ano', 500, 'previsto', dia(2027, 5, 10))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.aReceberAno).toBe(170);
  });

  it('vencidoTotal soma vencidas de qualquer ano, inclusive anos anteriores', () => {
    const orders = [
      pedido({
        payments: [
          parcela('venc-2026', 50, 'previsto', dia(2026, 3, 10)),
          parcela('venc-2025', 25, 'previsto', dia(2025, 6, 1))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.vencidoTotal).toBe(75);
    const somaVencidoMeses = panorama.meses.reduce((acc, m) => acc + m.vencido, 0);
    expect(somaVencidoMeses).toBe(50);
  });

  it('recebidoAno ignora pagamentos de outros anos', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('ano-2026', 40, dia(2026, 4, 1)),
          pagamento('ano-2025', 90, dia(2025, 12, 1))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.recebidoAno).toBe(40);
  });

  it('sinal retido (pedido cancelado com pagamento pago) conta como recebido', () => {
    const orders = [
      pedido({
        status: 'canceled',
        total: 100,
        payments: [pagamento('sinal', 30, dia(2026, 4, 10))]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.meses[3].recebido).toBe(30);
    expect(panorama.recebidoAno).toBe(30);
  });

  it('pagamento estornado e parcela cancelada nao contam em recebido, previsto nem vencido', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('estornado', 30, dia(2026, 4, 10), 'estornado'),
          parcela('cancelada', 40, 'cancelado', dia(2026, 11, 1))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.recebidoAno).toBe(0);
    expect(panorama.aReceberAno).toBe(0);
    expect(panorama.vencidoTotal).toBe(0);
    expect(panorama.meses.every(m => m.recebido === 0 && m.previsto === 0 && m.vencido === 0)).toBe(true);
  });

  it('previstas de pedido cancelado nao entram no panorama', () => {
    const orders = [
      pedido({
        status: 'canceled',
        payments: [parcela('cancelado-prev', 90, 'cancelado', dia(2026, 11, 15))]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.aReceberAno).toBe(0);
    expect(panorama.vencidoTotal).toBe(0);
    expect(panorama.meses.every(m => m.previsto === 0)).toBe(true);
  });

  it('pedido finished antigo sem payments conta como recebido no mes da paymentDate', () => {
    const orders = [
      pedido({
        status: 'finished',
        total: 250,
        payments: undefined,
        paymentDate: ts(dia(2026, 7, 8))
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);

    expect(panorama.meses[6].recebido).toBe(250);
    expect(panorama.recebidoAno).toBe(250);
  });
});

describe('calcularRecebidoNoPeriodo', () => {
  it('inclui pagamentos exatamente nas bordas inicio e fim', () => {
    const inicio = new Date(2026, 2, 1, 0, 0, 0, 0);
    const fim = new Date(2026, 2, 31, 23, 59, 59, 999);
    const orders = [
      pedido({
        payments: [
          pagamento('na-borda-inicio', 40, inicio),
          pagamento('na-borda-fim', 60, fim),
          pagamento('dia-antes', 99, new Date(2026, 1, 28, 12, 0)),
          pagamento('dia-depois', 99, new Date(2026, 3, 1, 12, 0))
        ]
      })
    ];

    expect(calcularRecebidoNoPeriodo(orders, inicio, fim)).toBe(100);
  });

  it('inclui sinal retido e exclui pagamento estornado no periodo', () => {
    const inicio = dia(2026, 3, 1);
    const fim = new Date(2026, 2, 31, 23, 59, 59, 999);
    const orders = [
      pedido({
        status: 'canceled',
        payments: [pagamento('sinal', 30, dia(2026, 3, 10))]
      }),
      pedido({
        payments: [pagamento('estorno', 20, dia(2026, 3, 10), 'estornado')]
      })
    ];

    expect(calcularRecebidoNoPeriodo(orders, inicio, fim)).toBe(30);
  });
});

describe('calcularAReceberTotal', () => {
  it('soma as previstas de pedidos nao cancelados, vencidas e futuras', () => {
    const orders = [
      pedido({
        payments: [
          parcela('vencida', 100, 'previsto', dia(2026, 10, 10)),
          parcela('futura', 200, 'previsto', dia(2026, 11, 1))
        ]
      }),
      pedido({
        status: 'canceled',
        payments: [parcela('cancelada', 90, 'cancelado', dia(2026, 11, 15))]
      })
    ];

    expect(calcularAReceberTotal(orders, HOJE)).toBe(300);
  });

  it('bate com o panorama anual do mesmo conjunto de pedidos', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('recebido', 40, dia(2026, 3, 5)),
          parcela('vencida', 100, 'previsto', dia(2026, 10, 10)),
          parcela('futura', 200, 'previsto', dia(2026, 11, 1))
        ]
      }),
      pedido({
        status: 'canceled',
        payments: [
          pagamento('sinal', 30, dia(2026, 4, 10)),
          parcela('cancelada', 90, 'cancelado', dia(2026, 11, 15))
        ]
      })
    ];

    const panorama = montarPanoramaAnual(orders, 2026, HOJE);
    const recebidoPeriodo = calcularRecebidoNoPeriodo(
      orders,
      new Date(2026, 0, 1, 0, 0, 0, 0),
      new Date(2026, 11, 31, 23, 59, 59, 999)
    );

    expect(panorama.recebidoAno).toBe(70);
    expect(panorama.aReceberAno).toBe(200);
    expect(panorama.vencidoTotal).toBe(100);
    expect(recebidoPeriodo).toBe(panorama.recebidoAno);
    expect(calcularAReceberTotal(orders, HOJE)).toBe(panorama.aReceberAno + panorama.vencidoTotal);
  });
});

describe('listarMovimentoDoMes', () => {
  // mes 0-11: 9 = outubro de 2026
  it('lista recebidos do mes pelo paidDate com tipo recebido', () => {
    const orders = [
      pedido({
        orderNumber: 4,
        customerName: 'Maria',
        payments: [pagamento('rec-out', 60, dia(2026, 10, 5))]
      })
    ];

    const movimento = listarMovimentoDoMes(orders, 2026, 9, HOJE);

    expect(movimento.length).toBe(1);
    expect(movimento[0].tipo).toBe('recebido');
    expect(movimento[0].amount).toBe(60);
    expect(movimento[0].orderNumber).toBe(4);
    expect(movimento[0].customerName).toBe('Maria');
    expect(movimento[0].data.getTime()).toBe(dia(2026, 10, 5).getTime());
  });

  it('classifica previsto nao vencido como previsto e vencido do mes como vencido', () => {
    const orders = [
      pedido({
        payments: [
          parcela('prev-25', 80, 'previsto', dia(2026, 10, 25)),
          parcela('venc-10', 40, 'previsto', dia(2026, 10, 10)),
          parcela('hoje-20', 15, 'previsto', dia(2026, 10, 20))
        ]
      })
    ];

    const movimento = listarMovimentoDoMes(orders, 2026, 9, HOJE);
    const tipoDe = (amount: number) => movimento.find(m => m.amount === amount)?.tipo;

    expect(tipoDe(80)).toBe('previsto');
    expect(tipoDe(40)).toBe('vencido');
    expect(tipoDe(15)).toBe('previsto');
  });

  it('nao inclui movimentos de outros meses', () => {
    const orders = [
      pedido({
        payments: [
          pagamento('set', 11, dia(2026, 9, 9)),
          parcela('nov', 12, 'previsto', dia(2026, 11, 1))
        ]
      })
    ];

    expect(listarMovimentoDoMes(orders, 2026, 9, HOJE).length).toBe(0);
  });

  it('ignora previstas de pedido cancelado e pagamentos estornados, mas inclui sinal retido', () => {
    const orders = [
      pedido({
        status: 'canceled',
        payments: [
          parcela('cancelada-prev', 25, 'previsto', dia(2026, 10, 25)),
          pagamento('sinal-out', 35, dia(2026, 10, 10))
        ]
      }),
      pedido({
        payments: [pagamento('estornado-out', 45, dia(2026, 10, 10), 'estornado')]
      })
    ];

    const movimento = listarMovimentoDoMes(orders, 2026, 9, HOJE);

    expect(movimento.length).toBe(1);
    expect(movimento[0].tipo).toBe('recebido');
    expect(movimento[0].amount).toBe(35);
  });
});

describe('resumirValoresPedidos', () => {
  it('total soma order.total, pago deriva dos pagos e saldo = total - pago', () => {
    const orders = [
      pedido({
        total: 100,
        payments: [
          pagamento('p-30', 30, dia(2026, 10, 5)),
          parcela('prev-70', 70, 'previsto', dia(2026, 11, 10))
        ]
      }),
      pedido({
        total: 50,
        payments: undefined
      })
    ];

    expect(resumirValoresPedidos(orders)).toEqual({ total: 150, pago: 30, saldo: 120 });
  });

  it('pedido finished antigo sem payments conta pago cheio e saldo zero', () => {
    const orders = [
      pedido({
        status: 'finished',
        total: 200,
        payments: undefined,
        paymentDate: ts(dia(2026, 7, 8))
      })
    ];

    const resumo = resumirValoresPedidos(orders);

    expect(resumo.pago).toBe(200);
    expect(resumo.saldo).toBe(0);
  });

  it('pagamento estornado nao soma em pago', () => {
    const orders = [
      pedido({
        total: 100,
        payments: [pagamento('est', 30, dia(2026, 10, 5), 'estornado')]
      })
    ];

    expect(resumirValoresPedidos(orders)).toEqual({ total: 100, pago: 0, saldo: 100 });
  });

  it('sinal retido de pedido cancelado entra no pago', () => {
    const orders = [
      pedido({
        status: 'canceled',
        total: 100,
        payments: [pagamento('sinal', 40, dia(2026, 10, 5))]
      })
    ];

    expect(resumirValoresPedidos(orders).pago).toBe(40);
  });

  it('lista vazia zera total, pago e saldo', () => {
    expect(resumirValoresPedidos([])).toEqual({ total: 0, pago: 0, saldo: 0 });
  });
});
