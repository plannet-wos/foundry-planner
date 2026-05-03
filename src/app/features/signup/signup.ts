import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PlayerService } from '../../core/services/player.service';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance } from '../../core/models/alliance.model';
import { Player } from '../../core/models/player.model';

export interface TimeSlot { id: string; label: string; }

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatCheckboxModule, MatButtonModule, MatSnackBarModule
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.scss'
})
export class Signup implements OnInit {
  private fb              = inject(FormBuilder);
  private snackBar        = inject(MatSnackBar);
  private playerService   = inject(PlayerService);
  private allianceService = inject(AllianceService);
  private route           = inject(ActivatedRoute);

  allianceId!: string;
  alliance: Alliance | null = null;

  readonly timeSlots: TimeSlot[] = [
    { id: 'time_2',  label: '02:00 UTC' },
    { id: 'time_7',  label: '07:00 UTC' },
    { id: 'time_12', label: '12:00 UTC' },
    { id: 'time_14', label: '14:00 UTC' },
    { id: 'time_19', label: '19:00 UTC' },
  ];

  signupForm = this.fb.group({
    inGameName: ['', Validators.required],
    inGameId:   ['', [Validators.required, Validators.pattern('^[0-9]+$')]],
    availability: this.fb.group({
      time_2:  [false],
      time_7:  [false],
      time_12: [false],
      time_14: [false],
      time_19: [false]
    })
  });

  async ngOnInit() {
    this.allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    this.alliance   = await this.allianceService.getAlliance(this.allianceId);
  }

  async onSubmit() {
    if (!this.signupForm.valid) {
      this.snackBar.open('Please fill out all required fields correctly.', 'Close', { duration: 3000 });
      return;
    }
    const v = this.signupForm.value;
    const player: Player = {
      id:          v.inGameId!,
      inGameName:  v.inGameName!,
      allianceId:  this.allianceId,
      availability: {
        time_2:  v.availability?.time_2  || false,
        time_7:  v.availability?.time_7  || false,
        time_12: v.availability?.time_12 || false,
        time_14: v.availability?.time_14 || false,
        time_19: v.availability?.time_19 || false,
      },
      legion: 'unassigned'
    };
    try {
      await this.playerService.savePlayer(player);
      this.snackBar.open('Registration successful!', 'Close', { duration: 3000 });
      this.signupForm.reset();
      this.signupForm.markAsPristine();
      this.signupForm.markAsUntouched();
    } catch (err) {
      console.error(err);
      this.snackBar.open('Error saving registration. Try again.', 'Close', { duration: 3000 });
    }
  }
}
