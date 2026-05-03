import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FeedbackService } from '../../core/services/feedback.service';

// ── Dialog ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-feedback-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule,
    MatButtonToggleModule, MatProgressSpinnerModule
  ],
  template: `
    <h2 mat-dialog-title>Share Feedback</h2>

    <mat-dialog-content>
      @if (!submitted) {
        <p class="subtitle">Help us improve Foundry Planner</p>

        <mat-button-toggle-group [(ngModel)]="type" class="type-group">
          <mat-button-toggle value="bug">
            <mat-icon>bug_report</mat-icon> Bug
          </mat-button-toggle>
          <mat-button-toggle value="suggestion">
            <mat-icon>lightbulb</mat-icon> Suggestion
          </mat-button-toggle>
          <mat-button-toggle value="general">
            <mat-icon>chat</mat-icon> General
          </mat-button-toggle>
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Your feedback</mat-label>
          <textarea matInput [(ngModel)]="message" rows="5"
                    placeholder="Describe your issue or idea..."></textarea>
        </mat-form-field>
      } @else {
        <div class="success">
          <mat-icon>check_circle</mat-icon>
          <p>Thanks for your feedback!</p>
        </div>
      }
    </mat-dialog-content>

    @if (!submitted) {
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Cancel</button>
        <button mat-flat-button color="primary"
                (click)="submit()" [disabled]="!message.trim() || submitting">
          @if (submitting) { <mat-spinner diameter="18"></mat-spinner> }
          @else { Send Feedback }
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: [`
    .subtitle { color: #666; font-size: 14px; margin: 0 0 20px; }

    .type-group {
      display: flex;
      width: 100%;
      margin-bottom: 20px;

      mat-button-toggle { flex: 1; }
      mat-icon { font-size: 18px; width: 18px; height: 18px;
                 vertical-align: middle; margin-right: 4px; }
    }

    .full-width { width: 100%; }

    .success {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 0;
      gap: 12px;

      mat-icon { font-size: 64px; width: 64px; height: 64px; color: #43a047; }
      p { font-size: 18px; font-weight: 500; margin: 0; }
    }

    mat-spinner { display: inline-block; }
  `]
})
export class FeedbackDialog {
  private dialogRef       = inject(MatDialogRef<FeedbackDialog>);
  private feedbackService = inject(FeedbackService);
  private router          = inject(Router);

  type: 'bug' | 'suggestion' | 'general' = 'general';
  message    = '';
  submitting = false;
  submitted  = false;

  async submit() {
    if (!this.message.trim()) return;
    this.submitting = true;
    await this.feedbackService.submit({
      type:      this.type,
      message:   this.message.trim(),
      page:      this.router.url,
      createdAt: Date.now()
    });
    this.submitting = false;
    this.submitted  = true;
    setTimeout(() => this.dialogRef.close(), 1800);
  }
}

// ── FAB ────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-feedback-button',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button mat-fab class="feedback-fab" (click)="open()" aria-label="Give feedback">
      <mat-icon>rate_review</mat-icon>
    </button>
  `,
  styles: [`
    .feedback-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 900;
      background: #5c35b3 !important;
      color: white !important;
      box-shadow: 0 4px 16px rgba(92, 53, 179, 0.45) !important;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .feedback-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 24px rgba(92, 53, 179, 0.65) !important;
    }
  `]
})
export class FeedbackButton {
  private dialog = inject(MatDialog);

  open() {
    this.dialog.open(FeedbackDialog, {
      width: '480px',
      maxWidth: '95vw'
    });
  }
}
