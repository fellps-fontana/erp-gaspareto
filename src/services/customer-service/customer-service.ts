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

  getAniversariantesDoDia(referencia: Date = new Date()): Observable<Customer[]> {
    // Formata mes/dia da data de referencia em 'MM-DD' (local, sem conversao UTC)
    const referenciaMMDD = this.formatMMDD(referencia);

    // Filtra sobre o resultado já isolado por companyId de getCustomers()
    // sem adicionar novo where('companyId',...) — reutiliza isolamento existente
    return this.getCustomers().pipe(
      map(customers =>
        customers.filter(customer => {
          if (!customer.dataAniversario) {
            return false;
          }
          // Extrai 'MM-DD' de dataAniversario (formato 'YYYY-MM-DD')
          const customerMMDD = customer.dataAniversario.slice(5, 10);
          return customerMMDD === referenciaMMDD;
        })
      )
    );
  }

  private formatMMDD(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
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
