import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersComponent } from './order';
import { ProductService } from '../../services/product-service/product-service';
import { OrderService } from '../../services/order-service/order-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { VendedorService } from '../../services/vendedor-service/vendedor-service';
import { ConfigService } from '../../services/config/config.service';
import { Router } from '@angular/router';
import { PaymentMethod } from '../../models/sell-model';
import { of } from 'rxjs';

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;

  // Mock services
  const mockProductService = {
    getProducts: () => of([])
  };

  const mockOrderService = {
    getOrders: () => of([])
  };

  const mockCustomerService = {
    getCustomers: () => of([])
  };

  const mockNotificationService = {
    error: jasmine.createSpy('error'),
    success: jasmine.createSpy('success'),
    warning: jasmine.createSpy('warning')
  };

  const mockRouter = {
    navigate: jasmine.createSpy('navigate')
  };

  const mockVendedorService = {
    getVendedores: () => of([])
  };

  const mockConfigService = {
    modules: () => ({}),
    modules$: of({})
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        { provide: ProductService, useValue: mockProductService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: CustomerService, useValue: mockCustomerService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: VendedorService, useValue: mockVendedorService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
  });

  describe('[RED] requiresInstallments getter', () => {
    it('[RED] should return true for DINHEIRO (cash payment)', () => {
      component.selectedPaymentMethod = PaymentMethod.DINHEIRO;
      const result = component.requiresInstallments;
      expect(result).toBe(true, 'Cash (DINHEIRO) should require installments selector');
    });

    it('[RED] should return true for CARTAO (card payment)', () => {
      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      const result = component.requiresInstallments;
      expect(result).toBe(true, 'Card (CARTAO) should require installments selector');
    });

    it('[RED] should return true for CHEQUE (check payment)', () => {
      component.selectedPaymentMethod = PaymentMethod.CHEQUE;
      const result = component.requiresInstallments;
      expect(result).toBe(true, 'Check (CHEQUE) should require installments selector');
    });

    it('[RED] should return false for PIX (instant payment, always cash)', () => {
      component.selectedPaymentMethod = PaymentMethod.PIX;
      const result = component.requiresInstallments;
      expect(result).toBe(false, 'PIX is always instant (1x), no installments selector');
    });

    it('[RED] should respect selectedPaymentMethod changes', () => {
      component.selectedPaymentMethod = PaymentMethod.DINHEIRO;
      expect(component.requiresInstallments).toBe(true, 'Should be true for DINHEIRO');

      component.selectedPaymentMethod = PaymentMethod.PIX;
      expect(component.requiresInstallments).toBe(false, 'Should be false for PIX');

      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      expect(component.requiresInstallments).toBe(true, 'Should be true for CARTAO');
    });
  });

  describe('[RED] selectedPaymentMethod setter — reset installments on PIX', () => {
    it('[RED] should reset selectedInstallments to 1 when switching to PIX from card payment', () => {
      // Start with CARTAO and 5 installments
      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      component.selectedInstallments = 5;

      expect(component.selectedInstallments).toBe(5, 'Setup: should have 5 installments for CARTAO');

      // Switch to PIX — should reset to 1
      component.selectedPaymentMethod = PaymentMethod.PIX;

      expect(component.selectedInstallments).toBe(1, 'Switching to PIX should reset installments to 1');
    });

    it('[RED] should reset selectedInstallments to 1 when switching to PIX from cash payment', () => {
      // Start with DINHEIRO and 3 installments
      component.selectedPaymentMethod = PaymentMethod.DINHEIRO;
      component.selectedInstallments = 3;

      expect(component.selectedInstallments).toBe(3, 'Setup: should have 3 installments for DINHEIRO');

      // Switch to PIX — should reset to 1
      component.selectedPaymentMethod = PaymentMethod.PIX;

      expect(component.selectedInstallments).toBe(1, 'Switching to PIX should reset installments to 1');
    });

    it('[RED] should keep selectedInstallments unchanged when switching between non-PIX methods', () => {
      // Start with CARTAO and 4 installments
      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      component.selectedInstallments = 4;

      // Switch to DINHEIRO — should NOT reset (both allow multiple installments)
      component.selectedPaymentMethod = PaymentMethod.DINHEIRO;

      expect(component.selectedInstallments).toBe(4, 'Switching CARTAO→DINHEIRO should not reset installments');
    });

    it('[RED] should reset to 1 when switching back to PIX from any method', () => {
      // Start with PIX and 1 installment
      component.selectedPaymentMethod = PaymentMethod.PIX;
      component.selectedInstallments = 1;

      expect(component.selectedInstallments).toBe(1, 'PIX starts with 1 installment');

      // Switch to CARTAO with 6 installments
      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      component.selectedInstallments = 6;

      // Switch back to PIX — should reset to 1
      component.selectedPaymentMethod = PaymentMethod.PIX;

      expect(component.selectedInstallments).toBe(1, 'Switching back to PIX should reset installments to 1 again');
    });
  });
});
