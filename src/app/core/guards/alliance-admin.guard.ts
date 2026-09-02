import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RANK } from '../constants/roles';
import { allianceId } from '../models/alliance.model';

/**
 * R4 and R5 have identical feature permissions here ("full alliance admin capabilities" —
 * see the multi-state rollout plan) — this guard doesn't distinguish between them, only
 * superadmin (global bypass) from "must be this exact alliance's R4/R5".
 */
export const allianceAdminGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isActive()) return router.createUrlTree(['/login']);
  if (auth.rank() === RANK.SUPERADMIN) return true;
  if (auth.rank() !== RANK.R4 && auth.rank() !== RANK.R5) return router.createUrlTree(['/login']);

  const stateId = route.paramMap.get('stateId');
  const allianceSlug = route.paramMap.get('allianceSlug');
  if (!stateId || !allianceSlug) return router.createUrlTree(['/login']);

  return auth.account()?.allianceId === allianceId(stateId, allianceSlug) || router.createUrlTree(['/login']);
};
