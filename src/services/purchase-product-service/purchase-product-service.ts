import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({ providedIn: 'root' })
export class PurchaseProductService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private readonly COL = 'purchaseProducts';

  getPurchaseProducts(): Observable<PurchaseProduct[]> {
    const q = query(collection(this.firestore, this.COL), orderBy('createdAt', 'desc'));
    return this.collectionDataObservable<PurchaseProduct>(q);
  }

  async addPurchaseProduct(product: Omit<PurchaseProduct, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, this.COL), {
      ...product,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async updatePurchaseProduct(id: string, data: Partial<Omit<PurchaseProduct, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(this.firestore, `${this.COL}/${id}`), data as any);
  }

  async deletePurchaseProduct(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.COL}/${id}`));
  }
}
