import { TestBed } from '@angular/core/testing';
import { PurchaseProductService } from './purchase-product-service';
import { TenantService } from '../tenant-service/tenant-service';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('PurchaseProductService - Multi-tenant (companyId isolation)', () => {
  let service: PurchaseProductService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        PurchaseProductService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(PurchaseProductService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getPurchaseProducts() - Leitura', () => {
      it('[RED] should filter by companyId - own products appear, foreign products do not', async () => {
        const now = new Date() as any;

        // Seed: own company's purchase product
        const ownProduct: PurchaseProduct = {
          companyId: setup.mockCompanyId,
          name: 'Own Product',
          defaultValue: 100,
          recurring: true,
          recurrencePeriod: 'monthly',
          createdAt: now
        };
        await setDoc(doc(setup.firestore, `purchaseProducts/own-pp-${Date.now()}`), ownProduct);

        // Seed: foreign company's purchase product (should NOT appear)
        const foreignProduct: PurchaseProduct = {
          companyId: 'foreign-company-xyz',
          name: 'Foreign Product',
          defaultValue: 50,
          recurring: false,
          createdAt: now
        };
        await setDoc(doc(setup.firestore, `purchaseProducts/foreign-pp-${Date.now()}`), foreignProduct);

        // Call service
        const products = await firstValueFrom(service.getPurchaseProducts());

        // ASSERTION: own product must appear
        const ownAppears = products.some((p: any) => p.companyId === setup.mockCompanyId && p.name === 'Own Product');
        expect(ownAppears).toBeTruthy('Own company purchase product must appear');

        // ASSERTION: foreign product must NOT appear
        const foreignAppears = products.some((p: any) => p.companyId === 'foreign-company-xyz');
        expect(foreignAppears).toBeFalsy('Foreign company purchase product must NOT appear');
      });
    });

    describe('[RED] addPurchaseProduct() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding purchase product', async () => {
        const newProduct = {
          name: 'Test Product',
          defaultValue: 100,
          recurring: false
        };

        await service.addPurchaseProduct(newProduct as any);

        const products = await firstValueFrom(service.getPurchaseProducts());
        const hasProduct = products.some((p: any) => p.companyId === setup.mockCompanyId);
        expect(hasProduct).toBeTruthy('Purchase product must be saved with companyId');
      });
    });
  });
});
