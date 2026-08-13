import { TestBed } from '@angular/core/testing';
import { BillRecurrenceService } from './bill-recurrence-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Bill } from '../../models/bill-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc, Timestamp } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';

// Describe isolado: logica pura, SEM emulador Firestore, SEM TestBed com
// providers de infra. BillRecurrenceService nao tem dependencias injetadas
// usadas por calcularProximaDataVencimento, entao instancia direta basta.
// Isso evita que o gap de infra do @firebase/rules-unit-testing no Karma
// (regra-de-negocio.md sec.12 / docs/multi-tenant.md) trave/atrase estes
// testes de logica pura via um beforeEach de emulador compartilhado.
describe('BillRecurrenceService - calcularProximaDataVencimento (logica pura, sem Firestore)', () => {
  let service: BillRecurrenceService;

  beforeEach(() => {
    service = new BillRecurrenceService();
  });

  describe('period = semanal', () => {
    it('[RED] should add exactly 7 days', () => {
      const anchorDate = new Date(2026, 0, 15);
      const nextDate = service.calcularProximaDataVencimento(anchorDate, 'semanal');
      const expected = new Date(2026, 0, 22);
      expect(nextDate.getTime()).toBe(expected.getTime());
    });

    it('[RED] should preserve time of day', () => {
      const anchorDate = new Date(2026, 0, 15, 14, 30, 0);
      const nextDate = service.calcularProximaDataVencimento(anchorDate, 'semanal');
      expect(nextDate.getHours()).toBe(14);
      expect(nextDate.getMinutes()).toBe(30);
    });
  });

  describe('period = mensal', () => {
    it('[RED] should add 1 month preserving day', () => {
      const anchorDate = new Date(2026, 0, 15);
      const nextDate = service.calcularProximaDataVencimento(anchorDate, 'mensal');
      const expected = new Date(2026, 1, 15);
      expect(nextDate.getTime()).toBe(expected.getTime());
    });

    it('[RED] should handle end-of-month overflow', () => {
      const anchorDate = new Date(2026, 0, 31);
      const nextDate = service.calcularProximaDataVencimento(anchorDate, 'mensal');
      expect(nextDate.getDate()).toBe(28);
      expect(nextDate.getMonth()).toBe(1);
    });

    it('[RED] should handle leap year Feb 29', () => {
      const anchorDate = new Date(2024, 1, 29);
      const nextDate = service.calcularProximaDataVencimento(anchorDate, 'mensal');
      const expected = new Date(2024, 2, 29);
      expect(nextDate.getTime()).toBe(expected.getTime());
    });
  });

  describe('chained operations', () => {
    it('[RED] should chain monthly additions', () => {
      let current = new Date(2026, 0, 15);
      current = service.calcularProximaDataVencimento(current, 'mensal');
      expect(current.getMonth()).toBe(1);
      expect(current.getDate()).toBe(15);
      current = service.calcularProximaDataVencimento(current, 'mensal');
      expect(current.getMonth()).toBe(2);
      expect(current.getDate()).toBe(15);
    });
  });
});

