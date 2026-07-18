import { Injectable, inject } from '@angular/core';
import { Product } from '../models/product-model';
import { Observable } from 'rxjs';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { PRODUCTS_SEED } from './data/products.seed';
import { ProductService } from '../services/product-service/product-service';

@Injectable({ providedIn: 'root' })
export class ProductServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.products.getAll().length === 0) {
      this.mockDb.products.replaceAll(PRODUCTS_SEED);
    }
  }

  getProducts(): Observable<Product[]> {
    return this.mockDb.products.asObservable();
  }

  addProduct(product: Product): Promise<any> {
    const newId = generateMockId('prod');
    const newProduct = {
      ...product,
      id: newId
    };
    this.mockDb.products.add(newProduct);
    return Promise.resolve({ id: newId });
  }

  deleteProduct(id: string): Promise<void> {
    this.mockDb.products.remove(id);
    return Promise.resolve();
  }

  updateProduct(id: string, product: Partial<Omit<Product, 'id'>>): Promise<void> {
    this.mockDb.products.patch(id, product);
    return Promise.resolve();
  }

  decreaseStock(id: string, quantity: number): Promise<void> {
    const product = this.mockDb.products.findById(id);
    if (product) {
      this.mockDb.products.patch(id, { stock: product.stock - quantity });
    }
    return Promise.resolve();
  }

  increaseStock(id: string, quantity: number): Promise<void> {
    const product = this.mockDb.products.findById(id);
    if (product) {
      this.mockDb.products.patch(id, { stock: product.stock + quantity });
    }
    return Promise.resolve();
  }
}
