import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AllianceService } from '../../core/services/alliance.service';
import { StatesService } from '../../core/services/states.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { Feedback } from '../../core/models/feedback.model';
import { AuthService } from '../../core/services/auth.service';
import { Alliance } from '../../core/models/alliance.model';
import { StateDoc } from '../../core/models/account.model';
import { RANK } from '../../core/constants/roles';

// Alliance create/edit/delete moved to plannet-wos's state-admin dashboard as part of the
// multi-state rollout (see the plan) — that's now the only place minting/retiring composite
// *normal-alliance* IDs. This page keeps a read-only list purely so superadmin/state_admin can
// jump into any alliance's foundry-planner dashboard for oversight, plus the unrelated
// feedback inbox it already hosted. It's also, deliberately, the ONE place that still creates
// alliance docs from foundry-planner: state-event shells (see alliance.model.ts's `type`
// field) are a foundry-planner-specific concept — its own admin area is where a state_admin
// or superadmin sets one up (see the state-event redesign plan's UI-location decision).
@Component({
  selector: 'app-superadmin',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatSnackBarModule, MatDividerModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
  ],
  templateUrl: './superadmin.html',
  styleUrl: './superadmin.scss'
})
export class SuperadminDashboard implements OnInit {
  private allianceService  = inject(AllianceService);
  private statesService    = inject(StatesService);
  private auth             = inject(AuthService);
  private router           = inject(Router);
  private feedbackService  = inject(FeedbackService);
  private snackBar         = inject(MatSnackBar);

  alliances$!: Observable<Alliance[]>;
  feedback$!:  Observable<Feedback[]>;
  states$!:    Observable<StateDoc[]>;

  /** Superadmin picks any state; state_admin is locked to their own. */
  readonly isSuperadmin = this.auth.rank() === RANK.SUPERADMIN;
  readonly myStateId = this.auth.account()?.stateId ?? null;

  newEventStateId = this.myStateId ?? '';
  newEventSlug = '';
  newEventName = '';
  creatingEvent = false;

  ngOnInit() {
    this.alliances$ = this.allianceService.getAlliances();
    this.states$    = this.statesService.list$();
    this.feedback$  = this.feedbackService.getAll().pipe(
      map(items => items.sort((a, b) => b.createdAt - a.createdAt))
    );
  }

  async deleteFeedback(id: string) {
    await this.feedbackService.delete(id);
  }

  navigateTo(alliance: Alliance) {
    this.router.navigate([alliance.stateId, 'admin', alliance.slug]);
  }

  async createStateEvent() {
    const stateId = this.isSuperadmin ? this.newEventStateId : this.myStateId;
    const slug = this.newEventSlug.trim();
    const name = this.newEventName.trim();
    if (!stateId || !slug || !name) {
      this.snackBar.open('State, slug, and name are all required.', 'Close', { duration: 3000 });
      return;
    }
    this.creatingEvent = true;
    try {
      await this.allianceService.createStateEvent(stateId, slug, name);
      this.snackBar.open(`State event "${name}" created`, 'Close', { duration: 3000 });
      this.newEventSlug = '';
      this.newEventName = '';
      this.alliances$ = this.allianceService.getAlliances();
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Failed to create state event', 'Close', { duration: 4000 });
    } finally {
      this.creatingEvent = false;
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
