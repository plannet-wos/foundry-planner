import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { Login } from './features/login/login';
import { AllianceSelect } from './features/alliance-select/alliance-select';
import { Signup } from './features/signup/signup';
import { AdminDashboard } from './features/admin-dashboard/admin-dashboard';
import { BattlePlanBuilder } from './features/battle-plan-builder/battle-plan-builder';
import { TaskLibrary } from './features/task-library/task-library';
import { SuperadminDashboard } from './features/superadmin/superadmin';
import { Guides } from './features/guides/guides';
import { PersonalPlan } from './features/personal-plan/personal-plan';
import { GlobalPlan } from './features/global-plan/global-plan';
import { superadminGuard } from './core/guards/superadmin.guard';
import { allianceAdminGuard } from './core/guards/alliance-admin.guard';

export const routes: Routes = [
  // Landing
  { path: '',                                    component: Home },
  { path: 'login',                               component: Login },

  // Superadmin (global — see the multi-state rollout plan; alliance CRUD itself now lives
  // in plannet-wos's state-admin dashboard, this only keeps a read-only oversight view + feedback)
  { path: 'superadmin',                          component: SuperadminDashboard, canActivate: [superadminGuard] },

  // State-scoped: everything below here needs a game server/state number as the first
  // segment. :allianceSlug is the bare, human-readable part — see resolveAllianceId()/
  // allianceId() in alliance.model.ts for how it's composed with :stateId into the real
  // Firestore document ID at each call site.
  { path: ':stateId/player',                                    component: AllianceSelect },

  { path: ':stateId/admin/:allianceSlug',              component: AdminDashboard,    canActivate: [allianceAdminGuard] },
  { path: ':stateId/admin/:allianceSlug/task-library', component: TaskLibrary,       canActivate: [allianceAdminGuard] },
  { path: ':stateId/admin/:allianceSlug/plan-builder', component: BattlePlanBuilder, canActivate: [allianceAdminGuard] },

  // Player-facing routes (public, alliance-scoped)
  { path: ':stateId/alliance/:allianceSlug',           component: Signup },
  { path: ':stateId/alliance/:allianceSlug/guides',    component: Guides },
  { path: ':stateId/alliance/:allianceSlug/plan',      component: PersonalPlan },
  { path: ':stateId/alliance/:allianceSlug/global',    component: GlobalPlan },

  // --- Legacy redirects (temporary) -----------------------------------------------
  // Links shared/bookmarked before the multi-state rollout had no :stateId segment at
  // all. Redirect them to state 3038 — the only state that existed then — rather than
  // let them 404. Angular interpolates :allianceId here from the OLD path's own param
  // name, regardless of what the canonical routes above call it (:allianceSlug).
  // Segment counts never collide with the routes above (2 segments vs. 3, etc.), so
  // matching is unambiguous. Remove this block once this window has passed.
  { path: 'player',                                    redirectTo: '3038/player', pathMatch: 'full' },
  { path: 'admin/:allianceId',                         redirectTo: '3038/admin/:allianceId', pathMatch: 'full' },
  { path: 'admin/:allianceId/task-library',            redirectTo: '3038/admin/:allianceId/task-library', pathMatch: 'full' },
  { path: 'admin/:allianceId/plan-builder',            redirectTo: '3038/admin/:allianceId/plan-builder', pathMatch: 'full' },
  { path: 'alliance/:allianceId',                      redirectTo: '3038/alliance/:allianceId', pathMatch: 'full' },
  { path: 'alliance/:allianceId/guides',                redirectTo: '3038/alliance/:allianceId/guides', pathMatch: 'full' },
  { path: 'alliance/:allianceId/plan',                  redirectTo: '3038/alliance/:allianceId/plan', pathMatch: 'full' },
  { path: 'alliance/:allianceId/global',                redirectTo: '3038/alliance/:allianceId/global', pathMatch: 'full' },
];
