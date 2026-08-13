import { TestBed } from '@angular/core/testing';
import { ComandaService } from './comanda-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Comanda } from '../../models/comanda-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('ComandaService - Multi-tenant (companyId isolation)', () => {
  let service: ComandaService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        ComandaService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(ComandaService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getOpenComandas() - Leitura', () => {
      it('[RED] should filter by companyId - own comandas appear, foreign comandas do not', async () => {
        const secondSetup = await setupSecondUserContext();
        try {
          const now = new Date() as any;

          // Seed: own company's comanda
          const ownComanda: Comanda = {
            companyId: setup.mockCompanyId as string,
            customerName: 'Own Customer',
            items: [],
            total: 0,
            status: 'open',
            createdAt: now
          };
          await setDoc(doc(setup.firestore, `comandas/own-comanda-${Date.now()}`), ownComanda);

          // Seed: foreign company's comanda (written by second user, should NOT appear to first user)
          const foreignComanda: Comanda = {
            companyId: secondSetup.mockCompanyId as string,
            customerName: 'Foreign Customer',
            items: [],
            total: 0,
            status: 'open',
            createdAt: now
          };
          await setDoc(doc(secondSetup.firestore, `comandas/foreign-comanda-${Date.now()}`), foreignComanda);

          // Call service (as first user)
          const comandas = await firstValueFrom(service.getOpenComandas());

          // ASSERTION: own comanda must appear
          const ownAppears = comandas.some((c: any) => c.companyId === setup.mockCompanyId && c.customerName === 'Own Customer');
          expect(ownAppears).toBeTruthy('Own company comanda must appear');

          // ASSERTION: foreign comanda must NOT appear
          const foreignAppears = comandas.some((c: any) => c.companyId === secondSetup.mockCompanyId);
          expect(foreignAppears).toBeFalsy('Foreign company comanda must NOT appear');
        } finally {
          await secondSetup.cleanup();
        }
      });
    });

    describe('[RED] addComanda() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding comanda', async () => {
        const newComanda = {
          customerName: 'Test',
          items: [],
          total: 0
        };

        await service.addComanda(newComanda as any);

        const comandas = await firstValueFrom(service.getOpenComandas());
        const hasComanda = comandas.some((c: any) => c.companyId === setup.mockCompanyId);
        expect(hasComanda).toBeTruthy('Comanda must be saved with companyId');
      });
    });
  });

  describe('NOVA REGRA: companyId null must trigger error (CRÍTICA)', () => {
    describe('[RED] addComanda() - Guarda contra companyId nulo', () => {
      it('[RED] should reject addComanda when companyId is null', async () => {
        const setupWithNullCompany = await setupFirestoreEmulatorTest(null);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            ComandaService,
            { provide: TenantService, useValue: setupWithNullCompany.tenantService },
            { provide: Firestore, useValue: setupWithNullCompany.firestore }
          ]
        });
        const serviceWithNullCompany = TestBed.inject(ComandaService);

        const newComanda = {
          customerName: 'Test',
          items: [],
          total: 0
        };

        try {
          await serviceWithNullCompany.addComanda(newComanda as any);
          fail('Expected addComanda to throw error when companyId is null');
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
