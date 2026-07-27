import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({ providedIn: 'root' })
export class PurchaseProductService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COL = 'purchaseProducts';

  getPurchaseProducts(): Observable<PurchaseProduct[]> {
    const q = query(
      collection(this.firestore, this.COL),
      where('companyId', '==', this.tenantService.companyId()),
      orderBy('createdAt', 'desc')
    );
    return this.collectionDataObservable<PurchaseProduct>(q);
  }

  async addPurchaseProduct(
    product: Omit<PurchaseProduct, 'id' | 'createdAt' | 'companyId'>
  ): Promise<string> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível adicionar produto de compra sem uma empresa ' +
        '(companyId) associada à sessão atual.'
      );
    }
    const ref = await addDoc(collection(this.firestore, this.COL), {
      ...product,
      companyId,
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
