import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductInventoryComponent, HistoricoItem } from './product-inventory';
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
      modules$: of({ gestao: true, clientes: true, compras: true })
    },
    geocodingService: { reverseGeocode: () => of(null) }
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
          itens: []
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
          itens: []
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
          itens: []
        },
        {
          id: '4',
          origem: 'pdv' as const,
          data: new Date('2026-01-04'),
          clienteNome: 'Balcão',
          status: 'completed',
          total: 50,
          paymentMethod: PaymentMethod.CHEQUE,
          itens: []
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
});
