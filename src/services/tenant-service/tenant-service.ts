import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AuthService } from '../auth-service/auth-service';

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private authService = inject(AuthService);

  readonly companyId = computed(() => this.authService.currentUser()?.companyId ?? null);

  constructor() {
    this.setupCompanyIdValidation();
  }

  private setupCompanyIdValidation(): void {
    effect(() => {
      const currentId = this.companyId();
      if (currentId === null) {
        console.debug('TenantService: companyId é null (usuário deslogado ou lookup pendente)');
      }
    });
  }

  isCompanyLoaded(): boolean {
    return this.companyId() !== null;
  }
}
