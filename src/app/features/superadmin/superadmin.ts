import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AllianceService } from '../../core/services/alliance.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { Feedback } from '../../core/models/feedback.model';
import { PlayerService } from '../../core/services/player.service';
import { PlanService } from '../../core/services/plan.service';
import { AuthService } from '../../core/services/auth.service';
import { Alliance, Account } from '../../core/models/alliance.model';
import { getDocs, query, collection, where, getFirestore, deleteDoc } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';

@Component({
  selector: 'app-superadmin',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatListModule,
    MatSnackBarModule, MatDividerModule
  ],
  templateUrl: './superadmin.html',
  styleUrl: './superadmin.scss'
})
export class SuperadminDashboard implements OnInit {
  private allianceService  = inject(AllianceService);
  private playerService    = inject(PlayerService);
  private planService      = inject(PlanService);
  private auth             = inject(AuthService);
  private snackBar         = inject(MatSnackBar);
  private router           = inject(Router);
  private firestore        = inject(Firestore);
  private feedbackService  = inject(FeedbackService);

  alliances$!: Observable<Alliance[]>;
  feedback$!:  Observable<Feedback[]>;

  // Create form
  newAllianceName = '';
  newAdminUsername = '';
  newAdminPassword = '';
  creating = false;

  // Pending delete
  pendingDeleteId: string | null = null;

  ngOnInit() {
    this.alliances$ = this.allianceService.getAlliances();
    this.feedback$  = this.feedbackService.getAll().pipe(
      map(items => items.sort((a, b) => b.createdAt - a.createdAt))
    );
  }

  async deleteFeedback(id: string) {
    await this.feedbackService.delete(id);
  }

  get newAllianceSlug(): string {
    return AllianceService.toSlug(this.newAllianceName);
  }

  get createFormValid(): boolean {
    return !!(this.newAllianceName.trim() && this.newAdminUsername.trim() && this.newAdminPassword.trim());
  }

  async createAlliance() {
    if (!this.createFormValid) return;
    this.creating = true;
    const slug = this.newAllianceSlug;
    try {
      await this.allianceService.saveAlliance({
        id: slug,
        name: this.newAllianceName.trim(),
        createdAt: Date.now()
      });
      await this.allianceService.saveAccount({
        id: this.newAdminUsername.trim(),
        username: this.newAdminUsername.trim(),
        password: this.newAdminPassword.trim(),
        allianceId: slug
      });
      this.snackBar.open(`Alliance "${this.newAllianceName.trim()}" created`, 'Close', { duration: 3000 });
      this.newAllianceName = '';
      this.newAdminUsername = '';
      this.newAdminPassword = '';
    } catch (e) {
      console.error(e);
      this.snackBar.open('Failed to create alliance', 'Close', { duration: 3000 });
    }
    this.creating = false;
  }

  requestDelete(allianceId: string) {
    this.pendingDeleteId = allianceId;
  }

  cancelDelete() {
    this.pendingDeleteId = null;
  }

  async confirmDelete(alliance: Alliance) {
    try {
      // Delete alliance doc, admin accounts, players, tasks, assignments
      const playersSnap = await getDocs(query(collection(this.firestore, 'players'), where('allianceId', '==', alliance.id)));
      const tasksSnap   = await getDocs(query(collection(this.firestore, 'tasks'),   where('allianceId', '==', alliance.id)));
      const assignSnap  = await getDocs(query(collection(this.firestore, 'assignments'), where('allianceId', '==', alliance.id)));

      await Promise.all([
        ...playersSnap.docs.map(d => deleteDoc(d.ref)),
        ...tasksSnap.docs.map(d => deleteDoc(d.ref)),
        ...assignSnap.docs.map(d => deleteDoc(d.ref)),
        this.allianceService.deleteAccountsByAlliance(alliance.id),
        this.allianceService.deleteAlliance(alliance.id),
      ]);

      this.pendingDeleteId = null;
      this.snackBar.open(`"${alliance.name}" and all its data deleted`, 'Close', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Failed to delete alliance', 'Close', { duration: 3000 });
    }
  }

  navigateTo(allianceId: string) {
    this.router.navigate(['/admin', allianceId]);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
