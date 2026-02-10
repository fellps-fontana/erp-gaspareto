import { Injectable } from '@angular/core';
import { 
  Firestore, collection, doc, runTransaction, 
  serverTimestamp, increment, collectionData 
} from '@angular/fire/firestore';
import { Purchase } from '../../models/buy-model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  constructor(private firestore: Firestore) {}

  // Adicionei o GET para você listar suas compras
  getPurchases(): Observable<Purchase[]> {
    const purchaseCol = collection(this.firestore, 'purchases');
    return collectionData(purchaseCol, { idField: 'id' }) as Observable<Purchase[]>;
  }

  async addPurchase(purchase: Purchase) {
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const productDocRef = doc(this.firestore, `products/${purchase.idProduct}`);
        const productDoc = await transaction.get(productDocRef);

        if (!productDoc.exists()) {
          throw new Error(`Produto com o ID ${purchase.idProduct} não encontrado`);
        }

        // 1. Atualiza o estoque e o preço de custo no cadastro do produto
        transaction.update(productDocRef, {
          stock: increment(purchase.amount), // Mais seguro que fazer a soma manualmente
          buyPrice: purchase.unityValue     // Atualiza o preço de compra para o último pago
        });

        // 2. Registra o histórico da compra
        const purchaseCol = collection(this.firestore, 'purchases');
        const newPurchaseRef = doc(purchaseCol);
        
        // Removemos o ID do objeto para o Firebase não salvar um campo 'id' duplicado
        const { id, ...dataToSave } = purchase;

        transaction.set(newPurchaseRef, {
          ...dataToSave,
          date: serverTimestamp() // Usa a hora oficial do Firebase
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

        // Validação crucial: não deixa o estoque ficar negativo se deletar a compra
        if (currentStock < purchaseData.amount) {
          throw new Error('Estorno negado: O estoque atual é menor que a quantidade desta compra.');
        }

        // Estorna o estoque
        transaction.update(productDocRef, {
          stock: increment(-purchaseData.amount)
        });

        // Deleta o registro da compra
        transaction.delete(purchaseDocRef);
      });
      return true;
    } catch (error) {
      console.error("Erro ao deletar compra:", error);
      throw error;
    }
  }
}