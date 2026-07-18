import { Injectable, inject } from '@angular/core';
import { Sale } from '../models/sell-model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { SALES_SEED } from './data/sales.seed';
import { SaleService } from '../services/sale-service/sale-service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class SaleServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.sales.getAll().length === 0) {
      this.mockDb.sales.replaceAll(SALES_SEED);
    }
  }

  getSales(): Observable<Sale[]> {
    return this.mockDb.sales.asObservable();
  }

  async processSale(sale: Sale, updateStock: boolean = true): Promise<void> {
    if (updateStock) {
      for (const item of sale.items) {
        const product = this.mockDb.products.findById(item.idProduct);
        if (!product) {
          throw new Error(`Produto ID: ${item.idProduct} não encontrado!`);
        }
        if (product.stock < item.quantity) {
          throw new Error(
            `⚠️ Estoque insuficiente para "${item.productName}": ` +
            `disponível ${product.stock}, solicitado ${item.quantity}.`
          );
        }
      }

      for (const item of sale.items) {
        const product = this.mockDb.products.findById(item.idProduct);
        if (product) {
          this.mockDb.products.patch(item.idProduct, {
            stock: product.stock - item.quantity
          });
        }
      }
    }

    const newSale: Sale & { status: string } = {
      id: generateMockId('sale'),
      items: sale.items.map(i => ({
        idProduct: i.idProduct,
        productName: i.productName,
        quantity: Number(i.quantity),
        priceAtSale: Number(i.priceAtSale),
        priceAtCost: Number(i.priceAtCost)
      })),
      total: Number(sale.total) || 0,
      date: Timestamp.now(),
      status: 'completed',
      sale_type: sale.sale_type,
      paymentMethod: sale.paymentMethod
    };
    if (sale.customerId) newSale.customerId = sale.customerId;

    this.mockDb.sales.add(newSale as any);
  }

  getSalesByDate(startDate: Date, endDate: Date): Observable<Sale[]> {
    return this.mockDb.sales.asObservable().pipe(
      map(sales =>
        sales
          .filter(sale => {
            const saleTime = (sale.date as any)?.toMillis?.() || (sale.date as any)?.seconds * 1000 || 0;
            const startTime = startDate.getTime();
            const endTime = endDate.getTime();
            return saleTime >= startTime && saleTime <= endTime;
          })
          .sort((a, b) => {
            const dateA = (a.date as any)?.toMillis?.() || (a.date as any)?.seconds * 1000 || 0;
            const dateB = (b.date as any)?.toMillis?.() || (b.date as any)?.seconds * 1000 || 0;
            return dateB - dateA;
          })
      )
    );
  }

  async cancelSale(saleId: string): Promise<boolean> {
    const sale = this.mockDb.sales.findById(saleId);
    if (!sale) throw new Error('Venda não encontrada');

    for (const item of sale.items) {
      const product = this.mockDb.products.findById(item.idProduct);
      if (product) {
        this.mockDb.products.patch(item.idProduct, {
          stock: product.stock + item.quantity
        });
      }
    }

    this.mockDb.sales.patch(saleId, { status: 'canceled' } as any);
    return true;
  }
}
