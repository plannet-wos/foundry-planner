import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RANK } from '../constants/roles';
import { allianceId } from '../models/alliance.model';

/**
 * R4 and R5 have identical feature permissions here ("full alliance admin capabilities" —
 * see the multi-state rollout plan) — this guard doesn't distinguish between them, only
 * superadmin (global bypass) from "must be this exact alliance's R4/R5". A state_admin also
 * passes, but ONLY for the one alliance they personally lead (account.allianceId set on
 * their own state_admin account — see account.model.ts's comment and firestore.rules'
 * sameScope()); a state_admin with no allianceId, or one whose allianceId doesn't match this
 * route, is rejected same as anyone else — state-wide authority doesn't leak into a specific
 * alliance's operational tools just because they outrank its R5.
 */
export const allianceAdminGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // See AuthService.whenReady()'s doc comment — without this, a genuinely signed-in user
  // navigating here right after login (or on a fresh page load) can get bounced to /login.
  await auth.whenReady();

  if (!auth.isActive()) return router.createUrlTree(['/login']);
  if (auth.rank() === RANK.SUPERADMIN) return true;
  if (auth.rank() !== RANK.R4 && auth.rank() !== RANK.R5 && auth.rank() !== RANK.STATE_ADMIN) {
    return router.createUrlTree(['/login']);
  }

  const stateId = route.paramMap.get('stateId');
  const allianceSlug = route.paramMap.get('allianceSlug');
  if (!stateId || !allianceSlug) return router.createUrlTree(['/login']);

  return auth.account()?.allianceId === allianceId(stateId, allianceSlug) || router.createUrlTree(['/login']);
};
