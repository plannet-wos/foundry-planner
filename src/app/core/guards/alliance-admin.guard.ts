import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AllianceService } from '../services/alliance.service';
import { RANK } from '../constants/roles';
import { allianceId } from '../models/alliance.model';

/**
 * R4 and R5 have identical feature permissions here ("full alliance admin capabilities" —
 * see the multi-state rollout plan) — this guard doesn't distinguish between them, only
 * superadmin (global bypass) from "must be this exact alliance's R4/R5". A state_admin also
 * passes for the one alliance they personally lead (account.allianceId set on their own
 * state_admin account — see account.model.ts's comment and firestore.rules' sameScope()).
 *
 * State alliances (type 'state_event') are the exception, since their roster is the whole
 * state: a State Admin of that state passes on every route, and an R4/R5 of any alliance in
 * that state passes on routes marked `data: { stateEventViewers: true }` (the roster page),
 * where AdminDashboard shows it view-only. Normal alliances stay locked to their own R4/R5.
 */
export const allianceAdminGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const alliances = inject(AllianceService);
  // See AuthService.whenReady()'s doc comment — without this, a genuinely signed-in user
  // navigating here right after login (or on a fresh page load) can get bounced to /login.
  await auth.whenReady();

  if (!auth.isActive()) return router.createUrlTree(['/login']);
  const rank = auth.rank();
  if (rank === RANK.SUPERADMIN) return true;
  if (rank !== RANK.R4 && rank !== RANK.R5 && rank !== RANK.STATE_ADMIN) {
    return router.createUrlTree(['/login']);
  }

  const stateId = route.paramMap.get('stateId');
  const allianceSlug = route.paramMap.get('allianceSlug');
  if (!stateId || !allianceSlug) return router.createUrlTree(['/login']);

  const account = auth.account();
  const id = allianceId(stateId, allianceSlug);
  if (account?.allianceId === id) return true;

  const inState = account?.stateId === stateId || !!account?.allianceId?.startsWith(`${stateId}-`);
  if (inState && (rank === RANK.STATE_ADMIN || route.data['stateEventViewers'])) {
    const alliance = await alliances.getAlliance(id);
    if (alliance?.type === 'state_event' && alliance.stateId === stateId) return true;
  }
  return router.createUrlTree(['/login']);
};
