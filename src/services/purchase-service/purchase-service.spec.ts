import { TestBed } from '@angular/core/testing';
import { PurchaseService } from './purchase-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Purchase } from '../../models/buy-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';
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
        const secondSetup = await setupSecondUserContext();
        try {
          const now = new Date() as any;

          // Seed: own company's purchase
          const ownPurchase: Purchase = {
            id: `own-${Date.now()}`,
            companyId: setup.mockCompanyId as string,
            idProduct: 'prod-1',
            amount: 10,
            unityValue: 50,
            date: now
          };
          await setDoc(doc(setup.firestore, `purchases/own-purchase-${Date.now()}`), ownPurchase);

          // Seed: foreign company's purchase (written by second user, should NOT appear to first user)
          const foreignPurchase: Purchase = {
            id: `foreign-${Date.now()}`,
            companyId: secondSetup.mockCompanyId as string,
            idProduct: 'prod-2',
            amount: 5,
            unityValue: 100,
            date: now
          };
          await setDoc(doc(secondSetup.firestore, `purchases/foreign-purchase-${Date.now()}`), foreignPurchase);

          // Call service (as first user)
          const purchases = await firstValueFrom(service.getPurchases());

          // ASSERTION: own purchase must appear
          const ownAppears = purchases.some((p: any) => p.companyId === setup.mockCompanyId && p.idProduct === 'prod-1');
          expect(ownAppears).toBeTruthy('Own company purchase must appear');

          // ASSERTION: foreign purchase must NOT appear
          const foreignAppears = purchases.some((p: any) => p.companyId === secondSetup.mockCompanyId);
          expect(foreignAppears).toBeFalsy('Foreign company purchase must NOT appear');
        } finally {
          await secondSetup.cleanup();
        }
      });
    });

    describe('[RED] addPurchase() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding purchase', async () => {
        const now = new Date() as any;

        // Seed: product that addPurchase() will reference
        // addPurchase() validates that the product exists before registering the purchase
        // ID único por execução: um ID fixo colide com dado remanescente de
        // outras execuções no mesmo emulador (Firestore não é limpo entre
        // arquivos de spec) — o doc antigo pode pertencer a outra empresa,
        // barrado pelas firestore.rules com PERMISSION_DENIED antes mesmo
        // de addPurchase() ser chamado.
        const productId = `prod-${Date.now()}`;
        await setDoc(doc(setup.firestore, `products/${productId}`), {
          companyId: setup.mockCompanyId,
          title: 'Test Product',
          buyPrice: 10,
          sellPrice: 20,
          stock: 100
        });

        const newPurchase = {
          id: `purchase-${Date.now()}`,
          idProduct: productId,
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

  describe('NOVA REGRA: companyId null must trigger error (CRÍTICA)', () => {
    describe('[RED] addPurchase() - Guarda contra companyId nulo', () => {
      it('[RED] should reject addPurchase when companyId is null', async () => {
        const setupWithNullCompany = await setupFirestoreEmulatorTest(null);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            PurchaseService,
            { provide: TenantService, useValue: setupWithNullCompany.tenantService },
            { provide: Firestore, useValue: setupWithNullCompany.firestore }
          ]
        });
        const serviceWithNullCompany = TestBed.inject(PurchaseService);

        const now = new Date() as any;

        // Não precisa semear o produto: a guarda de companyId nulo dispara
        // antes de qualquer leitura/escrita no Firestore (inclusive antes de
        // checar se o produto existe), então addPurchase deve rejeitar sem
        // nunca tocar na rede.
        const newPurchase = {
          id: `purchase-${Date.now()}`,
          idProduct: 'prod-1',
          amount: 10,
          unityValue: 50,
          date: now
        };

        try {
          await serviceWithNullCompany.addPurchase(newPurchase as any);
          fail('Expected addPurchase to throw error when companyId is null');
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
