import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ProductInventoryComponent,
  HistoricoItem,
  HistoricoItemProduto,
} from './product-inventory';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { ExpenseService } from '../../services/expense-service/expense-service';
import { ExpenseCategoryService } from '../../services/expense-category-service/expense-category-service';
import { ExpenseRecurrenceService } from '../../services/expense-recurrence-service/expense-recurrence-service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import { Expense, ExpenseCategory } from '../../models/expense-model';
import { OrderService } from '../../services/order-service/order-service';
import { ComandaService } from '../../services/comanda-service/comanda-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { ConfigService } from '../../services/config/config.service';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';
import { VendedorService } from '../../services/vendedor-service/vendedor-service';
import { ActivatedRoute } from '@angular/router';
import { PaymentMethod, PAYMENT_METHOD_LABELS } from '../../models/sell-model';
import { of } from 'rxjs';

describe('ProductInventoryComponent', () => {
  let component: ProductInventoryComponent;
  let fixture: ComponentFixture<ProductInventoryComponent>;

  // Mock services
  const mockServices = {
    productService: { getProducts: () => of([]) },
    purchaseService: { getPurchases: () => of([]) },
    saleService: { getSales: () => of([]), getSalesByDate: () => of([]) },
    customerService: { getCustomers: () => of([]) },
    expenseService: { getExpenses: () => of([]) },
    expenseCategoryService: { getCategories: () => of([]) },
    expenseRecurrenceService: {
      generateDueOccurrences: jasmine
        .createSpy('generateDueOccurrences')
        .and.callFake(() => Promise.resolve({ generated: 0, seriesProcessed: 0 })),
    },
    // TenantService.companyId e um computed (signal): mock como funcao que devolve o valor.
    tenant: { companyId: () => 'emp-1' },
    orderService: { getOrders: () => of([]) },
    comandaService: { getAllComandas: () => of([]) },
    notif: {
      error: jasmine.createSpy('error'),
      success: jasmine.createSpy('success'),
      warning: jasmine.createSpy('warning'),
    },
    config: {
      modules$: of({ gestao: true, clientes: true }),
      // O template chama config.modules()/companyName() (signals) diretamente —
      // necessário só pra suites que disparam fixture.detectChanges() (ex.: modal de detalhe).
      modules: () => ({ gestao: true, clientes: true, vendedores: true }),
      companyName: () => '',
    },
    geocodingService: { reverseGeocode: () => of(null) },
    vendedorService: {
      getVendedores: () => of([]),
      addVendedor: () => Promise.resolve(),
      updateVendedor: () => Promise.resolve(),
      deleteVendedor: () => Promise.resolve(),
    },
  };

  beforeEach(async () => {
    const mockActivatedRoute = {
      snapshot: {},
      params: of({}),
      queryParams: of({}),
    };

    await TestBed.configureTestingModule({
      imports: [ProductInventoryComponent],
      providers: [
        { provide: ProductService, useValue: mockServices.productService },
        { provide: SaleService, useValue: mockServices.saleService },
        { provide: PurchaseService, useValue: mockServices.purchaseService },
        { provide: CustomerService, useValue: mockServices.customerService },
        { provide: ExpenseService, useValue: mockServices.expenseService },
        { provide: ExpenseCategoryService, useValue: mockServices.expenseCategoryService },
        { provide: ExpenseRecurrenceService, useValue: mockServices.expenseRecurrenceService },
        { provide: TenantService, useValue: mockServices.tenant },
        { provide: NotificationService, useValue: mockServices.notif },
        { provide: ConfigService, useValue: mockServices.config },
        { provide: OrderService, useValue: mockServices.orderService },
        { provide: ComandaService, useValue: mockServices.comandaService },
        { provide: GeocodingService, useValue: mockServices.geocodingService },
        { provide: VendedorService, useValue: mockServices.vendedorService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductInventoryComponent);
    component = fixture.componentInstance;
  });

  describe('[RED] paymentMethodLabel()', () => {
    it('[RED] should return label for DINHEIRO', () => {
      const label = component.paymentMethodLabel(PaymentMethod.DINHEIRO);
      expect(label).toBe(PAYMENT_METHOD_LABELS[PaymentMethod.DINHEIRO], 'Should return "Dinheiro"');
    });

    it('[RED] should return label for PIX', () => {
      const label = component.paymentMethodLabel(PaymentMethod.PIX);
      expect(label).toBe(PAYMENT_METHOD_LABELS[PaymentMethod.PIX], 'Should return "Pix"');
    });

    it('[RED] should return label for CARTAO', () => {
      const label = component.paymentMethodLabel(PaymentMethod.CARTAO);
      expect(label).toBe(PAYMENT_METHOD_LABELS[PaymentMethod.CARTAO], 'Should return "Cartão"');
    });

    it('[RED] should return label for CHEQUE', () => {
      const label = component.paymentMethodLabel(PaymentMethod.CHEQUE);
      expect(label).toBe(PAYMENT_METHOD_LABELS[PaymentMethod.CHEQUE], 'Should return "Cheque"');
    });

    it('[RED] should return empty string when method is undefined', () => {
      const label = component.paymentMethodLabel(undefined);
      expect(label).toBe('', 'Should return empty string for undefined payment method');
    });
  });

  describe('[RED] historicoFiltrado with paymentMethod filter', () => {
    beforeEach(() => {
      // Initialize historicoItems with mixed payment methods
      component.historicoItems = [
        {
          id: '1',
          numero: 101,
          origem: 'pedido' as const,
          data: new Date('2026-01-01'),
          clienteNome: 'Client A',
          clienteId: 'cust-a',
          status: 'finished',
          total: 100,
          paymentMethod: PaymentMethod.DINHEIRO,
          itens: [],
          itemsTotal: 100,
          shippingCost: 0,
        },
        {
          id: '2',
          numero: 102,
          origem: 'pedido' as const,
          data: new Date('2026-01-02'),
          clienteNome: 'Client B',
          clienteId: 'cust-b',
          status: 'finished',
          total: 200,
          paymentMethod: PaymentMethod.PIX,
          itens: [],
          itemsTotal: 200,
          shippingCost: 0,
        },
        {
          id: '3',
          numero: 103,
          origem: 'pedido' as const,
          data: new Date('2026-01-03'),
          clienteNome: 'Client C',
          clienteId: 'cust-c',
          status: 'finished',
          total: 150,
          paymentMethod: PaymentMethod.CARTAO,
          itens: [],
          itemsTotal: 150,
          shippingCost: 0,
        },
        {
          id: '4',
          origem: 'pdv' as const,
          data: new Date('2026-01-04'),
          clienteNome: 'Balcão',
          status: 'completed',
          total: 50,
          paymentMethod: PaymentMethod.CHEQUE,
          itens: [],
          itemsTotal: 50,
          shippingCost: 0,
        },
      ];
    });

    it('[RED] should return all items when filter is "todos"', () => {
      component.filtroHistoricoFormaPagamento = 'todos';
      const result = component.historicoFiltrado;
      expect(result.length).toBe(4, 'Should return all 4 items when filter is "todos"');
    });

    it('[RED] should filter by DINHEIRO payment method', () => {
      component.filtroHistoricoFormaPagamento = PaymentMethod.DINHEIRO;
      const result = component.historicoFiltrado;
      expect(result.length).toBe(1, 'Should return 1 item with DINHEIRO');
      expect(result[0].id).toBe('1', 'Should return item with DINHEIRO');
    });

    it('[RED] should filter by PIX payment method', () => {
      component.filtroHistoricoFormaPagamento = PaymentMethod.PIX;
      const result = component.historicoFiltrado;
      expect(result.length).toBe(1, 'Should return 1 item with PIX');
      expect(result[0].id).toBe('2', 'Should return item with PIX');
    });

    it('[RED] should filter by CARTAO payment method', () => {
      component.filtroHistoricoFormaPagamento = PaymentMethod.CARTAO;
      const result = component.historicoFiltrado;
      expect(result.length).toBe(1, 'Should return 1 item with CARTAO');
      expect(result[0].id).toBe('3', 'Should return item with CARTAO');
    });

    it('[RED] should filter by CHEQUE payment method', () => {
      component.filtroHistoricoFormaPagamento = PaymentMethod.CHEQUE;
      const result = component.historicoFiltrado;
      expect(result.length).toBe(1, 'Should return 1 item with CHEQUE');
      expect(result[0].id).toBe('4', 'Should return item with CHEQUE');
    });

    it('[RED] should return empty when filter matches no items', () => {
      // Items without paymentMethod should not match when filter is set
      component.historicoItems[0].paymentMethod = undefined;
      component.filtroHistoricoFormaPagamento = PaymentMethod.DINHEIRO;
      const result = component.historicoFiltrado;
      expect(result.some((i) => i.id === '1')).toBe(
        false,
        'Item without paymentMethod should not match DINHEIRO filter',
      );
    });

    it('[RED] should combine payment method filter with other filters', () => {
      component.filtroHistoricoOrigem = 'pedido';
      component.filtroHistoricoFormaPagamento = PaymentMethod.CARTAO;
      const result = component.historicoFiltrado;
      expect(result.length).toBe(1, 'Should return 1 item (origin pedido + CARTAO)');
      expect(result[0].id).toBe('3', 'Should return the CARTAO pedido item');
    });
  });

  describe('custoHistoricoItem() / lucroHistoricoItem()', () => {
    it('should sum priceAtCost * quantity across items for custoHistoricoItem', () => {
      const item: HistoricoItem = {
        id: '10',
        origem: 'pedido',
        data: new Date('2026-01-01'),
        clienteNome: 'Cliente X',
        status: 'finished',
        total: 130,
        itens: [
          {
            idProduct: 'p1',
            productName: 'Produto 1',
            quantity: 2,
            priceAtSale: 20,
            priceAtCost: 10,
          },
          {
            idProduct: 'p2',
            productName: 'Produto 2',
            quantity: 3,
            priceAtSale: 30,
            priceAtCost: 15,
          },
        ],
        itemsTotal: 130, // (2*20) + (3*30)
        shippingCost: 10,
      };

      expect(component.custoHistoricoItem(item)).toBe(65, '(2*10) + (3*15) = 65');
    });

    it('should compute lucro as itemsTotal - custo, excluding shippingCost', () => {
      const item: HistoricoItem = {
        id: '11',
        origem: 'pedido',
        data: new Date('2026-01-01'),
        clienteNome: 'Cliente Y',
        status: 'finished',
        total: 140, // itemsTotal (130) + shippingCost (10)
        itens: [
          {
            idProduct: 'p1',
            productName: 'Produto 1',
            quantity: 2,
            priceAtSale: 20,
            priceAtCost: 10,
          },
          {
            idProduct: 'p2',
            productName: 'Produto 2',
            quantity: 3,
            priceAtSale: 30,
            priceAtCost: 15,
          },
        ],
        itemsTotal: 130,
        shippingCost: 10,
      };

      // Lucro = itemsTotal (130) - custo (65) = 65 — frete (10) não entra na conta.
      expect(component.lucroHistoricoItem(item)).toBe(
        65,
        'Frete não deve entrar no lucro nem no custo',
      );
    });

    it('should return a negative lucro when custo exceeds itemsTotal', () => {
      const item: HistoricoItem = {
        id: '12',
        origem: 'pdv',
        data: new Date('2026-01-01'),
        clienteNome: 'Balcão',
        status: 'completed',
        total: 10,
        itens: [
          {
            idProduct: 'p1',
            productName: 'Produto Prejuízo',
            quantity: 1,
            priceAtSale: 10,
            priceAtCost: 15,
          },
        ],
        itemsTotal: 10,
        shippingCost: 0,
      };

      expect(component.lucroHistoricoItem(item)).toBe(-5, '10 - 15 = -5');
    });
  });

  describe('subtotalItemHistorico() / itemsTotal / lucro — item vendido por peso (soldByWeight)', () => {
    // 19.99 * 2.5 = 49.975 (halfway exato) — calcularTotalItemPorPeso arredonda
    // "tie goes up" pra 49.98. Multiplicação crua (priceAtSale * quantity) não
    // garante esse arredondamento, então o teste prova que a função certa foi usada.
    it('subtotalItemHistorico usa calcularTotalItemPorPeso pra item soldByWeight (tie-break arredonda pra cima)', () => {
      const item: HistoricoItemProduto = {
        idProduct: 'p1',
        productName: 'Queijo',
        quantity: 2.5,
        priceAtSale: 19.99,
        priceAtCost: 10,
        soldByWeight: true,
      };

      expect(component.subtotalItemHistorico(item)).toBe(
        49.98,
        '19.99 * 2.5 deve arredondar (tie-break) pra 49.98',
      );
    });

    it('subtotalItemHistorico usa priceAtSale * quantity direto quando soldByWeight é falsy', () => {
      const item: HistoricoItemProduto = {
        idProduct: 'p2',
        productName: 'Refrigerante',
        quantity: 3,
        priceAtSale: 5,
        priceAtCost: 2,
      };

      expect(component.subtotalItemHistorico(item)).toBe(15, '5 * 3 = 15, sem soldByWeight');
    });

    it('montarHistorico usa a mesma regra de peso pra compor itemsTotal (pdv)', () => {
      const vendas = [
        {
          id: 'v1',
          sale_type: 'pdv',
          date: new Date('2026-02-01'),
          total: 49.98,
          items: [
            {
              idProduct: 'p1',
              productName: 'Queijo',
              quantity: 2.5,
              priceAtSale: 19.99,
              priceAtCost: 10,
              soldByWeight: true,
            },
          ],
        },
      ];

      const historico = (component as any).montarHistorico(vendas, [], []) as HistoricoItem[];

      expect(historico[0].itemsTotal).toBe(
        49.98,
        'itemsTotal deve vir de calcularTotalItemPorPeso, não de priceAtSale*quantity cru (49.975)',
      );
    });

    it('lucroHistoricoItem usa o itemsTotal com peso (não a soma crua) menos o custo', () => {
      const item: HistoricoItem = {
        id: '30',
        origem: 'pdv',
        data: new Date('2026-02-01'),
        clienteNome: 'Balcão',
        status: 'completed',
        total: 49.98,
        itens: [
          {
            idProduct: 'p1',
            productName: 'Queijo',
            quantity: 2.5,
            priceAtSale: 19.99,
            priceAtCost: 10,
            soldByWeight: true,
          },
        ],
        itemsTotal: 49.98,
        shippingCost: 0,
      };

      // custo = 10 * 2.5 = 25; lucro = 49.98 - 25 = 24.98 (toBeCloseTo por causa
      // do ruído de ponto flutuante: 49.98 - 25 === 24.979999999999997 em JS).
      expect(component.lucroHistoricoItem(item)).toBeCloseTo(24.98, 2);
    });
  });

  describe('Modal de detalhe do lançamento — linha de Frete', () => {
    function abrirModalCom(item: HistoricoItem): HTMLElement {
      component.detalheLancamentoAberto = item;
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    function linhaFrete(el: HTMLElement): Element | undefined {
      const linhas = Array.from(el.querySelectorAll('.detalhe-lancamento-valores .formula-linha'));
      return linhas.find((l) => (l.textContent || '').includes('Frete'));
    }

    const baseItem = (overrides: Partial<HistoricoItem>): HistoricoItem => ({
      id: 'x',
      origem: 'pedido',
      data: new Date('2026-02-01'),
      clienteNome: 'Cliente Teste',
      status: 'finished',
      total: 0,
      itens: [],
      itemsTotal: 0,
      shippingCost: 0,
      ...overrides,
    });

    it('pedido com deliveryType delivery mostra o valor do frete', () => {
      const el = abrirModalCom(
        baseItem({
          total: 60,
          itemsTotal: 50,
          shippingCost: 10,
          deliveryType: 'delivery',
          address: 'Rua X, 123',
        }),
      );

      const linha = linhaFrete(el);
      expect(linha).toBeTruthy('Deve existir uma linha de Frete pra pedido delivery');
      // Separador decimal depende do LOCALE_ID registrado no TestBed (não é
      // o mesmo do app real, que usa pt-BR) — casa "10.00" ou "10,00".
      expect(linha!.textContent).toMatch(/R\$\s*10[.,]00/);
    });

    it('pedido com deliveryType pickup mostra "Retirada — sem frete" em vez do valor', () => {
      const el = abrirModalCom(
        baseItem({
          total: 50,
          itemsTotal: 50,
          shippingCost: 0,
          deliveryType: 'pickup',
        }),
      );

      const linha = linhaFrete(el);
      expect(linha).toBeTruthy('Deve existir uma linha de Frete pra pedido pickup');
      expect(linha!.textContent).toContain('Retirada — sem frete');
      expect(linha!.textContent).not.toContain('R$ 0,00');
    });

    it('pdv não mostra a linha de Frete', () => {
      const el = abrirModalCom(
        baseItem({ origem: 'pdv', clienteNome: 'Balcão', total: 50, itemsTotal: 50 }),
      );

      expect(linhaFrete(el)).toBeFalsy('PDV não tem frete — linha não deve ser renderizada');
    });

    it('comanda não mostra a linha de Frete', () => {
      const el = abrirModalCom(baseItem({ origem: 'comanda', total: 50, itemsTotal: 50 }));

      expect(linhaFrete(el)).toBeFalsy('Comanda não tem frete — linha não deve ser renderizada');
    });
  });

  describe('[RED] Inicializacao — geracao de recorrencias de despesa (TASK-056)', () => {
    const recurrenceSpy = () => mockServices.expenseRecurrenceService.generateDueOccurrences;

    beforeEach(() => {
      recurrenceSpy().calls.reset();
      recurrenceSpy().and.callFake(() => Promise.resolve({ generated: 0, seriesProcessed: 0 }));
      mockServices.notif.warning.calls.reset();
    });

    it('[RED] ngOnInit chama generateDueOccurrences UMA vez com companyId do tenant e data de hoje (YYYY-MM-DD)', () => {
      fixture.detectChanges();

      expect(recurrenceSpy().calls.count()).toBe(
        1,
        'generateDueOccurrences deve ser chamado uma unica vez na inicializacao',
      );
      const [companyId, today] = recurrenceSpy().calls.mostRecent().args as [string, string];
      expect(companyId).toBe('emp-1', 'Deve usar o companyId do TenantService');
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/, 'today deve ser date-only YYYY-MM-DD');
    });

    it('[RED] se generateDueOccurrences rejeitar, o componente nao quebra e avisa via notif.warning', async () => {
      recurrenceSpy().and.callFake(() => Promise.reject(new Error('falha de rede')));

      expect(() => fixture.detectChanges()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockServices.notif.warning).toHaveBeenCalled();
    });
  });

  describe('[RED] Balanço — Despesas por competência (TASK-055)', () => {
    // Periodo de teste: 2026-03-01..2026-03-31 (filtroDataInicio/filtroDataFim, YYYY-MM-DD).
    // Membros novos (despesas, categoriasDespesa, custoProducaoPeriodo, gastosPorCategoria)
    // ainda nao existem no componente: acesso via (component as any) pra o RED compilar.
    // Resultados ausentes viram undefined e falham por assercao (optional chaining), nao por excecao.
    const CAT_ALUGUEL = 'cat-aluguel';
    const CAT_ENERGIA = 'cat-energia';
    const CAT_COMPRA = 'cat-compra';

    const categorias = (): ExpenseCategory[] => [
      {
        id: CAT_ALUGUEL,
        companyId: 'emp-1',
        name: 'Aluguel',
        type: 'despesa_operacional',
        archived: false,
        createdAt: null as any,
      },
      {
        id: CAT_ENERGIA,
        companyId: 'emp-1',
        name: 'Energia',
        type: 'despesa_operacional',
        archived: false,
        createdAt: null as any,
      },
      {
        id: CAT_COMPRA,
        companyId: 'emp-1',
        name: 'Compra de mercadoria',
        type: 'custo_producao',
        archived: false,
        createdAt: null as any,
      },
    ];

    // Datas date-only em string (YYYY-MM-DD), nunca Timestamp.
    const despesa = (overrides: Partial<Expense>): Expense => ({
      companyId: 'emp-1',
      description: 'Despesa teste',
      value: 0,
      categoryId: CAT_ALUGUEL,
      dueDate: '2026-03-10',
      status: 'a_pagar',
      origin: 'manual',
      createdAt: null as any,
      ...overrides,
    });

    const preparar = (despesas: Expense[]) => {
      (component as any).despesas = despesas;
    };

    beforeEach(() => {
      component.filtroDataInicio = '2026-03-01';
      component.filtroDataFim = '2026-03-31';
      component.relatorioBalanco = {
        ...component.relatorioBalanco,
        faturamento: 1000,
        custoTotal: 400,
      };
      (component as any).categoriasDespesa = categorias();
    });

    it('[RED] gastosPeriodo soma despesa operacional a_pagar com dueDate no periodo', () => {
      preparar([despesa({ value: 150, dueDate: '2026-03-10', status: 'a_pagar' })]);

      expect(component.gastosPeriodo).toBe(
        150,
        'Despesa operacional a_pagar com dueDate no periodo deve contar',
      );
    });

    it('[RED] gastosPeriodo inclui despesa operacional paga com dueDate no periodo (competencia independe de status)', () => {
      preparar([
        despesa({ value: 150, dueDate: '2026-03-10', status: 'a_pagar' }),
        despesa({ value: 80, dueDate: '2026-03-05', status: 'pago', paidDate: '2026-03-06' }),
      ]);

      expect(component.gastosPeriodo).toBe(
        230,
        'a_pagar (150) + pago com dueDate no periodo (80) = 230',
      );
    });

    it('[RED] gastosPeriodo NAO conta despesa paga dentro do periodo quando o dueDate esta fora (competencia por dueDate)', () => {
      preparar([
        despesa({ value: 90, dueDate: '2026-02-27', status: 'pago', paidDate: '2026-03-02' }),
      ]);

      expect(component.gastosPeriodo).toBe(
        0,
        'dueDate 2026-02-27 esta fora do periodo; paidDate dentro nao deve trazer a despesa',
      );
    });

    it('[RED] gastosPeriodo usa limites inclusivos de dueDate (inicio e fim contam; dia anterior e posterior nao)', () => {
      preparar([
        despesa({ value: 100, dueDate: '2026-03-01' }),
        despesa({ value: 50, dueDate: '2026-03-31' }),
        despesa({ value: 1000, dueDate: '2026-02-28' }),
        despesa({ value: 1000, dueDate: '2026-04-01' }),
      ]);

      expect(component.gastosPeriodo).toBe(
        150,
        'Somente 2026-03-01 (100) e 2026-03-31 (50) estao no periodo',
      );
    });

    it('[RED] gastosPeriodo NAO inclui custo_producao (ja esta no CMV)', () => {
      preparar([
        despesa({ value: 150, dueDate: '2026-03-10', categoryId: CAT_ALUGUEL }),
        despesa({ value: 500, dueDate: '2026-03-12', categoryId: CAT_COMPRA }),
      ]);

      expect(component.gastosPeriodo).toBe(150, 'custo_producao (500) nao entra em Gastos');
    });

    it('[RED] gastosPeriodo trata categoria orfa (inexistente) como operacional (conservador)', () => {
      preparar([despesa({ value: 70, dueDate: '2026-03-10', categoryId: 'cat-inexistente' })]);

      expect(component.gastosPeriodo).toBe(
        70,
        'Categoria sem cadastro conta como despesa operacional',
      );
    });

    it('[RED] gastosPeriodo soma em centavos sem erro de ponto flutuante', () => {
      preparar([
        despesa({ value: 10.1, dueDate: '2026-03-02' }),
        despesa({ value: 0.2, dueDate: '2026-03-03' }),
      ]);

      expect(component.gastosPeriodo).toBeCloseTo(10.3, 2, '10.10 + 0.20 = 10.30');
    });

    it('[RED] custoProducaoPeriodo soma custo_producao com dueDate no periodo, qualquer status', () => {
      preparar([
        despesa({
          value: 300,
          dueDate: '2026-03-12',
          status: 'pago',
          paidDate: '2026-03-13',
          categoryId: CAT_COMPRA,
        }),
        despesa({ value: 200, dueDate: '2026-03-20', status: 'a_pagar', categoryId: CAT_COMPRA }),
        despesa({ value: 999, dueDate: '2026-04-02', status: 'a_pagar', categoryId: CAT_COMPRA }),
        despesa({ value: 150, dueDate: '2026-03-10', categoryId: CAT_ALUGUEL }),
      ]);

      expect((component as any).custoProducaoPeriodo).toBe(
        500,
        'Somente custo_producao no periodo (300 pago + 200 a_pagar); operacional e fora do periodo ficam de fora',
      );
    });

    it('[RED] resultadoFinal = faturamento - custoTotal - gastosPeriodo (custo_producao nao desconta)', () => {
      preparar([
        despesa({ value: 150, dueDate: '2026-03-10', categoryId: CAT_ALUGUEL }),
        despesa({ value: 500, dueDate: '2026-03-12', categoryId: CAT_COMPRA }),
      ]);

      // 1000 - 400 - 150 = 450
      expect(component.resultadoFinal).toBe(
        450,
        'Resultado = faturamento (1000) - CMV (400) - operacional (150)',
      );
    });

    it('[RED] resultadoFinal ignora despesa paga fora do periodo por dueDate', () => {
      preparar([
        despesa({ value: 90, dueDate: '2026-02-27', status: 'pago', paidDate: '2026-03-02' }),
      ]);

      // 1000 - 400 - 0 = 600
      expect(component.resultadoFinal).toBe(
        600,
        'Despesa com dueDate fora do periodo nao reduz o Resultado',
      );
    });

    it('[RED] gastosPorCategoria lista so operacionais do periodo, ordenadas por total desc', () => {
      preparar([
        despesa({ value: 100, dueDate: '2026-03-05', categoryId: CAT_ALUGUEL }),
        despesa({ value: 50, dueDate: '2026-03-15', categoryId: CAT_ALUGUEL }),
        despesa({
          value: 200,
          dueDate: '2026-03-20',
          status: 'pago',
          paidDate: '2026-03-21',
          categoryId: CAT_ENERGIA,
        }),
        despesa({ value: 500, dueDate: '2026-03-12', categoryId: CAT_COMPRA }),
        despesa({ value: 999, dueDate: '2026-04-02', categoryId: CAT_ENERGIA }),
      ]);

      const linhas = (component as any).gastosPorCategoria as
        { categoryId: string; total: number }[] | undefined;
      expect(linhas?.map((l) => ({ categoryId: l.categoryId, total: l.total }))).toEqual(
        [
          { categoryId: CAT_ENERGIA, total: 200 },
          { categoryId: CAT_ALUGUEL, total: 150 },
        ],
        'Energia (200) antes de Aluguel (150); custo_producao e fora do periodo ficam de fora',
      );
    });

    it('[RED] soma das linhas de gastosPorCategoria bate com gastosPeriodo', () => {
      preparar([
        despesa({ value: 100, dueDate: '2026-03-05', categoryId: CAT_ALUGUEL }),
        despesa({ value: 200, dueDate: '2026-03-20', categoryId: CAT_ENERGIA }),
        despesa({ value: 500, dueDate: '2026-03-12', categoryId: CAT_COMPRA }),
      ]);

      const linhas = (component as any).gastosPorCategoria as { total: number }[] | undefined;
      const soma = (linhas ?? []).reduce((s, l) => s + l.total, 0);
      expect(soma).toBe(
        component.gastosPeriodo,
        'Breakdown operacional deve fechar com o card Gastos',
      );
      expect(component.gastosPeriodo).toBe(300, 'Gastos = 100 + 200; custo_producao (500) fora');
    });
  });
});
