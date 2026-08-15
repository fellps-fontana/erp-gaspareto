import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from '../auth-service/auth-service';

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private authService = inject(AuthService);

  readonly companyId = computed(() => this.authService.currentUser()?.companyId ?? null);

  isCompanyLoaded(): boolean {
    return this.companyId() !== null;
  }

  isAuthInitialized(): boolean {
    return this.authService.authInitialized();
  }
}
