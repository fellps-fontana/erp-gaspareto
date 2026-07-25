import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { Observable, switchMap, of, map, catchError, tap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyConfig, DEFAULT_MODULES, ModuleConfig } from '../../models/company-config';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({ providedIn: 'root' })
export class ConfigService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private destroyRef = inject(DestroyRef);

  readonly modules = signal<ModuleConfig>({ ...DEFAULT_MODULES });
  readonly modules$: Observable<ModuleConfig>;

  constructor() {
    super();

    // Monitorar mudanças de companyId — toObservable chamado uma única vez (evita NG0203)
    // Ao mudar companyId, switchMap troca o listener onSnapshot pra o novo doc da empresa
    this.modules$ = toObservable(this.tenantService.companyId).pipe(
      switchMap(companyId => this.loadCompanyModules(companyId)),
      tap(modules => this.modules.set(modules)),
      takeUntilDestroyed(this.destroyRef)
    );

    this.modules$.subscribe();
  }

  private loadCompanyModules(companyId: string | null): Observable<ModuleConfig> {
    // Enquanto companyId for null (deslogado), manter DEFAULT_MODULES
    if (!companyId) {
      return of({ ...DEFAULT_MODULES });
    }

    // Abrir listener onSnapshot contínuo no doc da empresa
    // Ao trocar companyId, switchMap cancela o listener antigo e abre um novo
    const companyRef = doc(this.firestore, `companies/${companyId}`);
    return this.docDataObservable<CompanyConfig>(companyRef).pipe(
      map(company => {
        if (!company) {
          // Doc não encontrado - logar inconsistência
          console.warn(
            `[ConfigService] Documento não encontrado: companies/${companyId}. ` +
              `Usando DEFAULT_MODULES.`
          );
          return { ...DEFAULT_MODULES };
        }
        // Merge com DEFAULT_MODULES: módulos novos nascem habilitados
        return { ...DEFAULT_MODULES, ...company.modules };
      }),
      catchError(error => {
        console.error(
          `[ConfigService] Erro ao buscar configuração de companies/${companyId}:`,
          error
        );
        return of({ ...DEFAULT_MODULES });
      })
    );
  }

  async updateModules(modules: Partial<ModuleConfig>): Promise<void> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error('Não é possível atualizar módulos sem empresa ativa');
    }

    const merged: ModuleConfig = { ...this.modules(), ...modules };
    const companyRef = doc(this.firestore, `companies/${companyId}`);

    // merge: true garante que outros campos do doc da empresa (name, plan, status, etc)
    // não serão sobrescritos
    await setDoc(companyRef, { modules: merged }, { merge: true });
  }
}
