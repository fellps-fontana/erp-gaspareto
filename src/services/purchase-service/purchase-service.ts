import { Injectable, inject, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, runTransaction, serverTimestamp, increment, onSnapshot, query, where
} from 'firebase/firestore';
import { Purchase } from '../../models/buy-model';
import { Observable } from 'rxjs';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private tenantService = inject(TenantService);

  constructor() { }

  /**
   * Helper para Observable em tempo real usando Native SDK e NgZone
   */
  private collectionDataObservable<T>(queryFn: any): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const unsubscribe = onSnapshot(queryFn,
        (snapshot: any) => {
          const data = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
          }));
          this.ngZone.run(() => observer.next(data));
        },
        (error: any) => {
          console.error("PurchaseService [onSnapshot] ERRO:", error);
          this.ngZone.run(() => observer.error(error));
        }
      );
      return () => unsubscribe();
    });
  }

  getPurchases(): Observable<Purchase[]> {
    const purchaseCol = collection(this.firestore, 'purchases');
    const q = query(purchaseCol, where('companyId', '==', this.tenantService.companyId()));
    return this.collectionDataObservable<Purchase>(q);
  }

  async addPurchase(purchase: Omit<Purchase, 'id' | 'companyId'>) {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível registrar compra sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const productDocRef = doc(this.firestore, `products/${purchase.idProduct}`);
        const productDoc = await transaction.get(productDocRef);

        if (!productDoc.exists()) {
          throw new Error(`Produto com o ID ${purchase.idProduct} não encontrado`);
        }

        // 1. Atualiza o estoque e o preço de custo no cadastro do produto
        transaction.update(productDocRef, {
          stock: increment(purchase.amount),
          buyPrice: purchase.unityValue
        });

        // 2. Registra o histórico da compra
        const purchaseCol = collection(this.firestore, 'purchases');
        const newPurchaseRef = doc(purchaseCol);

        transaction.set(newPurchaseRef, {
          ...purchase,
          companyId,
          date: serverTimestamp()
        });
      });
      return true;
    } catch (error) {
      console.error("Erro ao adicionar compra:", error);
      throw error;
    }
  }

  async deletePurchase(purchaseId: string) {
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const purchaseDocRef = doc(this.firestore, `purchases/${purchaseId}`);
        const purchaseDoc = await transaction.get(purchaseDocRef);

        if (!purchaseDoc.exists()) {
          throw new Error(`Compra com o ID ${purchaseId} não encontrada`);
        }

        const purchaseData = purchaseDoc.data() as Purchase;
        const productDocRef = doc(this.firestore, `products/${purchaseData.idProduct}`);
        const productDoc = await transaction.get(productDocRef);

        if (!productDoc.exists()) {
          throw new Error(`Produto não encontrado para estornar o estoque`);
        }

        const currentStock = productDoc.data()['stock'] || 0;

        if (currentStock < purchaseData.amount) {
          throw new Error('Estorno negado: O estoque atual é menor que a quantidade desta compra.');
        }

        transaction.update(productDocRef, {
          stock: increment(-purchaseData.amount)
        });

        transaction.delete(purchaseDocRef);
      });
      return true;
    } catch (error) {
      console.error("Erro ao deletar compra:", error);
      throw error;
    }
  }
}
