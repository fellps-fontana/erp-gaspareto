import { Timestamp } from '@angular/fire/firestore';
import { DateKey, Expense } from '../../models/expense-model';
import { Order, OrderPayment } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import { JANELA_AVISO_DIAS, despesasAVencer, parcelasAVencer } from './notification-rules';

const HOJE: DateKey = '2026-10-23';
const DENTRO_DA_JANELA: DateKey = '2026-10-26';
const FORA_DA_JANELA: DateKey = '2026-10-27';

const tsDoDia = (dateKey: DateKey): Timestamp =>
  Timestamp.fromDate(new Date(`${dateKey}T12:00:00-03:00`));

const despesa = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'd1',
  companyId: 'c1',
  description: 'Aluguel',
  value: 100,
  categoryId: 'cat1',
  dueDate: '2026-10-25',
  status: 'a_pagar',
  origin: 'manual',
  createdAt: tsDoDia('2026-10-01'),
  ...overrides,
});

const pedido = (overrides: Partial<Order> = {}): Order => ({
  id: 'p1',
  companyId: 'c1',
  orderNumber: 1,
  customerName: 'Ana',
  items: [],
  itemsTotal: 0,
  shippingCost: 0,
  total: 100,
  deliveryType: 'pickup',
  status: 'pending',
  createdAt: tsDoDia('2026-10-01'),
  payments: [],
  ...overrides,
});

const previsto = (id: string, amount: number, dueDate: DateKey): OrderPayment => ({
  id,
  amount,
  method: PaymentMethod.DINHEIRO,
  installments: 1,
  dueDate: tsDoDia(dueDate),
  status: 'previsto',
});

const pago = (id: string, amount: number): OrderPayment => ({
  id,
  amount,
  method: PaymentMethod.DINHEIRO,
  installments: 1,
  paidDate: tsDoDia(HOJE),
  status: 'pago',
});

