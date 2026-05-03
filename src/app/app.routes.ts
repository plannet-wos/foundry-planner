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
  { path: '',                               component: Home },
  { path: 'login',                          component: Login },
  { path: 'player',                         component: AllianceSelect },

  // Superadmin
  { path: 'superadmin',                     component: SuperadminDashboard,  canActivate: [superadminGuard] },

  // Admin (alliance-scoped)
  { path: 'admin/:allianceId',              component: AdminDashboard,       canActivate: [allianceAdminGuard] },
  { path: 'admin/:allianceId/task-library', component: TaskLibrary,          canActivate: [allianceAdminGuard] },
  { path: 'admin/:allianceId/plan-builder', component: BattlePlanBuilder,    canActivate: [allianceAdminGuard] },

  // Player-facing routes (public, alliance-scoped)
  { path: 'alliance/:allianceId',           component: Signup },
  { path: 'alliance/:allianceId/guides',    component: Guides },
  { path: 'alliance/:allianceId/plan',      component: PersonalPlan },
  { path: 'alliance/:allianceId/global',    component: GlobalPlan },
];
