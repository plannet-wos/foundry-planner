import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RANK } from '../constants/roles';

/**
 * An active State Admin of the route's :stateId, or the superadmin. Unlike superadminGuard,
 * this checks scope too: a State Admin of another state is turned away. firestore.rules
 * enforces the same thing on the write (alliances update: state_admin with a matching stateId).
 */
export const stateAdminGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // See AuthService.whenReady()'s doc comment for why this must come first.
  await auth.whenReady();

  if (!auth.isActive()) return router.createUrlTree(['/login']);
  if (auth.rank() === RANK.SUPERADMIN) return true;
  return (auth.rank() === RANK.STATE_ADMIN && auth.account()?.stateId === route.paramMap.get('stateId'))
    || router.createUrlTree(['/login']);
};
