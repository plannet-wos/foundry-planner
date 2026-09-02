import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { AllianceService } from '../../core/services/alliance.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { Feedback } from '../../core/models/feedback.model';
import { AuthService } from '../../core/services/auth.service';
import { Alliance } from '../../core/models/alliance.model';

// Alliance create/edit/delete moved to plannet-wos's state-admin dashboard as part of the
// multi-state rollout (see the plan) — that's now the only place minting/retiring composite
// alliance IDs. This page keeps a read-only list purely so superadmin can jump into any
// alliance's foundry-planner dashboard for oversight, plus the unrelated feedback inbox it
// already hosted.
@Component({
  selector: 'app-superadmin',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatSnackBarModule, MatDividerModule,
  ],
  templateUrl: './superadmin.html',
  styleUrl: './superadmin.scss'
})
export class SuperadminDashboard implements OnInit {
  private allianceService  = inject(AllianceService);
  private auth             = inject(AuthService);
  private router           = inject(Router);
  private feedbackService  = inject(FeedbackService);

  alliances$!: Observable<Alliance[]>;
  feedback$!:  Observable<Feedback[]>;

  ngOnInit() {
    this.alliances$ = this.allianceService.getAlliances();
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

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
