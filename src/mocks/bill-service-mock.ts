import { Injectable } from '@angular/core';
import { Bill } from '../models/bill-model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MockDatabase } from './core/mock-database';
import { generateMockId } from './core/mock-id';
import { BILLS_SEED } from './data/bills.seed';
import { BillService } from '../services/bill-service/bill-service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class BillServiceMock {
  private mockDb = MockDatabase.getInstance();

  constructor() {
    if (this.mockDb.bills.getAll().length === 0) {
      this.mockDb.bills.replaceAll(BILLS_SEED);
    }
  }

  getBills(): Observable<Bill[]> {
    return this.mockDb.bills.asObservable().pipe(
      map(bills =>
        [...bills].sort((a, b) => {
          const dateA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
          const dateB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
          return dateB - dateA;
        })
      )
    );
  }

  async addBill(bill: Omit<Bill, 'id' | 'createdAt'>): Promise<string> {
    const newId = generateMockId('bill');
    const newBill: Bill = {
      id: newId,
      ...bill,
      createdAt: Timestamp.now()
    };
    this.mockDb.bills.add(newBill);
    return newId;
  }

  async updateBillStatus(billId: string, newStatus: Bill['status']): Promise<void> {
    const update: any = { status: newStatus };
    if (newStatus === 'recebido') update['receivedAt'] = Timestamp.now();
    if (newStatus === 'pago') update['paidAt'] = Timestamp.now();
    this.mockDb.bills.patch(billId, update);
  }

  async updateBill(billId: string, data: Partial<Omit<Bill, 'id' | 'createdAt'>>): Promise<void> {
    this.mockDb.bills.patch(billId, data);
  }

  async deleteBill(billId: string): Promise<void> {
    this.mockDb.bills.remove(billId);
  }
}
