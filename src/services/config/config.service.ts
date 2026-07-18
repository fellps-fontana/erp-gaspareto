import { Injectable, inject, signal } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, query, setDoc } from 'firebase/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { CompanyConfig, DEFAULT_MODULES, ModuleConfig } from '../../models/company-config';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({ providedIn: 'root' })
export class ConfigService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private readonly COL = 'config';
  private readonly DOC_ID = 'company';

  readonly modules = signal<ModuleConfig>({ ...DEFAULT_MODULES });
  readonly modules$: Observable<ModuleConfig>;

  constructor() {
    super();
    const q = query(collection(this.firestore, this.COL));
    this.modules$ = this.collectionDataObservable<CompanyConfig>(q).pipe(
      map(docs => {
        const company = docs.find(d => d.id === this.DOC_ID);
        if (!company) {
          void this.createDefault();
          return { ...DEFAULT_MODULES };
        }
        // Mescla com os defaults para que módulos novos apareçam habilitados
        return { ...DEFAULT_MODULES, ...company.modules };
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.modules$.subscribe(m => this.modules.set(m));
  }

  private async createDefault(): Promise<void> {
    await setDoc(
      doc(this.firestore, `${this.COL}/${this.DOC_ID}`),
      { modules: DEFAULT_MODULES },
      { merge: true }
    );
  }

  async updateModules(modules: Partial<ModuleConfig>): Promise<void> {
    const merged: ModuleConfig = { ...this.modules(), ...modules };
    await setDoc(
      doc(this.firestore, `${this.COL}/${this.DOC_ID}`),
      { modules: merged },
      { merge: true }
    );
  }
}
