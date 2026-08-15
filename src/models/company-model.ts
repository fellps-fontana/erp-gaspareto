import { Timestamp } from '@angular/fire/firestore';
import { ModuleConfig } from './company-config';

export interface Company {
  id?: string;
  name: string;
  document?: string;
  plan: 'trial' | 'basic' | 'pro';
  status: 'active' | 'suspended' | 'canceled';
  modules: ModuleConfig;
  createdAt: Timestamp;
}
