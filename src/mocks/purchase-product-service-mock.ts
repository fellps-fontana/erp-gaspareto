import { Injectable } from '@angular/core';
import { PurchaseProduct } from '../models/purchase-product-model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { PURCHASE_PRODUCTS_SEED } from './data/purchase-products.seed';
import { PurchaseProductService } from '../services/purchase-product-service/purchase-product-service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PurchaseProductServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.purchaseProducts.getAll().length === 0) {
      this.mockDb.purchaseProducts.replaceAll(PURCHASE_PRODUCTS_SEED);
    }
  }

  getPurchaseProducts(): Observable<PurchaseProduct[]> {
    return this.mockDb.purchaseProducts.asObservable().pipe(
      map(products =>
        [...products].sort((a, b) => {
          const dateA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
          const dateB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
          return dateB - dateA;
        })
      )
    );
  }

  async addPurchaseProduct(product: Omit<PurchaseProduct, 'id' | 'createdAt'>): Promise<string> {
    const newId = generateMockId('pp');
    const newProduct: PurchaseProduct = {
      id: newId,
      ...product,
      createdAt: Timestamp.now()
    };
    this.mockDb.purchaseProducts.add(newProduct);
    return newId;
  }

  async updatePurchaseProduct(id: string, data: Partial<Omit<PurchaseProduct, 'id' | 'createdAt'>>): Promise<void> {
    this.mockDb.purchaseProducts.patch(id, data);
  }

  async deletePurchaseProduct(id: string): Promise<void> {
    this.mockDb.purchaseProducts.remove(id);
  }
}
