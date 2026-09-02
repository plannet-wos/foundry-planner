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
];
