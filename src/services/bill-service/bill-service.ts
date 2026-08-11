import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Bill } from '../../models/bill-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({ providedIn: 'root' })
export class BillService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COL = 'bills';

  getBills(): Observable<Bill[]> {
    const q = query(
      collection(this.firestore, this.COL),
      where('companyId', '==', this.tenantService.companyId()),
      orderBy('createdAt', 'desc')
    );
    return this.collectionDataObservable<Bill>(q);
  }

  async addBill(bill: Omit<Bill, 'id' | 'createdAt' | 'companyId'>): Promise<string> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível adicionar conta sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    const ref = await addDoc(collection(this.firestore, this.COL), {
      ...bill,
      companyId,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  async updateBillStatus(billId: string, newStatus: Bill['status']): Promise<void> {
    const ref = doc(this.firestore, `${this.COL}/${billId}`);
    const update: any = { status: newStatus };
    if (newStatus === 'recebido') update['receivedAt'] = serverTimestamp();
    if (newStatus === 'pago') update['paidAt'] = serverTimestamp();
    await updateDoc(ref, update);
  }

  async updateBill(billId: string, data: Partial<Omit<Bill, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(this.firestore, `${this.COL}/${billId}`), data as any);
  }

  async deleteBill(billId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.COL}/${billId}`));
  }
}
