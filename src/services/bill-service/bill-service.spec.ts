import { TestBed } from '@angular/core/testing';
import { BillService } from './bill-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Bill } from '../../models/bill-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('BillService - Multi-tenant (companyId isolation)', () => {
  let service: BillService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        BillService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(BillService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getBills() - Leitura', () => {
      it('[RED] should filter by companyId - own bills appear, foreign bills do not', async () => {
        const now = new Date() as any;

        // Seed: own company's bill
        const ownBill: Bill = {
          companyId: setup.mockCompanyId,
          name: 'Own Bill',
          value: 100,
          status: 'pendente',
          recurring: false,
          createdAt: now
        };
        await setDoc(doc(setup.firestore, `bills/own-bill-${Date.now()}`), ownBill);

        // Seed: foreign company's bill (should NOT appear)
        const foreignBill: Bill = {
          companyId: 'foreign-company-xyz',
          name: 'Foreign Bill',
          value: 50,
          status: 'pendente',
          recurring: false,
          createdAt: now
        };
        await setDoc(doc(setup.firestore, `bills/foreign-bill-${Date.now()}`), foreignBill);

        // Call service
        const bills = await firstValueFrom(service.getBills());

        // ASSERTION: own bill must appear
        const ownAppears = bills.some((b: any) => b.companyId === setup.mockCompanyId && b.name === 'Own Bill');
        expect(ownAppears).toBeTruthy('Own company bill must appear');

        // ASSERTION: foreign bill must NOT appear
        const foreignAppears = bills.some((b: any) => b.companyId === 'foreign-company-xyz');
        expect(foreignAppears).toBeFalsy('Foreign company bill must NOT appear');
      });
    });

    describe('[RED] addBill() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding bill', async () => {
        const newBill = {
          name: 'Test Bill',
          value: 100,
          status: 'pendente' as const,
          recurring: false
        };

        await service.addBill(newBill as any);

        const bills = await firstValueFrom(service.getBills());
        const hasBill = bills.some((b: any) => b.companyId === setup.mockCompanyId);
        expect(hasBill).toBeTruthy('Bill must be saved with companyId');
      });
    });
  });
});
