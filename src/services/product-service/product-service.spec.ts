import { TestBed } from '@angular/core/testing';
import { ProductService } from './product-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Product } from '../../models/product-model';
import { Firestore } from '@angular/fire/firestore';
import { getDoc, doc, setDoc } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup } from '../test-helpers';
import { firstValueFrom } from 'rxjs';

describe('ProductService - Multi-tenant (companyId isolation)', () => {
  let service: ProductService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();

    TestBed.configureTestingModule({
      providers: [
        ProductService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });

    service = TestBed.inject(ProductService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: Isolamento de tenant por companyId (CRÍTICA)', () => {
    describe('[RED] getProducts() - Leitura', () => {
      it('[RED] should filter by companyId - own products appear, foreign products do not', async () => {
        // EXPECTED TO FAIL (RED): getProducts() does not filter by companyId
        // Seed: own company's product
        const ownProduct: Product = {
          companyId: setup.mockCompanyId,
          title: 'Own Product',
          buyPrice: 10,
          sellPrice: 20,
          stock: 100
        };
        await setDoc(doc(setup.firestore, `products/own-product-${Date.now()}`), ownProduct);

        // Seed: foreign company's product (should NOT appear)
        const foreignProduct: Product = {
          companyId: 'foreign-company-xyz',
          title: 'Foreign Product',
          buyPrice: 15,
          sellPrice: 30,
          stock: 50
        };
        await setDoc(doc(setup.firestore, `products/foreign-product-${Date.now()}`), foreignProduct);

        // Call service
        const products = await firstValueFrom(service.getProducts());

        // ASSERTION (RED fails): own product must appear
        const ownAppears = products.some(
          (p: any) => p.companyId === setup.mockCompanyId && p.title === 'Own Product'
        );
        expect(ownAppears).toBeTruthy(
          'Own company product must appear in getProducts() result'
        );

        // ASSERTION (RED fails): foreign product must NOT appear
        const foreignAppears = products.some(
          (p: any) => p.companyId === 'foreign-company-xyz'
        );
        expect(foreignAppears).toBeFalsy(
          'Foreign company product must NOT appear in getProducts() result - this proves isolation'
        );
      });
    });

    describe('[RED] addProduct() - Escrita', () => {
      it('[RED] should auto-inject companyId when adding product', async () => {
        const newProduct: Omit<Product, 'id' | 'companyId'> = {
          title: `Product-${Date.now()}`,
          buyPrice: 15,
          sellPrice: 30,
          stock: 75
        };

        const result = await service.addProduct(newProduct as any);
        const savedDocId = result.id;

        expect(savedDocId).toBeTruthy('Product should have been saved');
        const savedDoc = await getDoc(doc(setup.firestore, `products/${savedDocId}`));
        const savedData = savedDoc.data() as Product;
        expect(savedData?.companyId).toBe(setup.mockCompanyId,
          'companyId must be auto-injected from TenantService'
        );
      });

      it('[RED] should persist product with company isolation', async () => {
        const productData: Omit<Product, 'id' | 'companyId'> = {
          title: `IsolatedProduct-${Date.now()}`,
          buyPrice: 20,
          sellPrice: 40,
          stock: 50
        };

        const result = await service.addProduct(productData as any);
        const docId = result.id;

        expect(docId).toBeTruthy('Product should be saved');
        const docSnap = await getDoc(doc(setup.firestore, `products/${docId}`));
        const persistedData = docSnap.data() as Product;
        expect(persistedData?.companyId).toBe(setup.mockCompanyId,
          'Product must be saved with companyId from TenantService'
        );
      });
    });
  });
});
