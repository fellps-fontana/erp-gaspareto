import { Injectable } from '@angular/core';
import { 
  Firestore, collection, collectionData, doc, 
  runTransaction, query, where, orderBy, serverTimestamp, increment 
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Sale } from '../../models/sell-model';

@Injectable({
  providedIn: 'root',
})
export class SaleService {
  private salesCollection;

  constructor(private firestore: Firestore) {
    this.salesCollection = collection(this.firestore, 'sales');
  }

  getSales(): Observable<Sale[]> {
    return collectionData(this.salesCollection, { idField: 'id' }) as Observable<Sale[]>;
  }

  async processSale(sale: any) {
  try {
    await runTransaction(this.firestore, async (transaction) => {
      
      // --- PASSO 1: TODAS AS LEITURAS (READS) ---
      // Primeiro, buscamos as referências e os dados de todos os produtos do carrinho
      const productSnapshots = [];
      
      for (const item of sale.items) {
        const productDocRef = doc(this.firestore, `products/${item.idProduct}`);
        const productDoc = await transaction.get(productDocRef); // Leitura

        if (!productDoc.exists()) {
          throw new Error(`Produto ID: ${item.idProduct} não encontrado!`);
        }

        const currentStock = productDoc.data()['stock'] || 0;
        if (currentStock < item.quantity) {
          throw new Error(`Estoque insuficiente para: ${item.name || 'Produto'}`);
        }

        // Guardamos o snapshot e a referência para usar no passo de escrita
        productSnapshots.push({
          ref: productDocRef,
          quantity: item.quantity
        });
      }

      // --- PASSO 2: TODAS AS ESCRITAS (WRITES) ---
      // Agora que terminamos todos os 'await transaction.get', podemos fazer os updates
      
      // 2.1 Atualizar estoques
      for (const p of productSnapshots) {
        transaction.update(p.ref, {
          stock: increment(-p.quantity)
        });
      }

      // 2.2 Registrar a Venda
      const newSaleRef = doc(collection(this.firestore, 'sales'));
      const saleData = {
        items: sale.items.map((i: any) => ({
          idProduct: i.idProduct,
          productName: i.productName|| 'Produto sem nome', // Garante que pegue o nome certo
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
    const salesQuery = query(
      this.salesCollection,
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );

    return collectionData(salesQuery, { idField: 'id' }) as Observable<Sale[]>;
  }

  async cancelSale(saleId: string) {
    try {
      await runTransaction(this.firestore, async (transaction) => {
        const saleDocRef = doc(this.firestore, `sales/${saleId}`);
        const saleDoc = await transaction.get(saleDocRef);

        if (!saleDoc.exists()) throw new Error('Venda não encontrada');
        
        const saleData = saleDoc.data() as Sale;

        for (const item of saleData.items) {
          const productRef = doc(this.firestore, `products/${item.idProduct}`);
          // Devolve o estoque usando increment positivo
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