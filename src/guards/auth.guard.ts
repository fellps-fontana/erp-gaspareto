import { computed, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '../services/auth-service/auth-service';
import { filter, map, take } from 'rxjs';

export const authGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const authState = computed(() => ({
    initialized: authService.authInitialized(),
    user: authService.currentUser(),
  }));

  return toObservable(authState).pipe(
    filter(state => state.initialized === true),
    take(1),
    map(state => {
      if (state.user) {
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};
