import { TestBed } from '@angular/core/testing';
import { SaleService } from './sale-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Sale, PaymentMethod } from '../../models/sell-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc, getDoc, getDocs, collection, query, where, runTransaction, Timestamp, DocumentReference } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, EmulatorTestContext, setupSecondUserContext } from '../test-helpers';
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
        const secondSetup = await setupSecondUserContext();
        try {
          const now = new Date() as any;

          // Seed: own company's sale
          const ownSale: Sale = {
            companyId: setup.mockCompanyId as string,
            items: [],
            total: 100,
            date: now,
            paymentMethod: PaymentMethod.DINHEIRO,
            sale_type: 'pdv'
          };
          await setDoc(doc(setup.firestore, `sales/own-sale-${Date.now()}`), ownSale);

          // Seed: foreign company's sale (written by second user, should NOT appear to first user)
          const foreignSale: Sale = {
            companyId: secondSetup.mockCompanyId as string,
            items: [],
            total: 50,
            date: now,
            paymentMethod: PaymentMethod.PIX,
            sale_type: 'pdv'
          };
          await setDoc(doc(secondSetup.firestore, `sales/foreign-sale-${Date.now()}`), foreignSale);

          // Call service (as first user)
          const sales = await firstValueFrom(service.getSales());

          // ASSERTION: own sale must appear
          const ownAppears = sales.some((s: any) => s.companyId === setup.mockCompanyId && s.total === 100);
          expect(ownAppears).toBeTruthy('Own company sale must appear');

          // ASSERTION: foreign sale must NOT appear
          const foreignAppears = sales.some((s: any) => s.companyId === secondSetup.mockCompanyId);
          expect(foreignAppears).toBeFalsy('Foreign company sale must NOT appear');
        } finally {
          await secondSetup.cleanup();
        }
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

  describe('NOVA REGRA: companyId null must trigger error (CRÍTICA)', () => {
    describe('[RED] processSale() - Guarda contra companyId nulo', () => {
      it('[RED] should reject processSale when companyId is null', async () => {
        const setupWithNullCompany = await setupFirestoreEmulatorTest(null);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            SaleService,
            { provide: TenantService, useValue: setupWithNullCompany.tenantService },
            { provide: Firestore, useValue: setupWithNullCompany.firestore }
          ]
        });
        const serviceWithNullCompany = TestBed.inject(SaleService);

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

        try {
          await serviceWithNullCompany.processSale(newSale as any, false);
          fail('Expected processSale to throw error when companyId is null');
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

  describe('Helpers transacionais de Pedidos - regra 5.3 (CRITICA)', () => {
    // Venda de pedido: sale_type 'order', sem forma de pagamento.
    const buildOrderSale = (total: number, idProduct: string): Omit<Sale, 'id' | 'companyId'> => ({
      items: [
        {
          idProduct,
          productName: 'Produto Teste',
          quantity: 2,
          priceAtSale: total / 2,
          priceAtCost: 10
        }
      ],
      total,
      sale_type: 'order',
      date: new Date() as any
    });

    const seedProduct = async (id: string, stock: number): Promise<void> => {
      await setDoc(doc(setup.firestore, `products/${id}`), {
        companyId: setup.mockCompanyId,
        name: 'Produto Teste',
        stock,
        price: 50,
        cost: 10
      });
    };

    // Sale ja existente (como gravada na entrega do pedido), sem forma de pagamento.
    const seedOrderSale = async (id: string, total: number, idProduct: string): Promise<void> => {
      await setDoc(doc(setup.firestore, `sales/${id}`), {
        companyId: setup.mockCompanyId,
        items: [
          { idProduct, productName: 'Produto Teste', quantity: 2, priceAtSale: 50, priceAtCost: 10 }
        ],
        total,
        date: Timestamp.now(),
        status: 'completed',
        sale_type: 'order'
      });
    };

    const readStock = async (id: string): Promise<number> => {
      const snap = await getDoc(doc(setup.firestore, `products/${id}`));
      return snap.data()!['stock'];
    };

    const countOrderSales = async (): Promise<number> => {
      const snap = await getDocs(query(
        collection(setup.firestore, 'sales'),
        where('companyId', '==', setup.mockCompanyId),
        where('sale_type', '==', 'order')
      ));
      return snap.size;
    };

    describe('[RED] addSaleInTransaction()', () => {
      it('[RED] should create a completed order Sale with full total, items, no paymentMethod and no stock change', async () => {
        const productId = `prod-add-${Date.now()}`;
        await seedProduct(productId, 10);
        const captured: { ref?: DocumentReference } = {};

        await runTransaction(setup.firestore, async (tx) => {
          captured.ref = service.addSaleInTransaction(
            tx,
            buildOrderSale(100, productId),
            setup.mockCompanyId as string
          );
        });

        expect(captured.ref).toBeDefined();
        expect(captured.ref!.path.startsWith('sales/')).toBeTrue();

        const snap = await getDoc(captured.ref!);
        const data: any = snap.data();
        expect(snap.exists()).toBeTrue();
        expect(data.companyId).toBe(setup.mockCompanyId as string);
        expect(data.status).toBe('completed');
        expect(data.total).toBe(100);
        expect(data.sale_type).toBe('order');
        expect(data.items.length).toBe(1);
        expect(data.items[0].idProduct).toBe(productId);
        expect(data.paymentMethod).toBeUndefined();
        expect(await readStock(productId)).toBe(10);
      });

      it('[RED] should not change stock even when the product has no stock available', async () => {
        const productId = `prod-zero-${Date.now()}`;
        await seedProduct(productId, 0);

        await runTransaction(setup.firestore, async (tx) => {
          service.addSaleInTransaction(tx, buildOrderSale(100, productId), setup.mockCompanyId as string);
        });

        expect(await readStock(productId)).toBe(0);
      });

      it('[RED] should not persist any Sale when the transaction fails after addSaleInTransaction (atomicity)', async () => {
        const productId = `prod-atomic-${Date.now()}`;
        await seedProduct(productId, 10);
        const before = await countOrderSales();

        let caughtMessage = '';
        try {
          await runTransaction(setup.firestore, async (tx) => {
            service.addSaleInTransaction(tx, buildOrderSale(100, productId), setup.mockCompanyId as string);
            throw new Error('falha simulada apos addSaleInTransaction');
          });
        } catch (error: any) {
          caughtMessage = error.message;
        }

        expect(caughtMessage).toBe('falha simulada apos addSaleInTransaction');
        expect(await countOrderSales()).toBe(before);
      });
    });

    describe('[RED] setSalePaymentInTransaction()', () => {
      it('[RED] should write paymentMethod pix and installments 1 into the existing Sale', async () => {
        const saleId = `sale-pay-pix-${Date.now()}`;
        await seedOrderSale(saleId, 100, `prod-pay-pix-${Date.now()}`);

        await runTransaction(setup.firestore, async (tx) => {
          service.setSalePaymentInTransaction(tx, saleId, { paymentMethod: PaymentMethod.PIX, installments: 1 });
        });

        const data: any = (await getDoc(doc(setup.firestore, `sales/${saleId}`))).data();
        expect(data.paymentMethod).toBe('pix');
        expect(data.installments).toBe(1);
        expect(data.status).toBe('completed');
        expect(data.total).toBe(100);
      });

      it('[RED] should write paymentMethod misto and installments 1 into the existing Sale', async () => {
        const saleId = `sale-pay-misto-${Date.now()}`;
        await seedOrderSale(saleId, 100, `prod-pay-misto-${Date.now()}`);

        await runTransaction(setup.firestore, async (tx) => {
          service.setSalePaymentInTransaction(tx, saleId, { paymentMethod: PaymentMethod.MISTO, installments: 1 });
        });

        const data: any = (await getDoc(doc(setup.firestore, `sales/${saleId}`))).data();
        expect(data.paymentMethod).toBe('misto');
        expect(data.installments).toBe(1);
        expect(data.status).toBe('completed');
      });
    });

    describe('[RED] cancelSaleRecordInTransaction()', () => {
      it('[RED] should set only status canceled and keep the stock untouched (unlike cancelSale)', async () => {
        const productId = `prod-cancel-${Date.now()}`;
        const saleId = `sale-cancel-${Date.now()}`;
        await seedProduct(productId, 8);
        await seedOrderSale(saleId, 100, productId);

        await runTransaction(setup.firestore, async (tx) => {
          service.cancelSaleRecordInTransaction(tx, saleId);
        });

        const data: any = (await getDoc(doc(setup.firestore, `sales/${saleId}`))).data();
        expect(data.status).toBe('canceled');
        expect(data.total).toBe(100);
        expect(data.sale_type).toBe('order');
        expect(data.items.length).toBe(1);
        expect(await readStock(productId)).toBe(8);
      });
    });
  });
});