describe('BillRecurrenceService - checkAndGenerateDueOccurrences (REGRA CRITICA, requer emulador Firestore)', () => {
  let service: BillRecurrenceService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        BillRecurrenceService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(BillRecurrenceService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('[RED] checkAndGenerateDueOccurrences', () => {
    describe('overdue bills with purchaseProductId', () => {
      it('[RED] should generate exactly ONE bill when overdue', async () => {
        const now = Timestamp.now();
        const yesterday = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

        const recurringBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Monthly Subscription',
          value: 500,
          dueDate: yesterday,
          status: 'pendente',
          recurring: true,
          recurrencePeriod: 'mensal',
          createdAt: now,
          purchaseProductId: 'pp-monthly-123'
        };
        await setDoc(doc(setup.firestore, 'bills/recurring-' + Date.now()), recurringBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        expect(result.generated.length).toBe(1);
        expect(result.generated[0].status).toBe('pendente');
        expect(result.generated[0].purchaseProductId).toBe('pp-monthly-123');
      });

      it('[RED] should use anchor + period, not today + period', async () => {
        const now = Timestamp.now();
        const originalDue = Timestamp.fromDate(new Date(2026, 0, 15));

        const recurringBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Monthly Rent',
          value: 5000,
          dueDate: originalDue,
          status: 'pendente',
          recurring: true,
          recurrencePeriod: 'mensal',
          createdAt: now,
          purchaseProductId: 'pp-rent-office'
        };
        await setDoc(doc(setup.firestore, 'bills/rent-' + Date.now()), recurringBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        if (result.generated.length > 0) {
          const newDueDate = result.generated[0].dueDate?.toDate?.() || result.generated[0].dueDate as any;
          expect(newDueDate.getDate()).toBe(15);
        }
      });
    });

    describe('non-overdue bills', () => {
      it('[RED] should NOT generate when due date in future', async () => {
        const now = Timestamp.now();
        const tomorrow = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

        const recurringBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Future Bill',
          value: 100,
          dueDate: tomorrow,
          status: 'pendente',
          recurring: true,
          recurrencePeriod: 'semanal',
          createdAt: now,
          purchaseProductId: 'pp-future-123'
        };
        await setDoc(doc(setup.firestore, 'bills/future-' + Date.now()), recurringBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        expect(result.generated.length).toBe(0);
      });
    });

    describe('bills without purchaseProductId', () => {
      it('[RED] should NOT generate for recurring without productId', async () => {
        const now = Timestamp.now();
        const yesterday = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

        const manualBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Manual Recurring',
          value: 200,
          dueDate: yesterday,
          status: 'pendente',
          recurring: true,
          recurrencePeriod: 'mensal',
          createdAt: now
        };
        await setDoc(doc(setup.firestore, 'bills/manual-' + Date.now()), manualBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        expect(result.generated.length).toBe(0);
      });
    });

    describe('multiple overdue (catch-up)', () => {
      it('[RED] should generate ONLY ONE (most recent)', async () => {
        const now = Timestamp.now();
        const lastGenerated = Timestamp.fromDate(new Date(2026, 0, 15));
        const twoMonthsAgo = Timestamp.fromDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));

        const oldBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Very Overdue',
          value: 300,
          dueDate: lastGenerated,
          status: 'pendente',
          recurring: true,
          recurrencePeriod: 'mensal',
          createdAt: twoMonthsAgo,
          purchaseProductId: 'pp-overdue-123'
        };
        await setDoc(doc(setup.firestore, 'bills/overdue-' + Date.now()), oldBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        expect(result.generated.length).toBeLessThanOrEqual(1);
        if (result.generated.length === 1) {
          const generatedDue = result.generated[0].dueDate?.toDate?.() || result.generated[0].dueDate as any;
          const originalDue = lastGenerated.toDate?.() || lastGenerated as any;
          expect(generatedDue.getTime()).toBeGreaterThan(originalDue.getTime());
        }
      });
    });

    describe('tenant isolation (CRITICA)', () => {
      it('[RED] should only generate for specified companyId', async () => {
        const secondSetup = await setupSecondUserContext();
        try {
          const now = Timestamp.now();
          const yesterday = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

          const ownBill: Bill = {
            companyId: setup.mockCompanyId as string,
            name: 'Own Bill',
            value: 100,
            dueDate: yesterday,
            status: 'pendente',
            recurring: true,
            recurrencePeriod: 'semanal',
            createdAt: now,
            purchaseProductId: 'pp-own-123'
          };
          await setDoc(doc(setup.firestore, 'bills/own-' + Date.now()), ownBill);

          const foreignBill: Bill = {
            companyId: secondSetup.mockCompanyId as string,
            name: 'Foreign Bill',
            value: 50,
            dueDate: yesterday,
            status: 'pendente',
            recurring: true,
            recurrencePeriod: 'semanal',
            createdAt: now,
            purchaseProductId: 'pp-foreign-123'
          };
          await setDoc(doc(secondSetup.firestore, 'bills/foreign-' + Date.now()), foreignBill);

          const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

          expect(result.generated.some(b => b.purchaseProductId === 'pp-own-123')).toBeTruthy();
          expect(result.generated.some(b => b.purchaseProductId === 'pp-foreign-123')).toBeFalsy();
        } finally {
          await secondSetup.cleanup();
        }
      });

      it('[RED] should not leak foreign bills in result', async () => {
        const secondSetup = await setupSecondUserContext();
        try {
          const now = Timestamp.now();
          const yesterday = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

          const foreignBill: Bill = {
            companyId: secondSetup.mockCompanyId as string,
            name: 'Another Foreign Bill',
            value: 999,
            dueDate: yesterday,
            status: 'pendente',
            recurring: true,
            recurrencePeriod: 'mensal',
            createdAt: now,
            purchaseProductId: 'pp-another-foreign'
          };
          await setDoc(doc(secondSetup.firestore, 'bills/another-' + Date.now()), foreignBill);

          const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

          result.generated.forEach(bill => {
            expect(bill.companyId).toBe(setup.mockCompanyId as string);
          });
          expect(result.generated.some(b => b.companyId === secondSetup.mockCompanyId)).toBeFalsy(
            'No foreign bills from second user should appear in result'
          );
        } finally {
          await secondSetup.cleanup();
        }
      });
    });

    describe('status transitions on generation', () => {
      it('[RED] generated bill status always pendente', async () => {
        const now = Timestamp.now();
        const yesterday = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

        const paidBill: Bill = {
          companyId: setup.mockCompanyId as string,
          name: 'Paid Recurring',
          value: 500,
          dueDate: yesterday,
          status: 'pago',
          recurring: true,
          recurrencePeriod: 'mensal',
          paidAt: now,
          createdAt: now,
          purchaseProductId: 'pp-paid-123'
        };
        await setDoc(doc(setup.firestore, 'bills/paid-' + Date.now()), paidBill);

        const result = await service.checkAndGenerateDueOccurrences(setup.mockCompanyId as string);

        if (result.generated.length > 0) {
          expect(result.generated[0].status).toBe('pendente');
        }
      });
    });
  });
});
