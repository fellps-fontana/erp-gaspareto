import { TestBed } from '@angular/core/testing';
import { CustomerService } from './customer-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Customer } from '../../models/customer-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('CustomerService - Multi-tenant (companyId isolation)', () => {
  let service: CustomerService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        CustomerService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(CustomerService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getCustomers() - Leitura', () => {
      it('[RED] should filter by companyId - own customers appear, foreign customers do not', async () => {
        // Seed: own company's customer
        const ownCustomer: Customer = {
          companyId: setup.mockCompanyId as string,
          name: 'Own Customer'
        };
        await setDoc(doc(setup.firestore, `customers/own-cust-${Date.now()}`), ownCustomer);

        // Seed: foreign company's customer (should NOT appear)
        const foreignCustomer: Customer = {
          companyId: 'foreign-company-xyz',
          name: 'Foreign Customer'
        };
        await setDoc(doc(setup.firestore, `customers/foreign-cust-${Date.now()}`), foreignCustomer);

        // Call service
        const customers = await firstValueFrom(service.getCustomers());

        // ASSERTION: own customer must appear
        const ownAppears = customers.some((c: any) => c.companyId === setup.mockCompanyId && c.name === 'Own Customer');
        expect(ownAppears).toBeTruthy('Own company customer must appear');

        // ASSERTION: foreign customer must NOT appear
        const foreignAppears = customers.some((c: any) => c.companyId === 'foreign-company-xyz');
        expect(foreignAppears).toBeFalsy('Foreign company customer must NOT appear');
      });
    });

    describe('[RED] addCustomer() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding customer', async () => {
        const newCustomer = {
          name: 'Test Customer'
        };

        await service.addCustomer(newCustomer as any);

        const customers = await firstValueFrom(service.getCustomers());
        const hasCustomer = customers.some((c: any) => c.companyId === setup.mockCompanyId);
        expect(hasCustomer).toBeTruthy('Customer must be saved with companyId');
      });
    });
  });

  describe('NOVA REGRA: companyId null must trigger error (CRÍTICA)', () => {
    describe('[RED] addCustomer() - Guarda contra companyId nulo', () => {
      it('[RED] should reject addCustomer when companyId is null', async () => {
        const setupWithNullCompany = await setupFirestoreEmulatorTest(null);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            CustomerService,
            { provide: TenantService, useValue: setupWithNullCompany.tenantService },
            { provide: Firestore, useValue: setupWithNullCompany.firestore }
          ]
        });
        const serviceWithNullCompany = TestBed.inject(CustomerService);

        const newCustomer = {
          name: 'Test Customer'
        };

        try {
          await serviceWithNullCompany.addCustomer(newCustomer as any);
          fail('Expected addCustomer to throw error when companyId is null');
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
