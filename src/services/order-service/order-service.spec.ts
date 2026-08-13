import { TestBed } from '@angular/core/testing';
import { OrderService } from './order-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Order } from '../../models/order-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
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
});
