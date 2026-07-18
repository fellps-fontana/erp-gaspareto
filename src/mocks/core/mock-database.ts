import { Injectable } from '@angular/core';
import { InMemoryCollection } from './in-memory-collection';
import { Product } from '../../models/product-model';
import { Sale } from '../../models/sell-model';
import { Comanda } from '../../models/comanda-model';
import { Order } from '../../models/order-model';
import { Bill } from '../../models/bill-model';
import { Customer } from '../../models/customer-model';
import { Purchase } from '../../models/buy-model';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { CompanyConfig } from '../../models/company-config';

@Injectable({ providedIn: 'root' })
export class MockDatabase {
  private static instance: MockDatabase;

  products = new InMemoryCollection<Product>();
  sales = new InMemoryCollection<Sale>();
  comandas = new InMemoryCollection<Comanda>();
  orders = new InMemoryCollection<Order>();
  bills = new InMemoryCollection<Bill>();
  customers = new InMemoryCollection<Customer>();
  purchases = new InMemoryCollection<Purchase>();
  purchaseProducts = new InMemoryCollection<PurchaseProduct>();
  companyConfig = new InMemoryCollection<CompanyConfig>();

  private constructor() {}

  static getInstance(): MockDatabase {
    if (!MockDatabase.instance) {
      MockDatabase.instance = new MockDatabase();
    }
    return MockDatabase.instance;
  }

  reset(): void {
    this.products.clear();
    this.sales.clear();
    this.comandas.clear();
    this.orders.clear();
    this.bills.clear();
    this.customers.clear();
    this.purchases.clear();
    this.purchaseProducts.clear();
    this.companyConfig.clear();
  }
}
