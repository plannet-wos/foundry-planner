import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const allianceAdminGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (auth.isSuperAdmin()) return true;

  const allianceId = route.paramMap.get('allianceId');
  return auth.getAllianceId() === allianceId || router.createUrlTree(['/login']);
};
