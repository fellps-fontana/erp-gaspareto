import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, runTransaction, query, where, orderBy, serverTimestamp, increment
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Sale } from '../../models/sell-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root',
})
export class SaleService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COLLECTION_NAME = 'sales';

  getSales(): Observable<Sale[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION_NAME),
      where('companyId', '==', this.tenantService.companyId())
    );
    return this.collectionDataObservable<Sale>(q);
  }

  async processSale(sale: Omit<Sale, 'id' | 'companyId'>, updateStock: boolean = true): Promise<void> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível processar venda sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const productSnapshots: { ref: any; quantity: number }[] = [];

        if (updateStock) {
          for (const item of sale.items) {
            const productDocRef = doc(this.firestore, `products/${item.idProduct}`);
            const productDoc = await transaction.get(productDocRef);

            if (!productDoc.exists()) {
              throw new Error(`Produto ID: ${item.idProduct} não encontrado!`);
            }

            const currentStock = productDoc.data()['stock'] || 0;
            if (currentStock < item.quantity) {
              throw new Error(
                `⚠️ Estoque insuficiente para "${item.productName}": ` +
                `disponível ${currentStock}, solicitado ${item.quantity}.`
              );
            }

            productSnapshots.push({ ref: productDocRef, quantity: item.quantity });
          }

          for (const p of productSnapshots) {
            transaction.update(p.ref, { stock: increment(-p.quantity) });
          }
        }

        const newSaleRef = doc(collection(this.firestore, this.COLLECTION_NAME));
        const saleDoc: any = {
          companyId,
          items: sale.items.map(i => ({
            idProduct: i.idProduct,
            productName: i.productName,
            quantity: Number(i.quantity),
            priceAtSale: Number(i.priceAtSale),
            priceAtCost: Number(i.priceAtCost)
          })),
          total: Number(sale.total) || 0,
          date: serverTimestamp(),
          status: 'completed',
          sale_type: sale.sale_type,
          paymentMethod: sale.paymentMethod
        };
        if (sale.customerId) saleDoc['customerId'] = sale.customerId;
        transaction.set(newSaleRef, saleDoc);
      });
    } catch (error) {
      console.error('SaleService: Erro na transação:', error);
      throw error;
    }
  }

  getSalesByDate(startDate: Date, endDate: Date): Observable<Sale[]> {
    const salesCollection = collection(this.firestore, this.COLLECTION_NAME);
    const salesQuery = query(
      salesCollection,
      where('companyId', '==', this.tenantService.companyId()),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );
    return this.collectionDataObservable<Sale>(salesQuery);
  }

  async cancelSale(saleId: string): Promise<boolean> {
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const saleDocRef = doc(this.firestore, `${this.COLLECTION_NAME}/${saleId}`);
        const saleDoc = await transaction.get(saleDocRef);

        if (!saleDoc.exists()) throw new Error('Venda não encontrada');

        const saleData = saleDoc.data() as Sale;

        for (const item of saleData.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          transaction.update(productRef, { stock: increment(item.quantity) });
        }

        transaction.update(saleDocRef, { status: 'canceled' });
      });
      return true;
    } catch (error) {
      console.error('SaleService: Erro ao cancelar venda:', error);
      throw error;
    }
  }
}
