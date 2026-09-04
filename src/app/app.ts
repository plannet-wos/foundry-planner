import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './core/services/auth.service';
import { RANK } from './core/constants/roles';
import { allianceSlugFromId } from './core/models/alliance.model';
import { FeedbackButton } from './shared/feedback-button/feedback-button';
import { AppSwitcherComponent } from './shared/app-switcher/app-switcher';

/** Routes where the top navbar is hidden (full-screen landing pages) */
const HIDE_NAV_ROUTES = new Set(['/', '/player']);

interface AllianceRoute { stateId: string; slug: string; }

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, FeedbackButton, AppSwitcherComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected auth           = inject(AuthService);
  private   router         = inject(Router);
  private   destroyRef     = inject(DestroyRef);
  private   bpObserver     = inject(BreakpointObserver);
  protected title          = 'Foundry Planner';
  protected RANK           = RANK;

  protected routeAlliance      = signal<AllianceRoute | null>(null);
  protected routeAdminAlliance = signal<AllianceRoute | null>(null);
  protected adminAlliance      = signal<AllianceRoute | null>(null);
  protected hideNav            = signal(false);
  protected isMobile           = signal(false);

  protected isSuperAdmin = computed(() => this.auth.isActive() && this.auth.rank() === RANK.SUPERADMIN);
  protected isAllianceAdmin = computed(() => {
    const rank = this.auth.rank();
    // A state_admin counts too, but only when they personally lead an alliance (allianceId
    // set on their own account — see account.model.ts's comment) — matches allianceAdminGuard.
    return this.auth.isActive() && (
      rank === RANK.R4 || rank === RANK.R5 || (rank === RANK.STATE_ADMIN && !!this.auth.account()?.allianceId)
    );
  });
  /** The logged-in R4/R5's own alliance — derived from their account doc, not the current URL. */
  protected myAlliance = computed<AllianceRoute | null>(() => {
    const account = this.auth.account();
    if (!account?.stateId || !account.allianceId) return null;
    return { stateId: account.stateId, slug: allianceSlugFromId(account.stateId, account.allianceId) };
  });

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      const url = this.router.url.split('?')[0];
      const allianceMatch = url.match(/^\/([^/?#]+)\/alliance\/([^/?#]+)/);
      const adminMatch    = url.match(/^\/([^/?#]+)\/admin\/([^/?#]+)/);
      const routeAlliance = allianceMatch ? { stateId: allianceMatch[1], slug: allianceMatch[2] } : null;
      const routeAdmin    = adminMatch ? { stateId: adminMatch[1], slug: adminMatch[2] } : null;
      this.routeAlliance.set(routeAlliance);
      this.routeAdminAlliance.set(routeAdmin);
      const sticky = routeAdmin ?? routeAlliance;
      if (sticky) this.adminAlliance.set(sticky);
      else if (url === '/superadmin') this.adminAlliance.set(null);
      this.hideNav.set(HIDE_NAV_ROUTES.has(url));
    });

    this.bpObserver.observe('(max-width: 768px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(r => this.isMobile.set(r.matches));
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
