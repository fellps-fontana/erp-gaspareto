import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TenantService } from '../services/tenant-service/tenant-service';

export const superAdminGuard: CanActivateFn = () => {
  const tenantService = inject(TenantService);
  const router = inject(Router);

  if (tenantService.isSuperAdmin()) {
    return true;
  }
  return router.createUrlTree(['/']);
};
