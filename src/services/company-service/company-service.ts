import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { collection, query } from 'firebase/firestore';
import { Company } from '../../models/company-model';
import { Observable } from 'rxjs';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({
  providedIn: 'root',
})
export class CompanyService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private companiesCollection;

  constructor() {
    super();
    this.companiesCollection = collection(this.firestore, 'companies');
  }

  getCompanies(): Observable<Company[]> {
    return this.collectionDataObservable<Company>(query(this.companiesCollection));
  }
}
