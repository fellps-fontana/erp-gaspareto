import { Timestamp } from '@angular/fire/firestore';
import { Order, OrderPayment } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import { excluirPedidosForaDoKanban, pedidoSaiuDoKanban } from './order-filters';

const agora = Timestamp.fromDate(new Date(2026, 9, 20, 12, 0));

function pedido(over: Partial<Order>): Order {
  return {
    companyId: 'empresa-1',
    orderNumber: 1,
    customerName: 'Cliente Teste',
    items: [],
    itemsTotal: 100,
    shippingCost: 0,
    total: 100,
    deliveryType: 'pickup',
    status: 'delivered',
    createdAt: agora,
    ...over
  };
}

function previsto(id: string, amount: number): OrderPayment {
  return {
    id,
    amount,
    method: PaymentMethod.BOLETO,
    installments: 1,
    dueDate: Timestamp.fromDate(new Date(2026, 10, 10)),
    status: 'previsto'
  };
}

function pago(id: string, amount: number): OrderPayment {
  return {
    id,
    amount,
    method: PaymentMethod.DINHEIRO,
    installments: 1,
    paidDate: agora,
    status: 'pago'
  };
}

describe('pedidoSaiuDoKanban', () => {
  it('delivered com saldo todo coberto por previstas sai do kanban', () => {
    const order = pedido({ status: 'delivered', total: 100, payments: [previsto('p1', 100)] });

    expect(pedidoSaiuDoKanban(order)).toBe(true);
  });

  it('delivered com pago parcial e previsto cobrindo o restante sai do kanban', () => {
    const order = pedido({
      status: 'delivered',
      total: 100,
      payments: [pago('p0', 40), previsto('p1', 60)]
    });

    expect(pedidoSaiuDoKanban(order)).toBe(true);
  });

  it('delivered sem parcelas nao sai do kanban', () => {
    const order = pedido({ status: 'delivered', total: 100, payments: undefined });

    expect(pedidoSaiuDoKanban(order)).toBe(false);
  });

  it('delivered com parcelas cobrindo so parte do saldo nao sai do kanban', () => {
    const order = pedido({ status: 'delivered', total: 100, payments: [previsto('p1', 60)] });

    expect(pedidoSaiuDoKanban(order)).toBe(false);
  });

  it('delivered com saldo zero (tudo pago, sem previstas) nao sai do kanban', () => {
    const order = pedido({ status: 'delivered', total: 100, payments: [pago('p0', 100)] });

    expect(pedidoSaiuDoKanban(order)).toBe(false);
  });

  it('pending com parcelas cobrindo tudo nao sai do kanban', () => {
    const order = pedido({ status: 'pending', total: 100, payments: [previsto('p1', 100)] });

    expect(pedidoSaiuDoKanban(order)).toBe(false);
  });

  it('finished nao sai do kanban (fica fora por outra regra)', () => {
    const order = pedido({ status: 'finished', total: 100, payments: [pago('p0', 100)] });

    expect(pedidoSaiuDoKanban(order)).toBe(false);
  });
});

describe('excluirPedidosForaDoKanban', () => {
  it('remove so os pedidos que sairam do kanban e preserva a ordem original', () => {
    const saiu = pedido({ orderNumber: 1, status: 'delivered', total: 100, payments: [previsto('a', 100)] });
    const pendente = pedido({ orderNumber: 2, status: 'pending', total: 100, payments: [previsto('b', 100)] });
    const semParcelas = pedido({ orderNumber: 3, status: 'delivered', total: 100, payments: undefined });
    const parcial = pedido({ orderNumber: 4, status: 'delivered', total: 100, payments: [previsto('c', 60)] });

    const resultado = excluirPedidosForaDoKanban([saiu, pendente, semParcelas, parcial]);

    expect(resultado.map(o => o.orderNumber)).toEqual([2, 3, 4]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(excluirPedidosForaDoKanban([])).toEqual([]);
  });

  it('lista sem nenhum pedido que saiu devolve os mesmos pedidos na mesma ordem', () => {
    const a = pedido({ orderNumber: 10, status: 'pending', total: 100 });
    const b = pedido({ orderNumber: 11, status: 'delivered', total: 100, payments: [pago('x', 50)] });

    const resultado = excluirPedidosForaDoKanban([a, b]);

    expect(resultado.map(o => o.orderNumber)).toEqual([10, 11]);
  });

  it('nao altera a lista de entrada', () => {
    const saiu = pedido({ orderNumber: 1, status: 'delivered', total: 100, payments: [previsto('a', 100)] });
    const entrada = [saiu, pedido({ orderNumber: 2, status: 'pending', total: 100 })];

    excluirPedidosForaDoKanban(entrada);

    expect(entrada.length).toBe(2);
  });
});
