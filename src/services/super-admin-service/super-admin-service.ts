import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AppUser } from '../../models/user-model';
import { Observable } from 'rxjs';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({
  providedIn: 'root',
})
export class SuperAdminService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private usersCollection;

  constructor() {
    super();
    this.usersCollection = collection(this.firestore, 'users');
  }

  getUsers(): Observable<AppUser[]> {
    return this.collectionDataObservable<AppUser>(query(this.usersCollection));
  }

  async resetUserPassword(targetUid: string, newPassword: string): Promise<void> {
    const resetUserPasswordFn = httpsCallable<
      { targetUid: string; newPassword: string },
      { success: boolean }
    >(this.functions, 'resetUserPassword');

    await resetUserPasswordFn({
      targetUid,
      newPassword,
    });
  }

  async setSuperAdmin(targetUid: string, value: boolean): Promise<void> {
    const setSuperAdminFn = httpsCallable<
      { targetUid: string; value: boolean },
      { success: boolean }
    >(this.functions, 'setSuperAdmin');

    await setSuperAdminFn({
      targetUid,
      value,
    });
  }
}
