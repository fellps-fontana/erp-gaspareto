import { TestBed } from '@angular/core/testing';
import { ComandaService } from './comanda-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Comanda, ComandaItem } from '../../models/comanda-model';
import { Product } from '../../models/product-model';
import { Firestore } from '@angular/fire/firestore';
import { setDoc, doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
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

  describe('FRENTE 2 — Regra critica: Produto por peso (soldByWeight) - linha unica por venda [CRITICA]', () => {
    let productId: string;

    beforeEach(async () => {
      // Criar um produto por peso com stock = 10 kg, sellPrice = 5 (5 por kg)
      // Usar UUID para garantir unicidade mesmo se Date.now() colidir
      productId = `product-by-weight-${crypto.randomUUID()}`;
      const weightProduct: Product = {
        companyId: setup.mockCompanyId as string,
        title: 'Product Sold by Weight',
        buyPrice: 2,
        sellPrice: 5, // 5 por kg
        stock: 10, // 10 kg
        soldByWeight: true
      };
      await setDoc(doc(setup.firestore, `products/${productId}`), weightProduct);
    });

    describe('[RED] addComanda() com produto por peso - peso fracionado no nucleo', () => {
      it('[RED] deve criar comanda com item peso 2.5 kg e decrementar stock para 7.5 kg', async () => {
        const uniqueName = `Weight Test Customer-${crypto.randomUUID()}`;
        const comandaData = {
          customerName: uniqueName,
          items: [
            {
              idProduct: productId,
              productName: 'Product Sold by Weight',
              quantity: 2.5, // 2.5 kg
              priceAtSale: 5, // 5 por kg
              priceAtCost: 2,
              soldByWeight: true
            }
          ],
          total: 12.5 // 5 * 2.5
        };

        await service.addComanda(comandaData as any);

        // Lookup da comanda criada - buscar via customerName + companyId (filtro de seguranca) direto do servidor
        const snap = await getDocs(query(
          collection(setup.firestore, 'comandas'),
          where('companyId', '==', setup.mockCompanyId),
          where('customerName', '==', uniqueName)
        ));
        expect(snap.docs.length).toBeGreaterThan(0, 'Comanda must be created');
        const newComanda = snap.docs[0].data() as Comanda;
        expect(newComanda.items[0].quantity).toBe(2.5, 'Item quantity must be 2.5 kg');

        // Verificar que stock foi decrementado para 7.5 kg (nao para 10 - 2 = 8)
        const productDoc = await getDoc(doc(setup.firestore, `products/${productId}`));
        const updatedProduct = productDoc.data() as Product;
        expect(updatedProduct.stock).toBe(7.5, 'Product stock must be 7.5 kg after decrement by 2.5 kg');
      });
    });

    describe('[RED] addToExistingComanda() com produto por peso - bloqueia adicao duplicada', () => {
      it('[RED] deve lançar erro ao tentar adicionar MESMO produto por peso novamente', async () => {
        const uniqueName = `Single Weight Item Customer-${crypto.randomUUID()}`;
        // Criar comanda inicial com o produto por peso
        const comandaData = {
          customerName: uniqueName,
          items: [
            {
              idProduct: productId,
              productName: 'Product Sold by Weight',
              quantity: 2.5, // 2.5 kg
              priceAtSale: 5,
              priceAtCost: 2,
              soldByWeight: true
            }
          ],
          total: 12.5
        };
        await service.addComanda(comandaData as any);

        // Pegar ID da comanda - buscar via customerName + companyId (filtro de seguranca) direto do servidor
        const snap = await getDocs(query(
          collection(setup.firestore, 'comandas'),
          where('companyId', '==', setup.mockCompanyId),
          where('customerName', '==', uniqueName)
        ));
        if (snap.docs.length === 0) {
          fail('Could not find created comanda');
        }
        const comandaId = snap.docs[0].id;

        // Tentar adicionar o MESMO produto por peso novamente
        const itemsToAdd = [
          {
            idProduct: productId,
            productName: 'Product Sold by Weight',
            quantity: 1.5, // tentando adicionar 1.5 kg mais
            priceAtSale: 5,
            priceAtCost: 2,
            soldByWeight: true
          }
        ];

        try {
          await service.addToExistingComanda(comandaId, itemsToAdd, 7.5); // 5 * 1.5 = 7.5
          fail('Expected addToExistingComanda to throw error when adding duplicate peso product');
        } catch (error: any) {
          expect(error.message).toBeDefined('Error should be thrown');
          // Error pode mencionar "linha unica", "ja existe", "peso", ou similiar
          expect(error.message.toLowerCase()).toMatch(/peso|linha|duplicad|existe|unica/i);
        }

        // Verificar que comanda nao mudou (items e stock intactos) - ler direto do servidor
        const comandaAfterDoc = await getDoc(doc(setup.firestore, `comandas/${comandaId}`));
        const comandaAfter = comandaAfterDoc.data() as Comanda;
        expect(comandaAfter.items.length).toBe(1, 'Comanda must still have 1 item');
        expect(comandaAfter.items[0].quantity).toBe(2.5, 'Item quantity must still be 2.5 kg');

        // Verificar que stock da comanda nao mudou
        const productDocAfter = await getDoc(doc(setup.firestore, `products/${productId}`));
        const updatedProductAfter = productDocAfter.data() as Product;
        expect(updatedProductAfter.stock).toBe(7.5, 'Product stock must remain 7.5 kg');
      });
    });

    describe('[RED] addToExistingComanda() - permite adicionar outro produto por peso se ausente', () => {
      it('[RED] deve permitir adicionar OUTRO produto por peso na mesma comanda', async () => {
        const uniqueName = `Multi Weight Customer-${crypto.randomUUID()}`;
        // Criar segundo produto por peso
        // Usar UUID para garantir unicidade mesmo se Date.now() colidir
        const productId2 = `product-by-weight-2-${crypto.randomUUID()}`;
        const weightProduct2: Product = {
          companyId: setup.mockCompanyId as string,
          title: 'Second Weight Product',
          buyPrice: 1,
          sellPrice: 2, // 2 por kg
          stock: 20, // 20 kg
          soldByWeight: true
        };
        await setDoc(doc(setup.firestore, `products/${productId2}`), weightProduct2);

        // Criar comanda com primeiro produto por peso
        const comandaData = {
          customerName: uniqueName,
          items: [
            {
              idProduct: productId,
              productName: 'Product Sold by Weight',
              quantity: 2, // 2 kg
              priceAtSale: 5,
              priceAtCost: 2,
              soldByWeight: true
            }
          ],
          total: 10 // 5 * 2
        };
        await service.addComanda(comandaData as any);

        // Pegar ID da comanda - buscar via customerName + companyId (filtro de seguranca) direto do servidor
        const snap = await getDocs(query(
          collection(setup.firestore, 'comandas'),
          where('companyId', '==', setup.mockCompanyId),
          where('customerName', '==', uniqueName)
        ));
        if (snap.docs.length === 0) {
          fail('Could not find created comanda');
        }
        const comandaId2 = snap.docs[0].id;

        // Adicionar OUTRO produto por peso (ausente da comanda)
        const itemsToAdd = [
          {
            idProduct: productId2,
            productName: 'Second Weight Product',
            quantity: 3, // 3 kg
            priceAtSale: 2,
            priceAtCost: 1,
            soldByWeight: true
          }
        ];

        // Deve permitir (nao lançar erro)
        await service.addToExistingComanda(comandaId2, itemsToAdd, 6); // 2 * 3 = 6
        // Sem "fail()" aqui significa que o teste passou se nao lancou erro

        // Verificar que comanda agora tem 2 linhas de produtos - ler direto do servidor
        const comandaAfterDoc = await getDoc(doc(setup.firestore, `comandas/${comandaId2}`));
        const comandaAfter = comandaAfterDoc.data() as Comanda;
        expect(comandaAfter.items.length).toBe(2, 'Comanda must have 2 items (one per weight product)');

        // Verificar que segunda linha foi adicionada (nao somada)
        const item2 = comandaAfter.items.find((i: ComandaItem) => i.idProduct === productId2);
        expect(item2).toBeDefined('Second product must be in items');
        expect(item2?.quantity).toBe(3, 'Second product quantity must be 3 kg');

        // Verificar que stock de ambos produtos foi decrementado corretamente
        const prod1Doc = await getDoc(doc(setup.firestore, `products/${productId}`));
        const prod2Doc = await getDoc(doc(setup.firestore, `products/${productId2}`));
        const updatedProd1 = prod1Doc.data() as Product;
        const updatedProd2 = prod2Doc.data() as Product;
        expect(updatedProd1.stock).toBe(8, 'First product stock must be 8 kg (10 - 2)');
        expect(updatedProd2.stock).toBe(17, 'Second product stock must be 17 kg (20 - 3)');
      });
    });
  });
});