describe('notification-rules', () => {
  describe('JANELA_AVISO_DIAS', () => {
    it('vale 3 dias', () => {
      expect(JANELA_AVISO_DIAS).toBe(3);
    });
  });

  describe('despesasAVencer', () => {
    it('janela inclusiva: hoje + 3 entra e hoje + 4 nao', () => {
      const avisos = despesasAVencer(
        [
          despesa({ id: 'dentro', dueDate: DENTRO_DA_JANELA }),
          despesa({ id: 'fora', dueDate: FORA_DA_JANELA }),
        ],
        HOJE,
      );

      expect(avisos.map((a) => a.expenseId)).toEqual(['dentro']);
    });

    it('marca vencida quando dueDate e anterior a hoje', () => {
      const [aviso] = despesasAVencer([despesa({ dueDate: '2026-10-20' })], HOJE);

      expect(aviso.vencida).toBeTrue();
    });

    it('vencimento de hoje entra e nao e vencida', () => {
      const [aviso] = despesasAVencer([despesa({ dueDate: HOJE })], HOJE);

      expect(aviso.vencida).toBeFalse();
    });

    it('ignora despesa paga, mesmo com vencimento na janela', () => {
      const avisos = despesasAVencer(
        [despesa({ status: 'pago', dueDate: DENTRO_DA_JANELA, paidDate: HOJE })],
        HOJE,
      );

      expect(avisos).toEqual([]);
    });

    it('mapeia expenseId, descricao, valor e dueDate', () => {
      const [aviso] = despesasAVencer(
        [despesa({ id: 'x9', description: 'Energia', value: 245.5, dueDate: DENTRO_DA_JANELA })],
        HOJE,
      );

      expect(aviso).toEqual({
        expenseId: 'x9',
        descricao: 'Energia',
        valor: 245.5,
        dueDate: DENTRO_DA_JANELA,
        vencida: false,
      });
    });

    it('ordena por dueDate crescente', () => {
      const avisos = despesasAVencer(
        [
          despesa({ id: 'b', dueDate: DENTRO_DA_JANELA }),
          despesa({ id: 'a', dueDate: '2026-10-20' }),
          despesa({ id: 'c', dueDate: '2026-10-24' }),
        ],
        HOJE,
      );

      expect(avisos.map((a) => a.expenseId)).toEqual(['a', 'c', 'b']);
    });

    it('retorna vazio quando nao ha despesas', () => {
      expect(despesasAVencer([], HOJE)).toEqual([]);
    });

    it('respeita o parametro dias', () => {
      const avisos = despesasAVencer([despesa({ dueDate: DENTRO_DA_JANELA })], HOJE, 0);

      expect(avisos).toEqual([]);
    });
  });

  describe('parcelasAVencer', () => {
    it('janela inclusiva: parcela em hoje + 3 entra e hoje + 4 nao', () => {
      const avisos = parcelasAVencer(
        [
          pedido({
            id: 'p1',
            payments: [
              previsto('dentro', 50, DENTRO_DA_JANELA),
              previsto('fora', 50, FORA_DA_JANELA),
            ],
          }),
        ],
        HOJE,
      );

      expect(avisos.map((a) => a.valor)).toEqual([50]);
      expect(avisos[0].dueDate).toBe(DENTRO_DA_JANELA);
    });

    it('marca vencida quando dueDate e anterior a hoje', () => {
      const [aviso] = parcelasAVencer(
        [pedido({ payments: [previsto('p', 40, '2026-10-20')] })],
        HOJE,
      );

      expect(aviso.vencida).toBeTrue();
    });

    it('ignora parcela ja paga', () => {
      const avisos = parcelasAVencer(
        [pedido({ payments: [pago('p1', 60), previsto('p2', 40, '2026-10-25')] })],
        HOJE,
      );

      expect(avisos.map((a) => a.valor)).toEqual([40]);
    });

    it('ignora pedido cancelado', () => {
      const avisos = parcelasAVencer(
        [pedido({ status: 'canceled', payments: [previsto('p', 40, '2026-10-25')] })],
        HOJE,
      );

      expect(avisos).toEqual([]);
    });

    it('usa customerName do pedido e "Sem cliente" quando vazio', () => {
      const avisos = parcelasAVencer(
        [
          pedido({ id: 'a', customerName: 'Bruno', payments: [previsto('p1', 10, HOJE)] }),
          pedido({ id: 'b', customerName: '', payments: [previsto('p2', 20, HOJE)] }),
        ],
        HOJE,
      );

      expect(avisos.map((a) => a.clienteNome)).toEqual(['Bruno', 'Sem cliente']);
    });

    it('mapeia orderId, valor, dueDate e vencida', () => {
      const [aviso] = parcelasAVencer(
        [pedido({ id: 'ped9', payments: [previsto('p', 75.9, DENTRO_DA_JANELA)] })],
        HOJE,
      );

      expect(aviso).toEqual({
        orderId: 'ped9',
        clienteNome: 'Ana',
        valor: 75.9,
        dueDate: DENTRO_DA_JANELA,
        vencida: false,
      });
    });

    it('converte dueDate para dia em America/Sao_Paulo', () => {
      // 2026-10-27 02:30 UTC = 2026-10-26 23:30 em Sao Paulo: ainda dentro da janela
      const dueDate = Timestamp.fromDate(new Date('2026-10-27T02:30:00Z'));
      const [aviso] = parcelasAVencer(
        [pedido({ payments: [{ ...previsto('p', 10, HOJE), dueDate }] })],
        HOJE,
      );

      expect(aviso.dueDate).toBe(DENTRO_DA_JANELA);
    });

    it('ignora parcela sem dueDate', () => {
      const semData: OrderPayment = { ...previsto('p', 10, HOJE), dueDate: undefined };

      expect(parcelasAVencer([pedido({ payments: [semData] })], HOJE)).toEqual([]);
    });

    it('ordena por dueDate crescente entre pedidos', () => {
      const avisos = parcelasAVencer(
        [
          pedido({ id: 'p1', payments: [previsto('a', 1, DENTRO_DA_JANELA)] }),
          pedido({ id: 'p2', payments: [previsto('b', 2, '2026-10-20')] }),
          pedido({ id: 'p3', payments: [previsto('c', 3, HOJE)] }),
        ],
        HOJE,
      );

      expect(avisos.map((a) => a.orderId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('retorna vazio quando nao ha pedidos', () => {
      expect(parcelasAVencer([], HOJE)).toEqual([]);
    });
  });
});
