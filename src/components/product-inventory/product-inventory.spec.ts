import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductInventoryComponent, HistoricoItem, HistoricoItemProduto } from './product-inventory';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { BillService } from '../../services/bill-service/bill-service';
import { PurchaseProductService } from '../../services/purchase-product-service/purchase-product-service';
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
    billService: { getBills: () => of([]) },
    purchaseProductService: { getPurchaseProducts: () => of([]) },
    orderService: { getOrders: () => of([]) },
    comandaService: { getAllComandas: () => of([]) },
    notif: {
      error: jasmine.createSpy('error'),
      success: jasmine.createSpy('success'),
      warning: jasmine.createSpy('warning')
    },
    config: {
      modules$: of({ gestao: true, clientes: true, compras: true }),
      // O template chama config.modules() (signal) diretamente — necessário só
      // pra suites que disparam fixture.detectChanges() (ex.: modal de detalhe).
      modules: () => ({ gestao: true, clientes: true, compras: true, vendedores: true })
    },
    geocodingService: { reverseGeocode: () => of(null) },
    vendedorService: {
      getVendedores: () => of([]),
      addVendedor: () => Promise.resolve(),
      updateVendedor: () => Promise.resolve(),
      deleteVendedor: () => Promise.resolve()
    }
  };

  beforeEach(async () => {
    const mockActivatedRoute = {
      snapshot: {},
      params: of({}),
      queryParams: of({})
    };

    await TestBed.configureTestingModule({
      imports: [ProductInventoryComponent],
      providers: [
        { provide: ProductService, useValue: mockServices.productService },
        { provide: SaleService, useValue: mockServices.saleService },
        { provide: PurchaseService, useValue: mockServices.purchaseService },
        { provide: CustomerService, useValue: mockServices.customerService },
        { provide: BillService, useValue: mockServices.billService },
        { provide: PurchaseProductService, useValue: mockServices.purchaseProductService },
        { provide: NotificationService, useValue: mockServices.notif },
        { provide: ConfigService, useValue: mockServices.config },
        { provide: OrderService, useValue: mockServices.orderService },
        { provide: ComandaService, useValue: mockServices.comandaService },
        { provide: GeocodingService, useValue: mockServices.geocodingService },
        { provide: VendedorService, useValue: mockServices.vendedorService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
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
          shippingCost: 0
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
          shippingCost: 0
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
          shippingCost: 0
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
          shippingCost: 0
        }
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
      expect(result.some(i => i.id === '1')).toBe(false, 'Item without paymentMethod should not match DINHEIRO filter');
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
          { idProduct: 'p1', productName: 'Produto 1', quantity: 2, priceAtSale: 20, priceAtCost: 10 },
          { idProduct: 'p2', productName: 'Produto 2', quantity: 3, priceAtSale: 30, priceAtCost: 15 }
        ],
        itemsTotal: 130, // (2*20) + (3*30)
        shippingCost: 10
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
          { idProduct: 'p1', productName: 'Produto 1', quantity: 2, priceAtSale: 20, priceAtCost: 10 },
          { idProduct: 'p2', productName: 'Produto 2', quantity: 3, priceAtSale: 30, priceAtCost: 15 }
        ],
        itemsTotal: 130,
        shippingCost: 10
      };

      // Lucro = itemsTotal (130) - custo (65) = 65 — frete (10) não entra na conta.
      expect(component.lucroHistoricoItem(item)).toBe(65, 'Frete não deve entrar no lucro nem no custo');
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
          { idProduct: 'p1', productName: 'Produto Prejuízo', quantity: 1, priceAtSale: 10, priceAtCost: 15 }
        ],
        itemsTotal: 10,
        shippingCost: 0
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
        idProduct: 'p1', productName: 'Queijo', quantity: 2.5, priceAtSale: 19.99, priceAtCost: 10, soldByWeight: true
      };

      expect(component.subtotalItemHistorico(item)).toBe(49.98, '19.99 * 2.5 deve arredondar (tie-break) pra 49.98');
    });

    it('subtotalItemHistorico usa priceAtSale * quantity direto quando soldByWeight é falsy', () => {
      const item: HistoricoItemProduto = {
        idProduct: 'p2', productName: 'Refrigerante', quantity: 3, priceAtSale: 5, priceAtCost: 2
      };

      expect(component.subtotalItemHistorico(item)).toBe(15, '5 * 3 = 15, sem soldByWeight');
    });

    it('montarHistorico usa a mesma regra de peso pra compor itemsTotal (pdv)', () => {
      const vendas = [{
        id: 'v1',
        sale_type: 'pdv',
        date: new Date('2026-02-01'),
        total: 49.98,
        items: [
          { idProduct: 'p1', productName: 'Queijo', quantity: 2.5, priceAtSale: 19.99, priceAtCost: 10, soldByWeight: true }
        ]
      }];

      const historico = (component as any).montarHistorico(vendas, [], []) as HistoricoItem[];

      expect(historico[0].itemsTotal).toBe(49.98, 'itemsTotal deve vir de calcularTotalItemPorPeso, não de priceAtSale*quantity cru (49.975)');
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
          { idProduct: 'p1', productName: 'Queijo', quantity: 2.5, priceAtSale: 19.99, priceAtCost: 10, soldByWeight: true }
        ],
        itemsTotal: 49.98,
        shippingCost: 0
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
      return linhas.find(l => (l.textContent || '').includes('Frete'));
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
      ...overrides
    });

    it('pedido com deliveryType delivery mostra o valor do frete', () => {
      const el = abrirModalCom(baseItem({
        total: 60, itemsTotal: 50, shippingCost: 10, deliveryType: 'delivery', address: 'Rua X, 123'
      }));

      const linha = linhaFrete(el);
      expect(linha).toBeTruthy('Deve existir uma linha de Frete pra pedido delivery');
      // Separador decimal depende do LOCALE_ID registrado no TestBed (não é
      // o mesmo do app real, que usa pt-BR) — casa "10.00" ou "10,00".
      expect(linha!.textContent).toMatch(/R\$\s*10[.,]00/);
    });

    it('pedido com deliveryType pickup mostra "Retirada — sem frete" em vez do valor', () => {
      const el = abrirModalCom(baseItem({
        total: 50, itemsTotal: 50, shippingCost: 0, deliveryType: 'pickup'
      }));

      const linha = linhaFrete(el);
      expect(linha).toBeTruthy('Deve existir uma linha de Frete pra pedido pickup');
      expect(linha!.textContent).toContain('Retirada — sem frete');
      expect(linha!.textContent).not.toContain('R$ 0,00');
    });

    it('pdv não mostra a linha de Frete', () => {
      const el = abrirModalCom(baseItem({ origem: 'pdv', clienteNome: 'Balcão', total: 50, itemsTotal: 50 }));

      expect(linhaFrete(el)).toBeFalsy('PDV não tem frete — linha não deve ser renderizada');
    });

    it('comanda não mostra a linha de Frete', () => {
      const el = abrirModalCom(baseItem({ origem: 'comanda', total: 50, itemsTotal: 50 }));

      expect(linhaFrete(el)).toBeFalsy('Comanda não tem frete — linha não deve ser renderizada');
    });
  });
});
