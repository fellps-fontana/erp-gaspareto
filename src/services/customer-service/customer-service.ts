import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Customer } from '../../models/customer-model';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({
  providedIn: 'root'
})
export class CustomerService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private readonly COLLECTION = 'customers';

  getCustomers(): Observable<Customer[]> {
    const q = query(collection(this.firestore, this.COLLECTION));
    return this.collectionDataObservable<Customer>(q).pipe(
      map(customers => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    );
  }

  addCustomer(customer: Omit<Customer, 'id' | 'companyId'>) {
    return addDoc(collection(this.firestore, this.COLLECTION), customer);
  }

  updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>) {
    return updateDoc(doc(this.firestore, `${this.COLLECTION}/${id}`), data);
  }

  deleteCustomer(id: string) {
    return deleteDoc(doc(this.firestore, `${this.COLLECTION}/${id}`));
  }
}
