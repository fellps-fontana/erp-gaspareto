import { Injectable } from '@angular/core';
import { Comanda } from '../models/comanda-model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { COMANDAS_SEED } from './data/comandas.seed';
import { ComandaService } from '../services/comanda-service/comanda-service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class ComandaServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.comandas.getAll().length === 0) {
      this.mockDb.comandas.replaceAll(COMANDAS_SEED);
    }
  }

  getOpenComandas(): Observable<Comanda[]> {
    return this.mockDb.comandas.asObservable().pipe(
      map(comandas =>
        [...comandas]
          .filter(c => c.status === 'open')
          .sort((a, b) => {
            const dateA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
            const dateB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
            return dateB - dateA;
          })
      )
    );
  }

  async addComanda(comanda: Omit<Comanda, 'id' | 'createdAt' | 'status'>): Promise<void> {
    for (const item of comanda.items) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (!product) {
        throw new Error(`Produto não encontrado: ${item.idProduct}`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para ${item.productName}`);
      }
    }

    for (const item of comanda.items) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (product) {
        this.mockDb.products.patch(item.idProduct, {
          stock: product.stock - item.quantity
        });
      }
    }

    const newComanda: Comanda = {
      id: generateMockId('cmd'),
      ...comanda,
      status: 'open',
      createdAt: Timestamp.now()
    };

    this.mockDb.comandas.add(newComanda);
  }

  async addToExistingComanda(comandaId: string, itemsToAdd: any[], totalToAdd: number): Promise<void> {
    const comanda = this.mockDb.comandas.findById(comandaId);
    if (!comanda) throw new Error('Comanda não encontrada');

    for (const item of itemsToAdd) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (!product) {
        throw new Error(`Produto não encontrado: ${item.idProduct}`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para ${item.productName}`);
      }
    }

    for (const item of itemsToAdd) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (product) {
        this.mockDb.products.patch(item.idProduct, {
          stock: product.stock - item.quantity
        });
      }
    }

    const updatedItems = [...comanda.items];
    itemsToAdd.forEach(newItem => {
      const existing = updatedItems.find(i => i.idProduct === newItem.idProduct);
      if (existing) {
        existing.quantity += newItem.quantity;
      } else {
        updatedItems.push(newItem);
      }
    });

    this.mockDb.comandas.patch(comandaId, {
      items: updatedItems,
      total: comanda.total + totalToAdd
    });
  }

  async deleteComanda(comandaId: string): Promise<void> {
    const comanda = this.mockDb.comandas.findById(comandaId);
    if (!comanda) throw new Error('Comanda não encontrada');

    for (const item of comanda.items ?? []) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (product) {
        this.mockDb.products.patch(item.idProduct, {
          stock: product.stock + item.quantity
        });
      }
    }

    this.mockDb.comandas.remove(comandaId);
  }

  updateComanda(id: string, data: Partial<Comanda>): Promise<void> {
    this.mockDb.comandas.patch(id, data);
    return Promise.resolve();
  }

  closeComanda(id: string): Promise<void> {
    this.mockDb.comandas.patch(id, { status: 'closed' });
    return Promise.resolve();
  }
}
