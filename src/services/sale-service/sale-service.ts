import { Injectable, inject, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, runTransaction, query, where, orderBy, serverTimestamp, increment, onSnapshot
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Sale } from '../../models/sell-model';

@Injectable({
  providedIn: 'root',
})
export class SaleService {
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private readonly COLLECTION_NAME = 'sales';

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
          console.error("SaleService [onSnapshot] ERRO:", error);
          this.ngZone.run(() => observer.error(error));
        }
      );
      return () => unsubscribe();
    });
  }

  getSales(): Observable<Sale[]> {
    const q = query(collection(this.firestore, this.COLLECTION_NAME));
    return this.collectionDataObservable<Sale>(q);
  }

  async processSale(sale: any, updateStock: boolean = true) {
    try {
      await runTransaction(this.firestore, async (transaction) => {

        const productSnapshots = [];

        if (updateStock) {
          for (const item of sale.items) {
            const productDocRef = doc(this.firestore, `products/${item.idProduct}`);
            const productDoc = await transaction.get(productDocRef);

            if (!productDoc.exists()) {
              throw new Error(`Produto ID: ${item.idProduct} não encontrado!`);
            }

            const currentStock = productDoc.data()['stock'] || 0;
            if (currentStock < item.quantity) {
              throw new Error(`Estoque insuficiente para: ${item.name || 'Produto'}`);
            }

            productSnapshots.push({
              ref: productDocRef,
              quantity: item.quantity
            });
          }
        }

        if (updateStock) {
          for (const p of productSnapshots) {
            transaction.update(p.ref, {
              stock: increment(-p.quantity)
            });
          }
        }

        const newSaleRef = doc(collection(this.firestore, this.COLLECTION_NAME));
        const saleData = {
          items: sale.items.map((i: any) => ({
            idProduct: i.idProduct,
            productName: i.productName || 'Produto sem nome',
            quantity: Number(i.quantity) || 1,
            priceAtSale: Number(i.priceAtSale) || 0,
            priceAtCost: Number(i.priceAtCost) || 0
          })),
          total: Number(sale.total || sale.value) || 0,
          date: serverTimestamp(),
          status: 'completed',
          sale_type: sale.sale_type || 'pdv'
        };

        transaction.set(newSaleRef, saleData);
      });

      console.log("Venda registrada com sucesso!");
    } catch (error) {
      console.error("Erro na transação: ", error);
      throw error;
    }
  }

  getSalesByDate(startDate: Date, endDate: Date): Observable<Sale[]> {
    const salesCollection = collection(this.firestore, this.COLLECTION_NAME);
    const salesQuery = query(
      salesCollection,
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );

    return this.collectionDataObservable<Sale>(salesQuery);
  }

  async cancelSale(saleId: string) {
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const saleDocRef = doc(this.firestore, `${this.COLLECTION_NAME}/${saleId}`);
        const saleDoc = await transaction.get(saleDocRef);

        if (!saleDoc.exists()) throw new Error('Venda não encontrada');

        const saleData = saleDoc.data() as Sale;

        for (const item of saleData.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          transaction.update(productRef, {
            stock: increment(item.quantity)
          });
        }

        transaction.update(saleDocRef, { status: 'canceled' });
      });
      return true;
    } catch (error) {
      console.error("Erro ao cancelar: ", error);
      throw error;
    }
  }
}
