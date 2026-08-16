import { Injectable, inject, computed, signal } from '@angular/core';
import { AuthService } from '../auth-service/auth-service';

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private authService = inject(AuthService);

  private readonly companyOverride = signal<string | null>(null);
  /** uid do usuario que estava logado quando o override foi setado. Se o
   * currentUser() atual tiver uid diferente, o override e ignorado — invalida
   * automaticamente a troca de sessao sem depender de effect()/scheduler. */
  private readonly overrideOwnerUid = signal<string | null>(null);

  readonly isSuperAdmin = computed(() => this.authService.currentUser()?.isSuperAdmin === true);

  /**
   * companyId efetivo da sessao.
   * REGRA CRITICA (regra-de-negocio.md secao 13): usuario sem isSuperAdmin
   * sempre recebe o proprio companyId. Override so vale se (a) usuario atual
   * e super-admin E (b) overrideOwnerUid bate com o uid atual — garante
   * invalidacao sincrona na troca de usuario, sem race condition.
   */
  readonly companyId = computed<string | null>(() => {
    const user = this.authService.currentUser();
    if (!user) {
      return null;
    }

    if (this.isSuperAdmin() && this.overrideOwnerUid() === user.uid) {
      const override = this.companyOverride();
      if (override) {
        return override;
      }
    }

    return user.companyId;
  });

  /**
   * Troca o companyId ativo na sessao. So tem efeito quando o usuario logado
   * e isSuperAdmin (garantia real fica no companyId() computed, nao aqui).
   */
  setActiveCompanyOverride(companyId: string | null): void {
    this.overrideOwnerUid.set(this.authService.currentUser()?.uid ?? null);
    this.companyOverride.set(companyId);
  }

  isCompanyLoaded(): boolean {
    return this.companyId() !== null;
  }

  isAuthInitialized(): boolean {
    return this.authService.authInitialized();
  }
}
