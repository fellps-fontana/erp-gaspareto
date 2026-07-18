import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ModuleConfig } from '../models/company-config';
import { ConfigService } from '../services/config/config.service';

export const moduleGuard: CanActivateFn = (route) => {
  const config = inject(ConfigService);
  const router = inject(Router);

  const moduleName = route.data['module'] as keyof ModuleConfig | undefined;
  if (!moduleName || config.modules()[moduleName]) {
    return true;
  }
  return router.createUrlTree(['/']);
};
