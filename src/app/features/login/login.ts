import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter, timeout, catchError, of } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MultiFactorResolver } from 'firebase/auth';
import { AuthService, MfaRequiredError } from '../../core/services/auth.service';
import { RANK } from '../../core/constants/roles';
import { allianceSlugFromId } from '../../core/models/alliance.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>Admin Login</mat-card-title>
          <mat-card-subtitle>Foundry Planner</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (showForgotPassword()) {
            @if (!resetSent()) {
              <p class="mfa-hint">Enter your email and we'll send you a link to reset your password.</p>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Email</mat-label>
                <input matInput [(ngModel)]="resetEmail" (keyup.enter)="sendPasswordReset()" autocomplete="username" />
              </mat-form-field>
              @if (error()) {
                <p class="error">Something went wrong — try again in a moment.</p>
              }
            } @else {
              <p class="mfa-hint">If an account exists for {{ resetEmail }}, a reset link is on its way — check your inbox (and spam folder).</p>
            }
          } @else if (!pendingMfaResolver()) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput [(ngModel)]="email" (keyup.enter)="submit()" autofocus autocomplete="username" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput type="password" [(ngModel)]="password" (keyup.enter)="submit()" autocomplete="current-password" />
            </mat-form-field>
            @if (error()) {
              <p class="error">Invalid email or password.</p>
            }
            <button mat-button class="forgot-link" (click)="openForgotPassword()">Forgot password?</button>
          } @else {
            <p class="mfa-hint">Enter the 6-digit code from your authenticator app.</p>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Authenticator code</mat-label>
              <input matInput [(ngModel)]="otp" (keyup.enter)="submitOtp()" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
            </mat-form-field>
            @if (error()) {
              <p class="error">Invalid authenticator code.</p>
            }
          }
        </mat-card-content>
        <mat-card-actions>
          @if (showForgotPassword()) {
            @if (!resetSent()) {
              <button mat-flat-button color="primary" (click)="sendPasswordReset()" [disabled]="loading() || !resetEmail">
                @if (loading()) { <mat-spinner diameter="20"></mat-spinner> } @else { Send reset link }
              </button>
            }
            <button mat-button (click)="cancelForgotPassword()">{{ resetSent() ? 'Back to login' : 'Back' }}</button>
          } @else if (!pendingMfaResolver()) {
            <button mat-flat-button color="primary" (click)="submit()" [disabled]="loading() || !email || !password">
              @if (loading()) { <mat-spinner diameter="20"></mat-spinner> } @else { Login }
            </button>
          } @else {
            <button mat-flat-button color="primary" (click)="submitOtp()" [disabled]="loading() || !otp">
              @if (loading()) { <mat-spinner diameter="20"></mat-spinner> } @else { Verify }
            </button>
            <button mat-button (click)="cancelMfa()">Back</button>
          }
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #1a1a2e;
    }
    .login-card { width: 360px; max-width: calc(100vw - 32px); }
    mat-card-content { display: flex; flex-direction: column; gap: 4px; padding-top: 16px; }
    .full-width { width: 100%; }
    .error { color: #f44336; font-size: 13px; margin: 4px 0 0; }
    .mfa-hint { font-size: 13px; opacity: 0.8; margin: 0 0 4px; }
    mat-card-actions { padding: 8px 16px 16px; }
    mat-spinner { display: inline-block; }
    .forgot-link { align-self: flex-start; font-size: 12px; opacity: 0.8; padding: 0; min-width: 0; }
  `]
})
export class Login {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);

  email    = '';
  password = '';
  otp      = '';
  error    = signal(false);
  loading  = signal(false);
  pendingMfaResolver = signal<MultiFactorResolver | null>(null);

  /** account() is populated asynchronously by an onSnapshot listener — this waits for it to
   * arrive (rather than reading a possibly-still-null value right after login resolves)
   * before deciding where to redirect. */
  private readonly account$ = toObservable(this.auth.account);

  async submit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.login(this.email, this.password);
      this.redirectAfterLogin();
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        this.pendingMfaResolver.set(err.resolver);
      } else {
        this.error.set(true);
        this.password = '';
      }
    } finally {
      this.loading.set(false);
      // Zoneless: nothing schedules a re-render after an await resolves on its own.
      this.cdr.detectChanges();
    }
  }

  async submitOtp() {
    const resolver = this.pendingMfaResolver();
    if (!resolver || !this.otp) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.completeMfaSignIn(resolver, this.otp);
      this.redirectAfterLogin();
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
      this.cdr.detectChanges();
    }
  }

  cancelMfa() {
    this.pendingMfaResolver.set(null);
    this.otp = '';
    this.error.set(false);
  }

  // --- forgot password ---
  showForgotPassword = signal(false);
  resetEmail = '';
  resetSent = signal(false);

  openForgotPassword(): void {
    this.resetEmail = this.email;
    this.resetSent.set(false);
    this.error.set(false);
    this.showForgotPassword.set(true);
  }

  cancelForgotPassword(): void {
    this.showForgotPassword.set(false);
    this.resetSent.set(false);
  }

  async sendPasswordReset(): Promise<void> {
    if (!this.resetEmail) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.sendPasswordReset(this.resetEmail);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') {
        this.error.set(true);
        this.loading.set(false);
        this.cdr.detectChanges();
        return;
      }
    }
    this.resetSent.set(true);
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  private async redirectAfterLogin() {
    const account = await firstValueFrom(this.account$.pipe(
      filter((a) => a !== null),
      timeout(6000),
      catchError(() => of(null)),
    ));
    if (!account) {
      this.router.navigate(['/']);
      return;
    }
    if (account.rank === RANK.SUPERADMIN) {
      this.router.navigate(['/superadmin']);
    } else if (account.allianceId && account.stateId) {
      const slug = allianceSlugFromId(account.stateId, account.allianceId);
      this.router.navigate([account.stateId, 'admin', slug]);
    } else {
      this.router.navigate(['/']);
    }
  }
}
