import { Injectable, signal } from '@angular/core';
import { ModuleConfig, DEFAULT_MODULES, CompanyConfig } from '../models/company-config';
import { Observable, shareReplay, BehaviorSubject } from 'rxjs';
import { ConfigService } from '../services/config/config.service';
import { MockDatabase } from './core/mock-database';
import { COMPANY_CONFIG_SEED } from './data/company-config.seed';

@Injectable({ providedIn: 'root' })
export class ConfigServiceMock {
  private mockDb = MockDatabase.getInstance();
  readonly modules = signal<ModuleConfig>({ ...DEFAULT_MODULES });
  readonly modules$: Observable<ModuleConfig>;
  private modulesSubject: BehaviorSubject<ModuleConfig>;

  constructor() {
    if (this.mockDb.companyConfig.getAll().length === 0) {
      this.mockDb.companyConfig.replaceAll(COMPANY_CONFIG_SEED);
    }

    const company = this.mockDb.companyConfig.findById('company');
    const initial: ModuleConfig = { ...DEFAULT_MODULES, ...company?.modules };
    this.modulesSubject = new BehaviorSubject<ModuleConfig>(initial);

    this.modules$ = this.modulesSubject.asObservable().pipe(
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.modules$.subscribe(m => this.modules.set(m));
  }

  async updateModules(modules: Partial<ModuleConfig>): Promise<void> {
    const merged: ModuleConfig = { ...this.modules(), ...modules };
    this.modulesSubject.next(merged);
    this.modules.set(merged);

    const config = this.mockDb.companyConfig.findById('company');
    if (config) {
      this.mockDb.companyConfig.patch('company', { modules: merged });
    }
  }
}
