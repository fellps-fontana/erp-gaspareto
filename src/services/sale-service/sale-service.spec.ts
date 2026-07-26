import { TestBed } from '@angular/core/testing';
import { SaleService } from './sale-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Sale, PaymentMethod } from '../../models/sell-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('SaleService - Multi-tenant (companyId isolation)', () => {
  let service: SaleService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        SaleService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(SaleService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getSales() - Leitura', () => {
      it('[RED] should filter by companyId - own sales appear, foreign sales do not', async () => {
        const now = new Date() as any;

        // Seed: own company's sale
        const ownSale: Sale = {
          companyId: setup.mockCompanyId,
          items: [],
          total: 100,
          date: now,
          paymentMethod: PaymentMethod.DINHEIRO,
          sale_type: 'pdv'
        };
        await setDoc(doc(setup.firestore, `sales/own-sale-${Date.now()}`), ownSale);

        // Seed: foreign company's sale (should NOT appear)
        const foreignSale: Sale = {
          companyId: 'foreign-company-xyz',
          items: [],
          total: 50,
          date: now,
          paymentMethod: PaymentMethod.PIX,
          sale_type: 'pdv'
        };
        await setDoc(doc(setup.firestore, `sales/foreign-sale-${Date.now()}`), foreignSale);

        // Call service
        const sales = await firstValueFrom(service.getSales());

        // ASSERTION: own sale must appear
        const ownAppears = sales.some((s: any) => s.companyId === setup.mockCompanyId && s.total === 100);
        expect(ownAppears).toBeTruthy('Own company sale must appear');

        // ASSERTION: foreign sale must NOT appear
        const foreignAppears = sales.some((s: any) => s.companyId === 'foreign-company-xyz');
        expect(foreignAppears).toBeFalsy('Foreign company sale must NOT appear');
      });
    });

    describe('[RED] processSale() - Escrita', () => {
      it('[RED] should auto-inject companyId when processing sale', async () => {
        const now = new Date() as any;
        const newSale: Omit<Sale, 'companyId'> = {
          items: [
            {
              idProduct: 'prod-1',
              productName: 'Test',
              quantity: 1,
              priceAtSale: 100,
              priceAtCost: 50
            }
          ],
          total: 100,
          sale_type: 'pdv',
          paymentMethod: PaymentMethod.DINHEIRO,
          date: now
        };

        await service.processSale(newSale as any, false);

        const sales = await firstValueFrom(service.getSales());
        const hasSale = sales.some((s: any) => s.companyId === setup.mockCompanyId);
        expect(hasSale).toBeTruthy('Sale must be saved with companyId');
      });
    });
  });
});
