import { Timestamp } from '@angular/fire/firestore';

export interface AppUser {
  uid: string;
  email: string;
  companyId: string;
  role: 'owner' | 'admin' | 'employee';
  isSuperAdmin?: boolean;
  createdAt: Timestamp;
}
