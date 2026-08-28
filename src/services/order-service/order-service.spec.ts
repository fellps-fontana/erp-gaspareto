import { TestBed } from '@angular/core/testing';
import { OrderService } from './order-service';
import { SaleService } from '../sale-service/sale-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Order } from '../../models/order-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc, collection, query, where, getDoc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

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

  describe('NOVA REGRA: finalizeOrder com paymentMethod e installments (CRÍTICA)', () => {
    describe('[RED] finalizeOrder() - Grava paymentMethod e installments', () => {
      it('[RED] should save installments to Sale when finalizing order', async () => {
        const now = new Date() as any;
        const { PaymentMethod } = await import('../../models/sell-model');

        // Seed: create Order directly with status 'delivered' (single transaction in finalizeOrder only)
        const orderId = `order-${Date.now()}-123`;
        const order: Order = {
          id: orderId,
          companyId: setup.mockCompanyId as string,
          orderNumber: 1,
          customerName: 'Client with installments',
          items: [
            {
              idProduct: 'prod-123',
              productName: 'Test Product',
              quantity: 2,
              priceAtSale: 50,
              priceAtCost: 30
            }
          ],
          itemsTotal: 100,
          shippingCost: 10,
          total: 110,
          status: 'delivered',
          deliveryType: 'delivery',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now,
          address: 'Test Street 123'
        };

        await setDoc(doc(setup.firestore, `orders/${orderId}`), order);

        // Finalize with 3 installments (this is the ONLY transaction in this test)
        await service.finalizeOrder(
          order,
          PaymentMethod.CARTAO,
          3
        );

        // Verify Sale was created with installments
        const salesRef = collection(setup.firestore, 'sales');
        const salesSnapshot = await firstValueFrom(
          service['collectionDataObservable']<any>(
            query(salesRef, where('sale_type', '==', 'order'), where('companyId', '==', setup.mockCompanyId))
          )
        );

        const lastSale = salesSnapshot[salesSnapshot.length - 1];
        expect(lastSale['installments']).toBe(3, 'Sale should have installments=3');
        expect(lastSale['paymentMethod']).toBe(PaymentMethod.CARTAO, 'Sale should have correct paymentMethod');
      });

      it('[RED] should default installments to 1 when not provided', async () => {
        const now = new Date() as any;
        const { PaymentMethod } = await import('../../models/sell-model');

        // Seed: create Order directly with status 'delivered' (single transaction in finalizeOrder only)
        const orderId = `order-${Date.now()}-456`;
        const order: Order = {
          id: orderId,
          companyId: setup.mockCompanyId as string,
          orderNumber: 2,
          customerName: 'Client cash payment',
          items: [
            {
              idProduct: 'prod-456',
              productName: 'Another Product',
              quantity: 1,
              priceAtSale: 25,
              priceAtCost: 15
            }
          ],
          itemsTotal: 25,
          shippingCost: 5,
          total: 30,
          status: 'delivered',
          deliveryType: 'pickup',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now
        };

        await setDoc(doc(setup.firestore, `orders/${orderId}`), order);

        // Finalize WITHOUT specifying installments (should default to 1)
        // This is the ONLY transaction in this test
        await service.finalizeOrder(
          order,
          PaymentMethod.DINHEIRO
        );

        const salesRef = collection(setup.firestore, 'sales');
        const salesSnapshot = await firstValueFrom(
          service['collectionDataObservable']<any>(
            query(salesRef, where('sale_type', '==', 'order'), where('companyId', '==', setup.mockCompanyId))
          )
        );

        const lastSale = salesSnapshot[salesSnapshot.length - 1];
        expect(lastSale['installments']).toBe(1, 'Sale should default installments to 1');
      });

      it('[RED] should save paymentMethod and installments to Order document', async () => {
        const now = new Date() as any;
        const { PaymentMethod } = await import('../../models/sell-model');

        // Seed: create Order directly with status 'delivered' (single transaction in finalizeOrder only)
        const orderId = `order-${Date.now()}-789`;
        const order: Order = {
          id: orderId,
          companyId: setup.mockCompanyId as string,
          orderNumber: 3,
          customerName: 'Client for Order update',
          items: [
            {
              idProduct: 'prod-789',
              productName: 'Pix Product',
              quantity: 1,
              priceAtSale: 100,
              priceAtCost: 60
            }
          ],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100,
          status: 'delivered',
          deliveryType: 'delivery',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now,
          address: 'Pix Street 456'
        };

        await setDoc(doc(setup.firestore, `orders/${orderId}`), order);

        // Finalize with PIX (1 installment, à vista)
        // This is the ONLY transaction in this test
        await service.finalizeOrder(
          order,
          PaymentMethod.PIX,
          1
        );

        // Verify Order was updated with paymentMethod and installments
        const orderRefAfter = doc(setup.firestore, `orders/${orderId}`);
        const orderSnapAfter = await getDoc(orderRefAfter);

        expect(orderSnapAfter.data()?.['paymentMethod']).toBe(PaymentMethod.PIX, 'Order should have paymentMethod=PIX');
        expect(orderSnapAfter.data()?.['installments']).toBe(1, 'Order should have installments=1');
        expect(orderSnapAfter.data()?.['status']).toBe('finished', 'Order should be finished');
      });

      it('[RED] should allow PIX with installments > 1 (Pix agora parcela)', async () => {
        const now = new Date() as any;
        const { PaymentMethod } = await import('../../models/sell-model');

        // Seed: create Order directly with status 'delivered'
        const orderId = `order-${Date.now()}-pix-parcelado`;
        const order: Order = {
          id: orderId,
          companyId: setup.mockCompanyId as string,
          orderNumber: 10,
          customerName: 'PIX parcelado',
          items: [
            {
              idProduct: 'prod-pix-1',
              productName: 'PIX Test Product',
              quantity: 1,
              priceAtSale: 100,
              priceAtCost: 60
            }
          ],
          itemsTotal: 100,
          shippingCost: 0,
          total: 100,
          status: 'delivered',
          deliveryType: 'pickup',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now
        };

        await setDoc(doc(setup.firestore, `orders/${orderId}`), order);

        // Finalize with PIX and installments=5 (Pix não é mais forçado a 1x)
        await service.finalizeOrder(
          order,
          PaymentMethod.PIX,
          5
        );

        // Verify Sale was created with installments=5, sem normalização
        const salesRef = collection(setup.firestore, 'sales');
        const salesSnapshot = await firstValueFrom(
          service['collectionDataObservable']<any>(
            query(salesRef, where('sale_type', '==', 'order'), where('companyId', '==', setup.mockCompanyId))
          )
        );

        const lastSale = salesSnapshot[salesSnapshot.length - 1];
        expect(lastSale['installments']).toBe(5, 'PIX pode ter installments=5, igual Cartao');
        expect(lastSale['paymentMethod']).toBe(PaymentMethod.PIX, 'Sale should have paymentMethod=PIX');

        // Verify Order also has installments=5, consistente com a Sale
        const orderRefAfter = doc(setup.firestore, `orders/${orderId}`);
        const orderSnapAfter = await getDoc(orderRefAfter);

        expect(orderSnapAfter.data()?.['installments']).toBe(5, 'Order PIX deve refletir installments=5, igual a Sale');
      });

      it('[RED] should normalize installments to minimum 1 when installments <= 0', async () => {
        const now = new Date() as any;
        const { PaymentMethod } = await import('../../models/sell-model');

        // Test with installments = 0
        const orderId1 = `order-${Date.now()}-zero-inst`;
        const order1: Order = {
          id: orderId1,
          companyId: setup.mockCompanyId as string,
          orderNumber: 11,
          customerName: 'Zero installments order',
          items: [
            {
              idProduct: 'prod-zero-1',
              productName: 'Zero Installment Product',
              quantity: 1,
              priceAtSale: 50,
              priceAtCost: 30
            }
          ],
          itemsTotal: 50,
          shippingCost: 0,
          total: 50,
          status: 'delivered',
          deliveryType: 'pickup',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now
        };

        await setDoc(doc(setup.firestore, `orders/${orderId1}`), order1);

        // Finalize with installments=0 (should normalize to 1)
        await service.finalizeOrder(
          order1,
          PaymentMethod.DINHEIRO,
          0
        );

        // Verify Sale has installments normalized to 1
        const salesRef = collection(setup.firestore, 'sales');
        const salesSnapshot = await firstValueFrom(
          service['collectionDataObservable']<any>(
            query(salesRef, where('sale_type', '==', 'order'), where('companyId', '==', setup.mockCompanyId))
          )
        );

        const lastSale = salesSnapshot[salesSnapshot.length - 1];
        expect(lastSale['installments']).toBe(1, 'Installments 0 should be normalized to minimum 1');

        // Test with installments = -3
        const orderId2 = `order-${Date.now()}-negative-inst`;
        const order2: Order = {
          id: orderId2,
          companyId: setup.mockCompanyId as string,
          orderNumber: 12,
          customerName: 'Negative installments order',
          items: [
            {
              idProduct: 'prod-neg-1',
              productName: 'Negative Installment Product',
              quantity: 1,
              priceAtSale: 75,
              priceAtCost: 45
            }
          ],
          itemsTotal: 75,
          shippingCost: 0,
          total: 75,
          status: 'delivered',
          deliveryType: 'pickup',
          scheduledDate: now,
          actualDeliveryDate: now,
          createdAt: now
        };

        await setDoc(doc(setup.firestore, `orders/${orderId2}`), order2);

        // Finalize with installments=-3 (should normalize to 1)
        await service.finalizeOrder(
          order2,
          PaymentMethod.CARTAO,
          -3
        );

        // Verify Sale has installments normalized to 1
        const salesSnapshot2 = await firstValueFrom(
          service['collectionDataObservable']<any>(
            query(salesRef, where('sale_type', '==', 'order'), where('companyId', '==', setup.mockCompanyId))
          )
        );

        const lastSale2 = salesSnapshot2[salesSnapshot2.length - 1];
        expect(lastSale2['installments']).toBe(1, 'Installments -3 should be normalized to minimum 1');
      });
    });
  });
});
