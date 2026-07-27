import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, updateDoc, query, where,
  serverTimestamp, runTransaction, increment, Transaction
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Comanda } from '../../models/comanda-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root'
})
export class ComandaService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COLLECTION_NAME = 'comandas';

  getOpenComandas(): Observable<Comanda[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION_NAME),
      where('status', '==', 'open'),
      where('companyId', '==', this.tenantService.companyId())
    );

    return this.collectionDataObservable<Comanda>(q).pipe(
      map(comandas => [...comandas].sort((a, b) => {
        const dateA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const dateB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return dateB - dateA;
      }))
    );
  }

  async addComanda(comanda: Omit<Comanda, 'id' | 'createdAt' | 'status' | 'companyId'>): Promise<void> {
    try {
      await runTransaction(this.firestore, async (transaction: Transaction) => {
        const productsToUpdate: { ref: any; quantity: number }[] = [];

        for (const item of comanda.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          const productSnap = await transaction.get(productRef);

          if (!productSnap.exists()) throw new Error(`Produto não encontrado: ${item.idProduct}`);

          const currentStock = productSnap.data()['stock'] || 0;
          if (currentStock < item.quantity) {
            throw new Error(`Estoque insuficiente para ${item.productName}`);
          }

          productsToUpdate.push({ ref: productRef, quantity: item.quantity });
        }

        for (const p of productsToUpdate) {
          transaction.update(p.ref, { stock: increment(-p.quantity) });
        }

        const newComandaRef = doc(collection(this.firestore, this.COLLECTION_NAME));
        transaction.set(newComandaRef, {
          ...comanda,
          status: 'open',
          createdAt: serverTimestamp(),
          companyId: this.tenantService.companyId()
        });
      });
    } catch (error) {
      console.error('ComandaService: Erro ao adicionar comanda:', error);
      throw error;
    }
  }

  async addToExistingComanda(comandaId: string, itemsToAdd: any[], totalToAdd: number): Promise<void> {
    try {
      await runTransaction(this.firestore, async (transaction: Transaction) => {
        const comandaRef = doc(this.firestore, `${this.COLLECTION_NAME}/${comandaId}`);
        const comandaSnap = await transaction.get(comandaRef);
        if (!comandaSnap.exists()) throw new Error('Comanda não encontrada');

        const currentComanda = comandaSnap.data() as Comanda;
        const productsToUpdate: { ref: any; quantity: number }[] = [];

        for (const item of itemsToAdd) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          const productSnap = await transaction.get(productRef);
          if (!productSnap.exists()) throw new Error(`Produto não encontrado: ${item.idProduct}`);
          const currentStock = productSnap.data()['stock'] || 0;
          if (currentStock < item.quantity) throw new Error(`Estoque insuficiente para ${item.productName}`);

          productsToUpdate.push({ ref: productRef, quantity: item.quantity });
        }

        for (const p of productsToUpdate) {
          transaction.update(p.ref, { stock: increment(-p.quantity) });
        }

        const updatedItems = [...currentComanda.items];
        itemsToAdd.forEach(newItem => {
          const existing = updatedItems.find(i => i.idProduct === newItem.idProduct);
          if (existing) {
            existing.quantity += newItem.quantity;
          } else {
            updatedItems.push(newItem);
          }
        });

        transaction.update(comandaRef, {
          items: updatedItems,
          total: currentComanda.total + totalToAdd
        });
      });
    } catch (error) {
      console.error('ComandaService: Erro ao adicionar à comanda:', error);
      throw error;
    }
  }

  async deleteComanda(comandaId: string): Promise<void> {
    try {
      await runTransaction(this.firestore, async (transaction: Transaction) => {
        const comandaRef = doc(this.firestore, `${this.COLLECTION_NAME}/${comandaId}`);
        const comandaSnap = await transaction.get(comandaRef);

        if (!comandaSnap.exists()) throw new Error('Comanda não encontrada');

        const comanda = comandaSnap.data() as Comanda;

        for (const item of comanda.items ?? []) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          transaction.update(productRef, { stock: increment(item.quantity) });
        }

        transaction.delete(comandaRef);
      });
    } catch (error) {
      console.error('ComandaService: Erro ao excluir comanda:', error);
      throw error;
    }
  }

  updateComanda(id: string, data: Partial<Comanda>): Promise<void> {
    const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
    return updateDoc(comandaDoc, data);
  }

  closeComanda(id: string): Promise<void> {
    const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
    return updateDoc(comandaDoc, { status: 'closed', closedAt: serverTimestamp() });
  }
}
