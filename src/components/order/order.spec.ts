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
import { OrderItem } from '../../models/order-model';
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

  describe('selectedPaymentMethod — Pix agora parcela (nao reseta installments)', () => {
    it('should preserve selectedInstallments when switching from CARTAO to PIX', () => {
      component.selectedPaymentMethod = PaymentMethod.CARTAO;
      component.selectedInstallments = 5;

      component.selectedPaymentMethod = PaymentMethod.PIX;

      expect(component.selectedInstallments).toBe(5, 'Trocar pra PIX nao deve mais resetar installments');
    });

    it('should preserve selectedInstallments when switching from DINHEIRO to PIX', () => {
      component.selectedPaymentMethod = PaymentMethod.DINHEIRO;
      component.selectedInstallments = 3;

      component.selectedPaymentMethod = PaymentMethod.PIX;

      expect(component.selectedInstallments).toBe(3, 'Trocar pra PIX nao deve mais resetar installments');
    });
  });

  describe('onQuantityInputChange — bug: apagar quantidade nao pode remover o item', () => {
    it('should not remove or change quantity when value is transiently empty', () => {
      const item: OrderItem = { idProduct: 'p1', productName: 'Produto', quantity: 1, priceAtSale: 10, priceAtCost: 5 };
      component.cart = [item];

      component.onQuantityInputChange(item, '');

      expect(component.cart.length).toBe(1, 'Item nao pode ser removido por valor vazio transitorio');
      expect(item.quantity).toBe(1, 'Quantidade nao muda enquanto o valor for invalido');
    });

    it('should not remove the item when value is "0" or negative', () => {
      const item: OrderItem = { idProduct: 'p1', productName: 'Produto', quantity: 2, priceAtSale: 10, priceAtCost: 5 };
      component.cart = [item];

      component.onQuantityInputChange(item, '0');
      component.onQuantityInputChange(item, -3);

      expect(component.cart.length).toBe(1, 'Item nao pode ser removido por valor 0/negativo digitado no meio da edicao');
      expect(item.quantity).toBe(2, 'Quantidade permanece a ultima valida');
    });

    it('should update quantity when the final typed value is a valid integer', () => {
      const item: OrderItem = { idProduct: 'p1', productName: 'Produto', quantity: 1, priceAtSale: 10, priceAtCost: 5 };
      component.cart = [item];

      component.onQuantityInputChange(item, '3');

      expect(item.quantity).toBe(3, 'Valor final valido deve atualizar a quantidade');
      expect(component.cart.length).toBe(1);
    });
  });

  describe('onQuantityInputBlur — restaura valor valido ao sair do campo em estado invalido', () => {
    it('should restore the input to the last valid quantity when left empty on blur', () => {
      const item: OrderItem = { idProduct: 'p1', productName: 'Produto', quantity: 4, priceAtSale: 10, priceAtCost: 5 };
      component.cart = [item];
      const input = document.createElement('input');
      input.value = '';

      component.onQuantityInputBlur(item, input);

      expect(input.value).toBe('4', 'Input deve voltar pro ultimo valor valido de item.quantity');
      expect(component.cart.length).toBe(1, 'Item nao pode ser removido no blur');
    });

    it('should not touch the input when its value is already valid on blur', () => {
      const item: OrderItem = { idProduct: 'p1', productName: 'Produto', quantity: 4, priceAtSale: 10, priceAtCost: 5 };
      component.cart = [item];
      const input = document.createElement('input');
      input.value = '7';

      component.onQuantityInputBlur(item, input);

      expect(input.value).toBe('7', 'Valor final valido nao deve ser sobrescrito no blur');
    });
  });
});
