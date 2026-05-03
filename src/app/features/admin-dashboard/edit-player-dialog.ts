import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { Player } from '../../core/models/player.model';

export interface EditPlayerDialogData {
  player: Player;
}

export interface EditPlayerDialogResult {
  inGameName: string;
  availability: Player['availability'];
}

@Component({
  selector: 'app-edit-player-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Edit Player</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>In-Game Name</mat-label>
        <input matInput [(ngModel)]="name" />
      </mat-form-field>

      <p class="avail-label">Availability</p>
      <div class="avail-grid">
        <mat-checkbox [(ngModel)]="avail.time_2">02:00 UTC</mat-checkbox>
        <mat-checkbox [(ngModel)]="avail.time_7">07:00 UTC</mat-checkbox>
        <mat-checkbox [(ngModel)]="avail.time_12">12:00 UTC</mat-checkbox>
        <mat-checkbox [(ngModel)]="avail.time_14">14:00 UTC</mat-checkbox>
        <mat-checkbox [(ngModel)]="avail.time_19">19:00 UTC</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!name.trim()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { display: flex; flex-direction: column; gap: 12px; min-width: 320px; padding-top: 8px; }
    .full-width { width: 100%; }
    .avail-label { margin: 0; font-size: 13px; color: #666; }
    .avail-grid { display: flex; flex-direction: column; gap: 8px; }
  `]
})
export class EditPlayerDialog {
  dialogRef = inject(MatDialogRef<EditPlayerDialog>);
  private data: EditPlayerDialogData = inject(MAT_DIALOG_DATA);

  name = this.data.player.inGameName;
  avail = { ...this.data.player.availability };

  save() {
    const result: EditPlayerDialogResult = {
      inGameName: this.name.trim(),
      availability: this.avail
    };
    this.dialogRef.close(result);
  }
}
