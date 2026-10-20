import { TestBed } from '@angular/core/testing';
import { OrderService } from './order-service';
import { SaleService } from '../sale-service/sale-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Order, OrderPayment } from '../../models/order-model';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { setDoc, doc, collection, query, where, getDoc, getDocs } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';
import { firstValueFrom } from 'rxjs';
import { PaymentMethod } from '../../models/sell-model';
import { PagamentoInvalidoError } from './order-payment-rules';

describe('OrderService - Multi-tenant (companyId isolation)', () => {
  let service: OrderService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        OrderService,
        SaleService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(OrderService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getOrders() - Leitura', () => {
      it('[RED] should filter by companyId - own orders appear, foreign orders do not', async () => {
        const secondSetup = await setupSecondUserContext();
        try {
          const now = new Date() as any;

          // Seed: own company's order
          const ownOrder: Order = {
            companyId: setup.mockCompanyId as string,
            customerName: 'Own',
            items: [],
            itemsTotal: 100,
            shippingCost: 10,
            total: 110,
            orderNumber: 1,
            status: 'open',
            deliveryType: 'delivery',
            scheduledDate: now,
            createdAt: now
          };
          await setDoc(doc(setup.firestore, `orders/own-order-${Date.now()}`), ownOrder);

          // Seed: foreign company's order (written by second user, should NOT appear to first user)
          const foreignOrder: Order = {
            companyId: secondSetup.mockCompanyId as string,
            customerName: 'Foreign',
            items: [],
            itemsTotal: 50,
            shippingCost: 5,
            total: 55,
            orderNumber: 1,
            status: 'open',
            deliveryType: 'delivery',
            scheduledDate: now,
            createdAt: now
          };
          await setDoc(doc(secondSetup.firestore, `orders/foreign-order-${Date.now()}`), foreignOrder);

          // Call service (as first user)
          const orders = await firstValueFrom(service.getOrders());

          // ASSERTION: own order must appear
          const ownAppears = orders.some((o: any) => o.companyId === setup.mockCompanyId && o.customerName === 'Own');
          expect(ownAppears).toBeTruthy('Own company order must appear');

          // ASSERTION: foreign order must NOT appear
          const foreignAppears = orders.some((o: any) => o.companyId === secondSetup.mockCompanyId);
          expect(foreignAppears).toBeFalsy('Foreign company order must NOT appear');
        } finally {
          await secondSetup.cleanup();
        }
      });
    });

    describe('[RED] addOrder() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding order', async () => {
        const now = new Date() as any;
        const newOrder = {
          customerName: 'Test',
          items: [],
          itemsTotal: 0,
          shippingCost: 0,
          total: 0,
          deliveryType: 'pickup' as const,
          scheduledDate: now
        };

        await service.addOrder(newOrder as any);

        const orders = await firstValueFrom(service.getOrders());
        const hasOrder = orders.some((o: any) => o.companyId === setup.mockCompanyId);
        expect(hasOrder).toBeTruthy('Order must be saved with companyId');
      });
    });
  });

  describe('NOVA REGRA: companyId null must trigger error (CRÍTICA)', () => {
    describe('[RED] addOrder() - Guarda contra companyId nulo', () => {
      it('[RED] should reject addOrder when companyId is null', async () => {
        const setupWithNullCompany = await setupFirestoreEmulatorTest(null);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            OrderService,
            { provide: TenantService, useValue: setupWithNullCompany.tenantService },
            { provide: Firestore, useValue: setupWithNullCompany.firestore }
          ]
        });
        const serviceWithNullCompany = TestBed.inject(OrderService);

        const now = new Date() as any;
        const newOrder = {
          customerName: 'Test',
          items: [],
          itemsTotal: 0,
          shippingCost: 0,
          total: 0,
          deliveryType: 'pickup' as const,
          scheduledDate: now
        };

        try {
          await serviceWithNullCompany.addOrder(newOrder as any);
          fail('Expected addOrder to throw error when companyId is null');
        } catch (error: any) {
          expect(error.message).toMatch(/companyId|empresa|tenant|null/i,
            'Error must mention missing companyId or company/tenant association'
          );
        } finally {
          await setupWithNullCompany.cleanup();
        }
      });
    });
  });

  describe('NOVA REGRA: pagamentos, conclusao e parcelas de Pedidos (CRÍTICA)', () => {
    // Helpers locais: seed direto no Firestore (o service so e exercitado nas chamadas).
    const DATA_D1 = new Date(2026, 9, 1);   // 2026-10-01
    const DATA_D2 = new Date(2026, 9, 15);  // 2026-10-15
    const VENCIMENTO_1 = new Date(2026, 10, 10); // 2026-11-10
    const VENCIMENTO_2 = new Date(2026, 11, 10); // 2026-12-10

    const companyId = (): string => setup.mockCompanyId as string;

    function criarPedido(overrides: Partial<Order>): Order {
      const now = new Date() as any;
      return {
        companyId: companyId(),
        orderNumber: 1,
        customerName: 'Cliente de teste',
        items: [
          { idProduct: 'prod-pag-1', productName: 'Produto de pagamento', quantity: 1, priceAtSale: 100, priceAtCost: 60 }
        ],
        itemsTotal: 100,
        shippingCost: 0,
        total: 100,
        status: 'delivered',
        deliveryType: 'pickup',
        scheduledDate: now,
        actualDeliveryDate: now,
        createdAt: now,
        ...overrides
      };
    }

    async function gravarPedido(label: string, overrides: Partial<Order>): Promise<string> {
      const orderId = `order-${label}-${Date.now()}`;
      await setDoc(doc(setup.firestore, `orders/${orderId}`), criarPedido(overrides));
      return orderId;
    }

    async function gravarVenda(label: string): Promise<string> {
      const saleId = `sale-${label}-${Date.now()}`;
      await setDoc(doc(setup.firestore, `sales/${saleId}`), {
        companyId: companyId(),
        items: [
          { idProduct: 'prod-pag-1', productName: 'Produto de pagamento', quantity: 1, priceAtSale: 100, priceAtCost: 60, soldByWeight: false }
        ],
        total: 100,
        date: new Date(),
        status: 'completed',
        sale_type: 'order'
      });
      return saleId;
    }

    async function lerPedido(orderId: string): Promise<any> {
      const snap = await getDoc(doc(setup.firestore, `orders/${orderId}`));
      return snap.data();
    }

    async function lerVenda(saleId: string): Promise<any> {
      if (!saleId) return undefined;
      const snap = await getDoc(doc(setup.firestore, `sales/${saleId}`));
      return snap.data();
    }

    async function contarVendas(): Promise<number> {
      const snap = await getDocs(query(collection(setup.firestore, 'sales'), where('companyId', '==', companyId())));
      return snap.size;
    }

    async function capturarErro(operacao: () => Promise<unknown>): Promise<any> {
      try {
        await operacao();
      } catch (erro) {
        return erro;
      }
      return undefined;
    }

    const parcelaPrevista = (id: string, amount: number, dueDate: Date, method: PaymentMethod = PaymentMethod.BOLETO): OrderPayment => ({
      id,
      amount,
      method,
      installments: 1,
      dueDate: Timestamp.fromDate(dueDate),
      status: 'previsto'
    });

    describe('[RED] registerPayment() - Pagamento parcial e validacoes', () => {
      it('[RED] should record a partial payment as pago and drop the derived saldo', async () => {
        const saleId = await gravarVenda('parcial');
        const orderId = await gravarPedido('parcial', { saleId });

        const resultado = await service.registerPayment(orderId, {
          amount: 40,
          method: PaymentMethod.DINHEIRO,
          paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: false, saldo: 60 });
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('delivered', 'Pagamento parcial nao conclui o pedido');
        expect(pedido['payments'].length).toBe(1);
        expect(pedido['payments'][0].status).toBe('pago');
        expect(pedido['payments'][0].amount).toBe(40);
        expect(pedido['payments'][0].method).toBe(PaymentMethod.DINHEIRO);
      });

      it('[RED] should reject amount above saldo with ACIMA_DO_SALDO and write nothing', async () => {
        const saleId = await gravarVenda('acima');
        const orderId = await gravarPedido('acima', { saleId });

        await service.registerPayment(orderId, { amount: 40, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 61, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 })
        );

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('ACIMA_DO_SALDO');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments'].length).toBe(1, 'Pagamento rejeitado nao pode ser gravado');
        expect(pedido['payments'][0].amount).toBe(40);
      });

      it('[RED] should reject zero amount with VALOR_INVALIDO and write nothing', async () => {
        const saleId = await gravarVenda('zero');
        const orderId = await gravarPedido('zero', { saleId });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 0, method: PaymentMethod.DINHEIRO })
        );

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('VALOR_INVALIDO');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments']).toBeUndefined('Valor zero nao pode gerar pagamento');
      });

      it('[RED] should reject payment on canceled order with PEDIDO_CANCELADO and write nothing', async () => {
        const orderId = await gravarPedido('cancelado', { status: 'canceled' });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 10, method: PaymentMethod.DINHEIRO })
        );

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PEDIDO_CANCELADO');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments']).toBeUndefined('Pedido cancelado nao pode receber pagamento');
      });

      it('[RED] should reject payment on finished order with PEDIDO_FINALIZADO and keep payments', async () => {
        const orderId = await gravarPedido('finalizado', {
          status: 'finished',
          paymentDate: Timestamp.fromDate(DATA_D1) as any,
          payments: [{ id: 'pago-fin', amount: 100, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }]
        });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 10, method: PaymentMethod.DINHEIRO })
        );

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PEDIDO_FINALIZADO');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments'].length).toBe(1, 'Pedido finalizado nao ganha novo pagamento');
      });

      it('[RED] should reject parcelaId that is not a previsto of the order with PARCELA_INEXISTENTE', async () => {
        const orderId = await gravarPedido('parcela-inexistente', {
          status: 'pending',
          payments: [parcelaPrevista('p-existente', 100, VENCIMENTO_1)]
        });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 10, method: PaymentMethod.BOLETO, parcelaId: 'p-inexistente' })
        );

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PARCELA_INEXISTENTE');
      });
    });

    describe('[RED] registerPayment() - Pagamento antes da entrega', () => {
      it('[RED] should allow payment on pending order that zera saldo but does NOT conclude it', async () => {
        const orderId = await gravarPedido('pendente', { status: 'pending' });

        const resultado = await service.registerPayment(orderId, {
          amount: 100,
          method: PaymentMethod.DINHEIRO,
          paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: false, saldo: 0 });
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('pending', 'Pedido nao entregue nao pode concluir');
        expect(pedido['paymentDate']).toBeUndefined();
        expect(pedido['closingDate']).toBeUndefined();
        expect(pedido['saleId']).toBeUndefined();
        expect(await contarVendas()).toBe(0, 'Venda de pedido nasce na entrega, nao no pagamento');
      });
    });

    describe('[RED] registerPayment() - Conclusao e forma final', () => {
      it('[RED] should conclude delivered order when payment zera saldo and fill forma, datas and Sale', async () => {
        const saleId = await gravarVenda('conclui');
        const orderId = await gravarPedido('conclui', { saleId });

        const resultado = await service.registerPayment(orderId, {
          amount: 100,
          method: PaymentMethod.DINHEIRO,
          installments: 1,
          paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: true, saldo: 0 });
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('finished');
        expect(pedido['paymentDate']).toBeDefined('paymentDate deve ser preenchida na conclusao');
        expect(pedido['closingDate']).toBeDefined('closingDate deve ser preenchida na conclusao');
        expect(pedido['paymentMethod']).toBe(PaymentMethod.DINHEIRO);
        expect(pedido['installments']).toBe(1);
      });

      it('[RED] should update existing Sale with forma of the last pago by paidDate, not by insertion order', async () => {
        const saleId = await gravarVenda('ultimo-por-data');
        const orderId = await gravarPedido('ultimo-por-data', { saleId });

        // Grava primeiro o pagamento mais recente (paidDate D2) e depois o mais antigo (D1)
        await service.registerPayment(orderId, {
          amount: 60, method: PaymentMethod.CARTAO, installments: 5, paidDate: DATA_D2
        });
        const resultado = await service.registerPayment(orderId, {
          amount: 40, method: PaymentMethod.CARTAO, installments: 2, paidDate: DATA_D1
        });

        expect(resultado.concluido).toBeTruthy();
        const venda = await lerVenda(saleId);
        expect(venda['paymentMethod']).toBe(PaymentMethod.CARTAO);
        expect(venda['installments']).toBe(5, 'Forma final vem do pagamento de paidDate mais recente');
        const pedido = await lerPedido(orderId);
        expect(pedido['installments']).toBe(5, 'Order.installments espelha a Sale');
      });

      it('[RED] should set misto and installments 1 on Sale and Order when more than one forma was pago', async () => {
        const saleId = await gravarVenda('misto');
        const orderId = await gravarPedido('misto', { saleId });

        await service.registerPayment(orderId, {
          amount: 40, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: DATA_D1
        });
        const resultado = await service.registerPayment(orderId, {
          amount: 60, method: PaymentMethod.CARTAO, installments: 3, paidDate: DATA_D2
        });

        expect(resultado.concluido).toBeTruthy();
        const venda = await lerVenda(saleId);
        expect(venda['paymentMethod']).toBe(PaymentMethod.MISTO);
        expect(venda['installments']).toBe(1);
        const pedido = await lerPedido(orderId);
        expect(pedido['paymentMethod']).toBe(PaymentMethod.MISTO);
        expect(pedido['installments']).toBe(1);
      });

      it('[RED] should create Sale on conclusion for legacy delivered order (no saleId) with total cheio and forma', async () => {
        const orderId = await gravarPedido('legado', { total: 80, itemsTotal: 80 });
        expect(await contarVendas()).toBe(0);

        const resultado = await service.registerPayment(orderId, {
          amount: 80, method: PaymentMethod.CARTAO, installments: 2, paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: true, saldo: 0 });
        const pedido = await lerPedido(orderId);
        expect(pedido['saleId']).toBeDefined('Order.saleId deve ser gravado ao criar a Sale legada');
        const venda = await lerVenda(pedido['saleId']);
        expect(venda).toBeDefined();
        expect(venda['sale_type']).toBe('order');
        expect(venda['total']).toBe(80, 'Sale legada deve ter total cheio do pedido');
        expect(venda['status']).toBe('completed');
        expect(venda['paymentMethod']).toBe(PaymentMethod.CARTAO);
        expect(venda['installments']).toBe(2);
        expect(await contarVendas()).toBe(1);
      });

      it('[RED] should not create Sale on partial payment of legacy order and never duplicate it on conclusion', async () => {
        const orderId = await gravarPedido('legado-sem-duplicar', { total: 100, itemsTotal: 100 });

        await service.registerPayment(orderId, { amount: 40, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 });
        expect(await contarVendas()).toBe(0, 'Pagamento parcial nao cria Sale');

        await service.registerPayment(orderId, { amount: 60, method: PaymentMethod.DINHEIRO, paidDate: DATA_D2 });
        expect(await contarVendas()).toBe(1, 'Conclusao cria exatamente uma Sale');

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 1, method: PaymentMethod.DINHEIRO })
        );
        expect(erro?.codigo).toBe('PEDIDO_FINALIZADO');
        expect(await contarVendas()).toBe(1, 'Nova tentativa nao pode gerar Sale duplicada');
      });

      it('[RED] should keep cartao as pago on the spot, never as previsto', async () => {
        const saleId = await gravarVenda('cartao');
        const orderId = await gravarPedido('cartao', { saleId });

        const resultado = await service.registerPayment(orderId, {
          amount: 30, method: PaymentMethod.CARTAO, installments: 3, paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: false, saldo: 70 });
        const pedido = await lerPedido(orderId);
        expect(pedido['payments'].length).toBe(1);
        expect(pedido['payments'][0].status).toBe('pago', 'Cartao nunca vira previsto');
        expect(pedido['payments'][0].installments).toBe(3, 'installments do cartao e informativo');
      });

      it('[RED] should allow PIX with installments > 1 and preserve them (Pix agora parcela)', async () => {
        const saleId = await gravarVenda('pix-parcelado');
        const orderId = await gravarPedido('pix-parcelado', { saleId });

        const resultado = await service.registerPayment(orderId, {
          amount: 100, method: PaymentMethod.PIX, installments: 3, paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: true, saldo: 0 });
        const pedido = await lerPedido(orderId);
        expect(pedido['payments'][0].installments).toBe(3, 'Pix preserva installments=3 no pagamento');
        expect(pedido['installments']).toBe(3, 'Order.installments deve refletir a Pix parcelado');
        expect(pedido['paymentMethod']).toBe(PaymentMethod.PIX);
        const venda = await lerVenda(saleId);
        expect(venda['installments']).toBe(3, 'Sale.installments deve refletir a Pix parcelado');
        expect(venda['paymentMethod']).toBe(PaymentMethod.PIX);
      });

      it('[RED] should normalize installments <= 0 to 1 on payment and on Sale/Order', async () => {
        const saleId = await gravarVenda('normaliza');
        const orderId = await gravarPedido('normaliza', { saleId });

        await service.registerPayment(orderId, {
          amount: 50, method: PaymentMethod.DINHEIRO, installments: 0, paidDate: DATA_D1
        });
        let pedido = await lerPedido(orderId);
        expect(pedido['payments'][0].installments).toBe(1, 'installments 0 normaliza para 1 no pagamento');

        const resultado = await service.registerPayment(orderId, {
          amount: 50, method: PaymentMethod.DINHEIRO, installments: -3, paidDate: DATA_D2
        });

        expect(resultado.concluido).toBeTruthy();
        pedido = await lerPedido(orderId);
        expect(pedido['installments']).toBe(1, 'installments -3 normaliza para 1 no Order');
        const venda = await lerVenda(saleId);
        expect(venda['installments']).toBe(1, 'installments -3 normaliza para 1 na Sale');
      });
    });

    describe('[RED] registerPayment() - Atomicidade', () => {
      it('[RED] should roll back payment and conclusion when Sale update fails (saleId aponta para Sale inexistente)', async () => {
        const orderId = await gravarPedido('atomico', { saleId: `sale-inexistente-${Date.now()}` });

        const erro = await capturarErro(() =>
          service.registerPayment(orderId, { amount: 100, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 })
        );

        // Falha real da transacao (update em Sale inexistente), nao o stub da fase RED
        expect(erro).toBeDefined('A transacao deve falhar ao atualizar a Sale inexistente');
        expect(erro?.message).not.toBe('NotImplemented', 'A falha deve vir da transacao, nao do stub');
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('delivered', 'Pedido nao pode virar finished se a transacao falhou');
        expect(pedido['payments']).toBeUndefined('Pagamento nao pode ficar gravado se a transacao falhou');
        expect(pedido['paymentDate']).toBeUndefined();
        expect(pedido['closingDate']).toBeUndefined();
        expect(await contarVendas()).toBe(0, 'Nenhuma Sale deve ser criada');
      });
    });

    describe('[RED] registerPayment() - Pagamento de parcela e avulso', () => {
      it('[RED] should reajustar a proxima prevista when parcela e paga por menos (diferenca vai para a seguinte)', async () => {
        const saleId = await gravarVenda('parcela-reajusta');
        const orderId = await gravarPedido('parcela-reajusta', {
          saleId,
          payments: [
            parcelaPrevista('p1', 50, VENCIMENTO_1),
            parcelaPrevista('p2', 50, VENCIMENTO_2)
          ]
        });

        const resultado = await service.registerPayment(orderId, {
          amount: 30, method: PaymentMethod.DINHEIRO, parcelaId: 'p1', paidDate: DATA_D1
        });

        expect(resultado).toEqual({ concluido: false, saldo: 70 });
        const pedido = await lerPedido(orderId);
        const previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.length).toBe(1, 'p1 consumida; apenas p2 continua prevista');
        expect(previstas[0].id).toBe('p2');
        expect(previstas[0].amount).toBe(70, 'Diferenca de 20 credita na proxima parcela');
        const pagos = pedido['payments'].filter((p: OrderPayment) => p.status === 'pago');
        expect(pagos.length).toBe(1);
        expect(pagos[0].amount).toBe(30);
      });

      it('[RED] should criar nova parcela em dueDate da paga + 30 dias when nao ha proxima prevista', async () => {
        const saleId = await gravarVenda('parcela-nova');
        const orderId = await gravarPedido('parcela-nova', {
          saleId,
          payments: [parcelaPrevista('p-unica', 100, VENCIMENTO_1)]
        });

        await service.registerPayment(orderId, {
          amount: 30, method: PaymentMethod.DINHEIRO, parcelaId: 'p-unica', paidDate: DATA_D1
        });

        const pedido = await lerPedido(orderId);
        const previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.length).toBe(1, 'Deve existir exatamente uma nova parcela prevista');
        expect(previstas[0].amount).toBe(70);
        const esperado = new Date(VENCIMENTO_1);
        esperado.setDate(esperado.getDate() + 30);
        expect(previstas[0].dueDate.toDate().getTime()).toBe(esperado.getTime(), 'Nova parcela vence 30 dias depois da paga');
      });

      it('[RED] should abater as previstas mais antigas on pagamento avulso (e remover a que zera)', async () => {
        const saleId = await gravarVenda('avulso');
        const orderId = await gravarPedido('avulso', {
          saleId,
          payments: [
            parcelaPrevista('p1', 50, VENCIMENTO_1),
            parcelaPrevista('p2', 50, VENCIMENTO_2)
          ]
        });

        await service.registerPayment(orderId, { amount: 30, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 });
        let pedido = await lerPedido(orderId);
        let previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.map((p: OrderPayment) => [p.id, p.amount])).toEqual([['p1', 20], ['p2', 50]]);

        await service.registerPayment(orderId, { amount: 20, method: PaymentMethod.DINHEIRO, paidDate: DATA_D2 });
        pedido = await lerPedido(orderId);
        previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.map((p: OrderPayment) => [p.id, p.amount])).toEqual([['p2', 50]], 'p1 zerada sai da lista');
      });
    });

    describe('[RED] setScheduledInstallments()', () => {
      it('[RED] should reject parcelas whose soma nao fecha o saldo with PARCELAS_NAO_FECHAM and write nothing', async () => {
        const orderId = await gravarPedido('nao-fecha', { status: 'pending' });

        const erro = await capturarErro(() => service.setScheduledInstallments(orderId, [
          { amount: 50, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO },
          { amount: 40, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO }
        ]));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PARCELAS_NAO_FECHAM');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments']).toBeUndefined('Agenda rejeitada nao pode ser gravada');
      });

      it('[RED] should compare soma em centavos: 3 x 33.33 nao fecha 100 e e rejeitado', async () => {
        const orderId = await gravarPedido('centavos', { status: 'pending' });

        const erro = await capturarErro(() => service.setScheduledInstallments(orderId, [
          { amount: 33.33, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO },
          { amount: 33.33, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO },
          { amount: 33.33, dueDate: new Date(2027, 0, 10), method: PaymentMethod.BOLETO }
        ]));

        expect(erro?.codigo).toBe('PARCELAS_NAO_FECHAM');
      });

      it('[RED] should reject parcela de cartao with CARTAO_NAO_PARCELA', async () => {
        const orderId = await gravarPedido('cartao-parcela', { status: 'pending' });

        const erro = await capturarErro(() => service.setScheduledInstallments(orderId, [
          { amount: 50, dueDate: VENCIMENTO_1, method: PaymentMethod.CARTAO },
          { amount: 50, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO }
        ]));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('CARTAO_NAO_PARCELA');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments']).toBeUndefined();
      });

      it('[RED] should reject parcela com valor zero with VALOR_INVALIDO', async () => {
        const orderId = await gravarPedido('valor-zero-parcela', { status: 'pending' });

        const erro = await capturarErro(() => service.setScheduledInstallments(orderId, [
          { amount: 0, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO },
          { amount: 100, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO }
        ]));

        expect(erro?.codigo).toBe('VALOR_INVALIDO');
      });

      it('[RED] should reject agenda on canceled order with PEDIDO_CANCELADO', async () => {
        const orderId = await gravarPedido('agenda-cancelado', { status: 'canceled' });

        const erro = await capturarErro(() => service.setScheduledInstallments(orderId, [
          { amount: 100, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO }
        ]));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PEDIDO_CANCELADO');
        const pedido = await lerPedido(orderId);
        expect(pedido['payments']).toBeUndefined();
      });

      it('[RED] should substituir as previstas, fechar o saldo e preservar as pagas', async () => {
        const orderId = await gravarPedido('substitui', {
          payments: [
            { id: 'pago-1', amount: 30, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' },
            parcelaPrevista('antiga', 70, VENCIMENTO_1)
          ]
        });

        await service.setScheduledInstallments(orderId, [
          { amount: 35, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO },
          { amount: 35, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO }
        ]);

        const pedido = await lerPedido(orderId);
        const pagos = pedido['payments'].filter((p: OrderPayment) => p.status === 'pago');
        expect(pagos.length).toBe(1);
        expect(pagos[0].id).toBe('pago-1', 'Parcela paga preservada');
        expect(pagos[0].amount).toBe(30);
        expect(pedido['payments'].some((p: OrderPayment) => p.id === 'antiga')).toBeFalsy('Prevista antiga substituida');
        const previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.length).toBe(2);
        expect(previstas.reduce((acc: number, p: OrderPayment) => acc + p.amount, 0)).toBe(70, 'Soma das previstas fecha o saldo');
        previstas.forEach((p: OrderPayment) => expect(p.installments).toBe(1, 'previsto sempre installments 1'));
      });
    });

    // Helpers do ciclo de entrega, cancelamento e edicao (seção 5 e 5.3).
    const PRECO_CUSTO = 60;
    const PRECO_VENDA = 100;

    async function gravarProduto(label: string, stock: number): Promise<string> {
      const produtoId = `prod-${label}-${Date.now()}`;
      await setDoc(doc(setup.firestore, `products/${produtoId}`), {
        companyId: companyId(),
        name: `Produto ${label}`,
        stock,
        buyPrice: PRECO_CUSTO,
        sellPrice: PRECO_VENDA
      });
      return produtoId;
    }

    async function lerProduto(produtoId: string): Promise<any> {
      const snap = await getDoc(doc(setup.firestore, `products/${produtoId}`));
      return snap.data();
    }

    async function lerVendas(): Promise<any[]> {
      const snap = await getDocs(query(collection(setup.firestore, 'sales'), where('companyId', '==', companyId())));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    function itemDoProduto(produtoId: string, quantity: number, priceAtSale = PRECO_VENDA) {
      return { idProduct: produtoId, productName: `Produto ${produtoId}`, quantity, priceAtSale, priceAtCost: PRECO_CUSTO, soldByWeight: false };
    }

    describe('[RED] markAsDelivered() - Entrega e criacao da Sale', () => {
      it('[RED] should baixar estoque, criar Sale completed com total cheio e gravar saleId/actualDeliveryDate na mesma transacao', async () => {
        const produtoId = await gravarProduto('entrega-feliz', 10);
        const clienteId = 'cliente-entrega';
        const orderId = await gravarPedido('entrega-feliz', {
          status: 'pending',
          customerId: clienteId,
          items: [itemDoProduto(produtoId, 3)],
          itemsTotal: 300,
          total: 300
        });

        await service.markAsDelivered(orderId);

        expect((await lerProduto(produtoId))['stock']).toBe(7, 'Baixa de estoque exata (10 - 3)');
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('delivered');
        expect(pedido['saleId']).toBeDefined('Order.saleId gravado na entrega');
        expect(pedido['actualDeliveryDate']).toBeDefined('actualDeliveryDate gravada na entrega');
        const venda = await lerVenda(pedido['saleId']);
        expect(venda).toBeDefined('Sale de pedido criada na entrega');
        expect(venda['status']).toBe('completed');
        expect(venda['sale_type']).toBe('order');
        expect(venda['total']).toBe(300, 'Sale com total cheio do pedido');
        expect(venda['paymentMethod']).toBeUndefined('Venda de pedido nasce sem forma de pagamento');
        expect(venda['customerId']).toBe(clienteId, 'Sale herda customerId do pedido');
        expect(venda['items'][0].priceAtSale).toBe(PRECO_VENDA, 'Snapshot priceAtSale');
        expect(venda['items'][0].priceAtCost).toBe(PRECO_CUSTO, 'Snapshot priceAtCost');
        expect(venda['date']).toBeDefined('Sale com data da entrega');
        expect((await lerVendas()).length).toBe(1, 'Exatamente uma Sale por entrega');
      });

      it('[RED] should reverter tudo e nao criar Sale quando estoque e insuficiente', async () => {
        const produtoSuficiente = await gravarProduto('entrega-ok', 10);
        const produtoInsuficiente = await gravarProduto('entrega-falta', 1);
        const orderId = await gravarPedido('entrega-falta', {
          status: 'pending',
          items: [itemDoProduto(produtoSuficiente, 2), itemDoProduto(produtoInsuficiente, 5)],
          itemsTotal: 700,
          total: 700
        });

        const erro = await capturarErro(() => service.markAsDelivered(orderId));

        expect(erro).toBeDefined('Estoque insuficiente deve lancar erro');
        expect((await lerProduto(produtoSuficiente))['stock']).toBe(10, 'Baixa do primeiro item revertida');
        expect((await lerProduto(produtoInsuficiente))['stock']).toBe(1);
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('pending', 'Pedido nao pode ser entregue');
        expect(pedido['saleId']).toBeUndefined();
        expect((await lerVendas()).length).toBe(0, 'Nenhuma Sale deve ser criada');
      });

      it('[RED] should rejeitar entrega dupla sem baixar estoque de novo e sem segunda Sale', async () => {
        const produtoId = await gravarProduto('entrega-dupla', 10);
        const orderId = await gravarPedido('entrega-dupla', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 2)],
          itemsTotal: 200,
          total: 200
        });
        await service.markAsDelivered(orderId);
        expect((await lerProduto(produtoId))['stock']).toBe(8);

        const erro = await capturarErro(() => service.markAsDelivered(orderId));

        expect(erro).toBeDefined('Segunda entrega deve ser rejeitada');
        expect((await lerProduto(produtoId))['stock']).toBe(8, 'Estoque nao pode ser baixado de novo');
        expect((await lerVendas()).length).toBe(1, 'Nenhuma segunda Sale');
      });

      it('[RED] should rejeitar entrega de pedido finished ou canceled sem baixar estoque', async () => {
        const produtoId = await gravarProduto('entrega-status', 10);
        const finalizadoId = await gravarPedido('entrega-finished', {
          status: 'finished',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100
        });
        const canceladoId = await gravarPedido('entrega-canceled', {
          status: 'canceled',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100
        });

        const erroFinalizado = await capturarErro(() => service.markAsDelivered(finalizadoId));
        const erroCancelado = await capturarErro(() => service.markAsDelivered(canceladoId));

        expect(erroFinalizado).toBeDefined('Pedido finished nao pode ser entregue');
        expect(erroCancelado).toBeDefined('Pedido canceled nao pode ser entregue');
        expect((await lerProduto(produtoId))['stock']).toBe(10, 'Nenhum estoque baixado');
        expect((await lerVendas()).length).toBe(0);
      });

      it('[RED] should concluir na entrega quando saldo ja esta zerado (pagamentos pending)', async () => {
        const produtoId = await gravarProduto('entrega-saldo-zero', 10);
        const orderId = await gravarPedido('entrega-saldo-zero', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100,
          payments: [
            { id: 'pag-antecipado', amount: 100, method: PaymentMethod.PIX, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
          ]
        });

        await service.markAsDelivered(orderId);

        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('finished', 'Saldo zerado antes da entrega conclui na entrega');
        expect(pedido['paymentDate']).toBeDefined();
        expect(pedido['closingDate']).toBeDefined();
        expect(pedido['paymentMethod']).toBe(PaymentMethod.PIX, 'Forma final vem do pago');
        expect(pedido['installments']).toBe(1);
        const venda = await lerVenda(pedido['saleId']);
        expect(venda['paymentMethod']).toBe(PaymentMethod.PIX, 'Sale recebe a forma final na conclusao');
        expect(venda['total']).toBe(100);
        expect((await lerVendas()).length).toBe(1);
      });

      it('[RED] should concluir na entrega pedido de total 0 (itens com preco 0, frete 0) sem pagamentos, com forma dinheiro e 1 parcela', async () => {
        const produtoId = await gravarProduto('entrega-total-zero', 10);
        const orderId = await gravarPedido('entrega-total-zero', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1, 0)],
          itemsTotal: 0,
          shippingCost: 0,
          total: 0
        });

        await service.markAsDelivered(orderId);

        expect((await lerProduto(produtoId))['stock']).toBe(9, 'Baixa de estoque mesmo com total 0');
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('finished', 'Saldo 0 (total 0) conclui na entrega, sem pagamento previo');
        expect(pedido['paymentMethod']).toBe(PaymentMethod.DINHEIRO, 'Sem pagamento de onde derivar a forma: dinheiro');
        expect(pedido['installments']).toBe(1, 'Pedido de total 0 concluido com 1 parcela');
        expect(pedido['paymentDate']).toBeDefined('paymentDate gravada na conclusao');
        expect(pedido['closingDate']).toBeDefined('closingDate gravada na conclusao');
        const venda = await lerVenda(pedido['saleId']);
        expect(venda['paymentMethod']).toBe(PaymentMethod.DINHEIRO, 'Sale recebe forma dinheiro na conclusao');
        expect(venda['total']).toBe(0, 'Sale com total 0');
        expect((await lerVendas()).length).toBe(1, 'Exatamente uma Sale');
      });
    });

    describe('[RED] registerPayment() - Pedido legado com customerId', () => {
      it('[RED] should gravar customerId na Sale criada na conclusao de pedido legado', async () => {
        const orderId = await gravarPedido('legado-cliente', { total: 80, itemsTotal: 80, customerId: 'cliente-legado' });

        await service.registerPayment(orderId, { amount: 80, method: PaymentMethod.DINHEIRO, paidDate: DATA_D1 });

        const pedido = await lerPedido(orderId);
        const venda = await lerVenda(pedido['saleId']);
        expect(venda['customerId']).toBe('cliente-legado', 'Sale de pedido legado deve herdar customerId (bug conhecido: addSaleInTransaction descarta)');
      });
    });

    describe('[RED] cancelOrder() - Cancelamento e efeitos', () => {
      it('[RED] should devolver estoque uma vez e cancelar a Sale de pedido delivered', async () => {
        const produtoId = await gravarProduto('cancela-entregue', 10);
        const orderId = await gravarPedido('cancela-entregue', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 4)],
          itemsTotal: 400,
          total: 400
        });
        await service.markAsDelivered(orderId);
        expect((await lerProduto(produtoId))['stock']).toBe(6);
        const saleId = (await lerPedido(orderId))['saleId'];

        await service.cancelOrder(orderId, { estornar: false });

        expect((await lerProduto(produtoId))['stock']).toBe(10, 'Estoque devolvido exatamente uma vez');
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('canceled');
        const venda = await lerVenda(saleId);
        expect(venda['status']).toBe('canceled', 'Sale do pedido cancelada junto');
      });

      it('[RED] should marcar pagos como estornado quando estornar=true', async () => {
        const orderId = await gravarPedido('estorno-true', {
          status: 'delivered',
          items: [],
          payments: [
            { id: 'pago-e1', amount: 40, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' },
            parcelaPrevista('prev-e1', 60, VENCIMENTO_1)
          ]
        });

        await service.cancelOrder(orderId, { estornar: true });

        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('canceled');
        const pago = pedido['payments'].find((p: OrderPayment) => p.id === 'pago-e1');
        expect(pago.status).toBe('estornado', 'Pago vira estornado quando estornar=true');
        const prevista = pedido['payments'].find((p: OrderPayment) => p.id === 'prev-e1');
        expect(prevista.status).toBe('cancelado', 'Prevista vira cancelado');
      });

      it('[RED] should manter pagos como pago (sinal retido) e nao criar Sale nova quando estornar=false', async () => {
        const orderId = await gravarPedido('estorno-false', {
          status: 'delivered',
          items: [],
          payments: [
            { id: 'pago-f1', amount: 40, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' },
            parcelaPrevista('prev-f1', 60, VENCIMENTO_1)
          ]
        });

        await service.cancelOrder(orderId, { estornar: false });

        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('canceled');
        const pago = pedido['payments'].find((p: OrderPayment) => p.id === 'pago-f1');
        expect(pago.status).toBe('pago', 'Sinal retido permanece pago');
        const prevista = pedido['payments'].find((p: OrderPayment) => p.id === 'prev-f1');
        expect(prevista.status).toBe('cancelado', 'Prevista vira cancelado');
        expect((await lerVendas()).length).toBe(0, 'Cancelamento nao cria Sale');
      });

      it('[RED] should tratar cancelOrder sem opts como estornar=false', async () => {
        const orderId = await gravarPedido('sem-opts', {
          status: 'delivered',
          items: [],
          payments: [
            { id: 'pago-s1', amount: 40, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
          ]
        });

        await service.cancelOrder(orderId);

        const pedido = await lerPedido(orderId);
        expect(pedido['payments'][0].status).toBe('pago', 'Sem opts equivale a estornar=false');
      });

      it('[RED] should cancelar pedido pending com pagamentos sem mexer em estoque', async () => {
        const produtoId = await gravarProduto('cancela-pending', 10);
        const orderId = await gravarPedido('cancela-pending', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 3)],
          itemsTotal: 300,
          total: 300,
          payments: [
            { id: 'pago-p1', amount: 50, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' },
            parcelaPrevista('prev-p1', 250, VENCIMENTO_1)
          ]
        });

        await service.cancelOrder(orderId, { estornar: false });

        expect((await lerProduto(produtoId))['stock']).toBe(10, 'Pedido nao entregue nao devolve estoque');
        const pedido = await lerPedido(orderId);
        expect(pedido['status']).toBe('canceled');
        const prevista = pedido['payments'].find((p: OrderPayment) => p.id === 'prev-p1');
        expect(prevista.status).toBe('cancelado');
      });

      it('[RED] should rejeitar cancelamento de pedido finished ou canceled', async () => {
        const finalizadoId = await gravarPedido('cancela-finished', { status: 'finished', payments: [
          { id: 'pago-fc', amount: 100, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
        ] });
        const canceladoId = await gravarPedido('cancela-canceled', { status: 'canceled' });

        const erroFinalizado = await capturarErro(() => service.cancelOrder(finalizadoId, { estornar: true }));
        const erroCancelado = await capturarErro(() => service.cancelOrder(canceladoId, { estornar: false }));

        expect(erroFinalizado).toBeDefined('Pedido finished nao pode ser cancelado');
        expect(erroCancelado).toBeDefined('Pedido canceled nao pode ser cancelado de novo');
        expect((await lerPedido(finalizadoId))['status']).toBe('finished');
        expect((await lerPedido(finalizadoId))['payments'][0].status).toBe('pago', 'Pagamento nao estornado');
      });

      it('[RED] should cancelar pedido legado delivered devolvendo estoque sem tocar em Sale', async () => {
        const produtoId = await gravarProduto('cancela-legado', 5);
        const orderId = await gravarPedido('cancela-legado', {
          status: 'delivered',
          items: [itemDoProduto(produtoId, 2)],
          itemsTotal: 200,
          total: 200
        });
        const vendaAntes = await lerVendas();

        await service.cancelOrder(orderId, { estornar: false });

        expect((await lerProduto(produtoId))['stock']).toBe(7, 'Estoque devolvido no legado');
        expect((await lerPedido(orderId))['status']).toBe('canceled');
        expect((await lerVendas()).length).toBe(vendaAntes.length, 'Pedido legado sem saleId nao toca em Sale');
      });
    });

    describe('[RED] updateOrder() - Edicao com pagamentos', () => {
      it('[RED] should rejeitar reduzir itens para total abaixo do pago com TOTAL_ABAIXO_DO_PAGO sem gravar', async () => {
        const produtoId = await gravarProduto('edita-abaixo', 10);
        const orderId = await gravarPedido('edita-abaixo', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100,
          payments: [
            { id: 'pago-ed1', amount: 60, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
          ]
        });

        const erro = await capturarErro(() => service.updateOrder(orderId, {
          items: [itemDoProduto(produtoId, 1, 50)],
          shippingCost: 0
        }));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('TOTAL_ABAIXO_DO_PAGO');
        const pedido = await lerPedido(orderId);
        expect(pedido['total']).toBe(100, 'Total nao pode ser gravado');
        expect(pedido['items'][0].priceAtSale).toBe(PRECO_VENDA, 'Itens nao podem ser gravados');
      });

      it('[RED] should rejeitar edicao com previstas quando parcelas nao reajustadas fecham o novo saldo (PARCELAS_NAO_REAJUSTADAS)', async () => {
        const produtoId = await gravarProduto('edita-nao-reajusta', 10);
        const orderId = await gravarPedido('edita-nao-reajusta', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100,
          payments: [parcelaPrevista('prev-ed', 100, VENCIMENTO_1)]
        });

        const erro = await capturarErro(() => service.updateOrder(orderId, {
          items: [itemDoProduto(produtoId, 1, 150)],
          shippingCost: 0
        }));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PARCELAS_NAO_REAJUSTADAS');
        const pedido = await lerPedido(orderId);
        expect(pedido['total']).toBe(100, 'Nada gravado');
        expect(pedido['payments'][0].amount).toBe(100, 'Prevista intacta');
      });

      it('[RED] should gravar itens, total e payments numa unica escrita quando parcelas reajustadas fecham o novo saldo', async () => {
        const produtoId = await gravarProduto('edita-reajusta', 10);
        const orderId = await gravarPedido('edita-reajusta', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100,
          payments: [parcelaPrevista('prev-antiga', 100, VENCIMENTO_1)]
        });

        await service.updateOrder(orderId, {
          items: [itemDoProduto(produtoId, 1, 150)],
          shippingCost: 0
        }, {
          parcelas: [
            { amount: 75, dueDate: VENCIMENTO_1, method: PaymentMethod.BOLETO },
            { amount: 75, dueDate: VENCIMENTO_2, method: PaymentMethod.BOLETO }
          ]
        });

        const pedido = await lerPedido(orderId);
        expect(pedido['itemsTotal']).toBe(150);
        expect(pedido['total']).toBe(150);
        expect(pedido['items'][0].priceAtSale).toBe(150);
        const previstas = pedido['payments'].filter((p: OrderPayment) => p.status === 'previsto');
        expect(previstas.length).toBe(2, 'Parcelas reajustadas gravadas');
        expect(previstas.reduce((acc: number, p: OrderPayment) => acc + p.amount, 0)).toBe(150, 'Soma das previstas fecha o novo saldo');
        expect(pedido['payments'].some((p: OrderPayment) => p.id === 'prev-antiga')).toBeFalsy('Prevista antiga substituida');
      });

      it('[RED] should recalcular total com soldByWeight e frete quando nao ha pagamentos', async () => {
        const produtoId = await gravarProduto('edita-sem-pag', 10);
        const orderId = await gravarPedido('edita-sem-pag', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          total: 100
        });

        await service.updateOrder(orderId, {
          items: [
            itemDoProduto(produtoId, 2, 10),
            { idProduct: produtoId, productName: 'Peso', quantity: 1.5, priceAtSale: 19.99, priceAtCost: PRECO_CUSTO, soldByWeight: true }
          ],
          shippingCost: 5
        });

        const pedido = await lerPedido(orderId);
        expect(pedido['itemsTotal']).toBeCloseTo(49.99, 2, 'Itens: 10*2 + 19.99*1.5 por peso');
        expect(pedido['total']).toBeCloseTo(54.99, 2, 'Total = itens + frete');
      });

      it('[RED] should recalcular total so com o frete (itens gravados + novo frete) quando nao ha pagamentos', async () => {
        const produtoId = await gravarProduto('edita-so-frete', 10);
        const orderId = await gravarPedido('edita-so-frete', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100
        });

        await service.updateOrder(orderId, { shippingCost: 15 });

        const pedido = await lerPedido(orderId);
        expect(pedido['shippingCost']).toBe(15, 'Frete gravado');
        expect(pedido['itemsTotal']).toBe(100, 'Itens gravados usados no recalculo (edicao sem items)');
        expect(pedido['total']).toBe(115, 'Total = itens gravados + novo frete');
      });

      it('[RED] should rejeitar so frete que leva o total abaixo do pago com TOTAL_ABAIXO_DO_PAGO sem gravar', async () => {
        const produtoId = await gravarProduto('edita-frete-abaixo', 10);
        const orderId = await gravarPedido('edita-frete-abaixo', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          shippingCost: 20,
          total: 120,
          payments: [
            { id: 'pago-frete', amount: 110, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
          ]
        });

        const erro = await capturarErro(() => service.updateOrder(orderId, { shippingCost: 5 }));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('TOTAL_ABAIXO_DO_PAGO');
        const pedido = await lerPedido(orderId);
        expect(pedido['shippingCost']).toBe(20, 'Frete nao pode ser gravado');
        expect(pedido['total']).toBe(120, 'Total nao pode ser gravado');
        expect(pedido['payments'][0].amount).toBe(110, 'Pagamento intacto');
      });

      it('[RED] should aceitar so frete que mantem total >= pago e gravar total recalculado', async () => {
        const produtoId = await gravarProduto('edita-frete-ok', 10);
        const orderId = await gravarPedido('edita-frete-ok', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100,
          payments: [
            { id: 'pago-frete-ok', amount: 60, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D1), status: 'pago' }
          ]
        });

        await service.updateOrder(orderId, { shippingCost: 10 });

        const pedido = await lerPedido(orderId);
        expect(pedido['total']).toBe(110, 'Total recalculado com o frete');
        expect(pedido['payments'][0].amount).toBe(60, 'Pagamento preservado');
      });

      it('[RED] should exigir reajuste de parcelas quando so o frete muda o saldo com previstas (PARCELAS_NAO_REAJUSTADAS)', async () => {
        const produtoId = await gravarProduto('edita-frete-reajusta', 10);
        const orderId = await gravarPedido('edita-frete-reajusta', {
          status: 'pending',
          items: [itemDoProduto(produtoId, 1)],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100,
          payments: [parcelaPrevista('prev-frete', 100, VENCIMENTO_1)]
        });

        const erro = await capturarErro(() => service.updateOrder(orderId, { shippingCost: 20 }));

        expect(erro instanceof PagamentoInvalidoError).toBeTruthy('Deve lancar PagamentoInvalidoError');
        expect(erro?.codigo).toBe('PARCELAS_NAO_REAJUSTADAS');
        const pedido = await lerPedido(orderId);
        expect(pedido['total']).toBe(100, 'Nada gravado');
        expect(pedido['payments'][0].amount).toBe(100, 'Prevista intacta');
      });

      describe('[RED] updateOrder() - Bloqueio por status (edicao so antes da entrega)', () => {
        async function tentarEditarFrete(label: string, status: Order['status']): Promise<{ erro: any; pedido: any }> {
          const orderId = await gravarPedido(`edita-status-${label}`, {
            status,
            items: [itemDoProduto('prod-status', 1)],
            itemsTotal: 100,
            shippingCost: 0,
            total: 100
          });
          const erro = await capturarErro(() => service.updateOrder(orderId, { shippingCost: 50 }));
          return { erro, pedido: await lerPedido(orderId) };
        }

        it('[RED] should rejeitar edicao de pedido delivered sem gravar nada', async () => {
          const { erro, pedido } = await tentarEditarFrete('delivered', 'delivered');
          expect(erro).toBeDefined('Pedido delivered nao pode ser editado');
          expect(pedido['shippingCost']).toBe(0, 'Frete nao gravado');
          expect(pedido['total']).toBe(100, 'Total nao gravado');
        });

        it('[RED] should rejeitar edicao de pedido finished sem gravar nada', async () => {
          const { erro, pedido } = await tentarEditarFrete('finished', 'finished');
          expect(erro).toBeDefined('Pedido finished nao pode ser editado');
          expect(pedido['shippingCost']).toBe(0, 'Frete nao gravado');
          expect(pedido['total']).toBe(100, 'Total nao gravado');
        });

        it('[RED] should rejeitar edicao de pedido canceled sem gravar nada', async () => {
          const { erro, pedido } = await tentarEditarFrete('canceled', 'canceled');
          expect(erro).toBeDefined('Pedido canceled nao pode ser editado');
          expect(pedido['shippingCost']).toBe(0, 'Frete nao gravado');
          expect(pedido['total']).toBe(100, 'Total nao gravado');
        });

        it('[RED] should aceitar edicao de pedido pending e recalcular o total com o novo frete', async () => {
          const { erro, pedido } = await tentarEditarFrete('pending', 'pending');
          expect(erro).toBeUndefined('Pedido pending aceita edicao');
          expect(pedido['shippingCost']).toBe(50);
          expect(pedido['total']).toBe(150, 'Total = itens gravados + frete');
        });

        it('[RED] should aceitar edicao nos status antes da entrega (open, preparing, ready, delivering)', async () => {
          for (const status of ['open', 'preparing', 'ready', 'delivering'] as const) {
            const { erro, pedido } = await tentarEditarFrete(status, status);
            expect(erro).toBeUndefined(`Pedido ${status} aceita edicao`);
            expect(pedido['total']).toBe(150, `Total recalculado em ${status}`);
          }
        });
      });

      it('[RED] should ignorar campos protegidos vindos de fora e gravar so o editavel', async () => {
        const orderId = await gravarPedido('campos-protegidos', {
          status: 'pending',
          items: [itemDoProduto('prod-protegido', 1)],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100,
          actualDeliveryDate: Timestamp.fromDate(DATA_D1)
        });

        await service.updateOrder(orderId, {
          observations: 'Obs editada',
          status: 'delivered',
          saleId: 'sale-injetada',
          payments: [
            { id: 'pago-injetado', amount: 100, method: PaymentMethod.DINHEIRO, installments: 1, paidDate: Timestamp.fromDate(DATA_D2), status: 'pago' }
          ],
          total: 999,
          itemsTotal: 999,
          paymentDate: Timestamp.fromDate(DATA_D2),
          closingDate: Timestamp.fromDate(DATA_D2),
          actualDeliveryDate: Timestamp.fromDate(DATA_D2)
        });

        const pedido = await lerPedido(orderId);
        expect(pedido['observations']).toBe('Obs editada', 'Campo editavel e gravado');
        expect(pedido['status']).toBe('pending', 'status so muda pelos metodos com regra');
        expect(pedido['saleId']).toBeUndefined('saleId so e gravado pela entrega');
        expect(pedido['payments']).toBeUndefined('payments so mudam pelos metodos de pagamento');
        expect(pedido['total']).toBe(100, 'total nao vem de fora');
        expect(pedido['itemsTotal']).toBe(100, 'itemsTotal nao vem de fora');
        expect(pedido['paymentDate']).toBeUndefined('paymentDate so na conclusao');
        expect(pedido['closingDate']).toBeUndefined('closingDate so na conclusao');
        expect(pedido['actualDeliveryDate'].toMillis()).toBe(DATA_D1.getTime(), 'actualDeliveryDate so na entrega');
      });
    });

    describe('[RED] API publica do OrderService', () => {
      it('[RED] should nao expor updateStatus (status so muda pelos metodos com regra)', () => {
        expect((service as any).updateStatus).toBeUndefined('updateStatus removido: sem validacao, sem uso');
      });
    });
  });
});
