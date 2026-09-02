import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RANK } from '../constants/roles';

/**
 * Superadmin or state_admin — the "Alliances" oversight page (superadmin.ts) is also where
 * the "Create State Event" form lives (see the state-event redesign plan), and state_admin
 * needs to reach it too. The page itself narrows further: state_admin's state picker is
 * locked to their own account.stateId, superadmin's is free choice — same "scope, not just
 * rank" split as everywhere else in the hierarchy (see roles.ts).
 */
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const rank = auth.rank();
  return (auth.isActive() && rank !== null && rank <= RANK.STATE_ADMIN) || router.createUrlTree(['/login']);
};
