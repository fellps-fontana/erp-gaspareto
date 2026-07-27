import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Customer } from '../../models/customer-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root'
})
export class CustomerService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COLLECTION = 'customers';

  getCustomers(): Observable<Customer[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION),
      where('companyId', '==', this.tenantService.companyId())
    );
    return this.collectionDataObservable<Customer>(q).pipe(
      map(customers => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    );
  }

  async addCustomer(customer: Omit<Customer, 'id' | 'companyId'>) {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível adicionar cliente sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    return addDoc(collection(this.firestore, this.COLLECTION), {
      ...customer,
      companyId
    });
  }

  updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>) {
    return updateDoc(doc(this.firestore, `${this.COLLECTION}/${id}`), data);
  }

  deleteCustomer(id: string) {
    return deleteDoc(doc(this.firestore, `${this.COLLECTION}/${id}`));
  }
}
