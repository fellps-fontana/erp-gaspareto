import { TestBed } from '@angular/core/testing';
import { PurchaseService } from './purchase-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Purchase } from '../../models/buy-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('PurchaseService - Multi-tenant (companyId isolation)', () => {
  let service: PurchaseService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        PurchaseService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(PurchaseService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getPurchases() - Leitura', () => {
      it('[RED] should filter by companyId - own purchases appear, foreign purchases do not', async () => {
        const now = new Date() as any;

        // Seed: own company's purchase
        const ownPurchase: Purchase = {
          id: `own-${Date.now()}`,
          companyId: setup.mockCompanyId,
          idProduct: 'prod-1',
          amount: 10,
          unityValue: 50,
          date: now
        };
        await setDoc(doc(setup.firestore, `purchases/own-purchase-${Date.now()}`), ownPurchase);

        // Seed: foreign company's purchase (should NOT appear)
        const foreignPurchase: Purchase = {
          id: `foreign-${Date.now()}`,
          companyId: 'foreign-company-xyz',
          idProduct: 'prod-2',
          amount: 5,
          unityValue: 100,
          date: now
        };
        await setDoc(doc(setup.firestore, `purchases/foreign-purchase-${Date.now()}`), foreignPurchase);

        // Call service
        const purchases = await firstValueFrom(service.getPurchases());

        // ASSERTION: own purchase must appear
        const ownAppears = purchases.some((p: any) => p.companyId === setup.mockCompanyId && p.idProduct === 'prod-1');
        expect(ownAppears).toBeTruthy('Own company purchase must appear');

        // ASSERTION: foreign purchase must NOT appear
        const foreignAppears = purchases.some((p: any) => p.companyId === 'foreign-company-xyz');
        expect(foreignAppears).toBeFalsy('Foreign company purchase must NOT appear');
      });
    });

    describe('[RED] addPurchase() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding purchase', async () => {
        const now = new Date() as any;
        const newPurchase = {
          id: `purchase-${Date.now()}`,
          idProduct: 'prod-1',
          amount: 10,
          unityValue: 50,
          date: now
        };

        await service.addPurchase(newPurchase as any);

        const purchases = await firstValueFrom(service.getPurchases());
        const hasPurchase = purchases.some((p: any) => p.companyId === setup.mockCompanyId);
        expect(hasPurchase).toBeTruthy('Purchase must be saved with companyId');
      });
    });
  });
});
