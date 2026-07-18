import { Injectable } from '@angular/core';
import { Purchase } from '../models/buy-model';
import { Observable } from 'rxjs';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { PURCHASES_SEED } from './data/purchases.seed';
import { PurchaseService } from '../services/purchase-service/purchase-service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PurchaseServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.purchases.getAll().length === 0) {
      this.mockDb.purchases.replaceAll(PURCHASES_SEED);
    }
  }

  getPurchases(): Observable<Purchase[]> {
    return this.mockDb.purchases.asObservable();
  }

  async addPurchase(purchase: Purchase): Promise<boolean> {
    const product = this.mockDb.products.findById(purchase.idProduct);
    if (!product) {
      throw new Error(`Produto com o ID ${purchase.idProduct} não encontrado`);
    }

    const newId = generateMockId('purch');
    const newPurchase: Purchase = {
      ...purchase,
      id: newId,
      date: Timestamp.now()
    };

    this.mockDb.purchases.add(newPurchase);

    this.mockDb.products.patch(purchase.idProduct, {
      stock: product.stock + purchase.amount,
      buyPrice: purchase.unityValue
    });

    return true;
  }

  async deletePurchase(purchaseId: string): Promise<boolean> {
    const purchase = this.mockDb.purchases.findById(purchaseId);
    if (!purchase) {
      throw new Error(`Compra com o ID ${purchaseId} não encontrada`);
    }

    const product = this.mockDb.products.findById(purchase.idProduct);
    if (!product) {
      throw new Error(`Produto não encontrado para estornar o estoque`);
    }

    if (product.stock < purchase.amount) {
      throw new Error('Estorno negado: O estoque atual é menor que a quantidade desta compra.');
    }

    this.mockDb.products.patch(purchase.idProduct, {
      stock: product.stock - purchase.amount
    });

    this.mockDb.purchases.remove(purchaseId);
    return true;
  }
}
