import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Bill } from '../../models/bill-model';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({ providedIn: 'root' })
export class BillService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private readonly COL = 'bills';

  getBills(): Observable<Bill[]> {
    const q = query(collection(this.firestore, this.COL), orderBy('createdAt', 'desc'));
    return this.collectionDataObservable<Bill>(q);
  }

  async addBill(bill: Omit<Bill, 'id' | 'createdAt' | 'companyId'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, this.COL), {
      ...bill,
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
