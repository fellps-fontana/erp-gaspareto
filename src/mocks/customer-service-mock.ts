import { Injectable } from '@angular/core';
import { Customer } from '../models/customer-model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { CUSTOMERS_SEED } from './data/customers.seed';
import { CustomerService } from '../services/customer-service/customer-service';

@Injectable({ providedIn: 'root' })
export class CustomerServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.customers.getAll().length === 0) {
      this.mockDb.customers.replaceAll(CUSTOMERS_SEED);
    }
  }

  getCustomers(): Observable<Customer[]> {
    return this.mockDb.customers.asObservable().pipe(
      map(customers =>
        [...customers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      )
    );
  }

  addCustomer(customer: Omit<Customer, 'id'>): Promise<any> {
    const newId = generateMockId('cust');
    const newCustomer: Customer = {
      id: newId,
      ...customer
    };
    this.mockDb.customers.add(newCustomer);
    return Promise.resolve({ id: newId });
  }

  updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<void> {
    this.mockDb.customers.patch(id, data);
    return Promise.resolve();
  }

  deleteCustomer(id: string): Promise<void> {
    this.mockDb.customers.remove(id);
    return Promise.resolve();
  }
}
