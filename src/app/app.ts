import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './core/services/auth.service';
import { FeedbackButton } from './shared/feedback-button/feedback-button';
import { AppSwitcherComponent } from './shared/app-switcher/app-switcher';

/** Routes where the top navbar is hidden (full-screen landing pages) */
const HIDE_NAV_ROUTES = new Set(['/', '/player']);

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

  protected routeAllianceId      = signal<string | null>(null);
  protected routeAdminAllianceId = signal<string | null>(null);
  protected adminAllianceId      = signal<string | null>(null);
  protected hideNav              = signal(false);
  protected isMobile             = signal(false);

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      const url            = this.router.url.split('?')[0];
      const allianceMatch  = url.match(/^\/alliance\/([^/?#]+)/);
      const adminMatch     = url.match(/^\/admin\/([^/?#]+)/);
      const routeAlliance  = allianceMatch ? allianceMatch[1] : null;
      const routeAdmin     = adminMatch ? adminMatch[1] : null;
      this.routeAllianceId.set(routeAlliance);
      this.routeAdminAllianceId.set(routeAdmin);
      const sticky = routeAdmin ?? routeAlliance;
      if (sticky) this.adminAllianceId.set(sticky);
      else if (url === '/superadmin') this.adminAllianceId.set(null);
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
