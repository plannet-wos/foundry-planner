import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance } from '../../core/models/alliance.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatProgressSpinnerModule
  ],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>Admin Login</mat-card-title>
          <mat-card-subtitle>Foundry Planner</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Username</mat-label>
            <input matInput [(ngModel)]="username" (keyup.enter)="submit()" autofocus autocomplete="username" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Password</mat-label>
            <input matInput type="password" [(ngModel)]="password" (keyup.enter)="submit()" autocomplete="current-password" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Alliance (skip if superadmin)</mat-label>
            <mat-select [(ngModel)]="allianceId">
              @for (alliance of alliances$ | async; track alliance.id) {
                <mat-option [value]="alliance.id">{{ alliance.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (error) {
            <p class="error">Invalid username or password.</p>
          }
        </mat-card-content>
        <mat-card-actions>
          <button mat-flat-button color="primary" (click)="submit()" [disabled]="loading || !username || !password">
            @if (loading) { <mat-spinner diameter="20"></mat-spinner> } @else { Login }
          </button>
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
    mat-card-actions { padding: 8px 16px 16px; }
    mat-spinner { display: inline-block; }
  `]
})
export class Login implements OnInit {
  private auth            = inject(AuthService);
  private router          = inject(Router);
  private allianceService = inject(AllianceService);
  private cdr             = inject(ChangeDetectorRef);

  username    = '';
  password    = '';
  allianceId  = '';
  error       = false;
  loading     = false;
  alliances$!: Observable<Alliance[]>;

  ngOnInit() {
    this.alliances$ = this.allianceService.getAlliances();
  }

  async submit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = false;
    const role = await this.auth.login(this.username, this.password, this.allianceId || undefined);
    this.loading = false;
    if (role === 'superadmin') {
      this.router.navigate(['/superadmin']);
    } else if (role === 'admin') {
      this.router.navigate(['/admin', this.auth.getAllianceId()]);
    } else {
      this.error = true;
      this.password = '';
      // Zoneless: nothing schedules a re-render after an await resolves on
      // its own — without this, a wrong password leaves the form stuck
      // showing the spinner forever even though this.error is now true.
      this.cdr.detectChanges();
    }
  }
}
