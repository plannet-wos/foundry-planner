import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PlayerService } from '../../core/services/player.service';
import { PlanService } from '../../core/services/plan.service';
import { AllianceService } from '../../core/services/alliance.service';
import { AuthService } from '../../core/services/auth.service';
import { Player, PlayerTier } from '../../core/models/player.model';
import { Alliance } from '../../core/models/alliance.model';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { EditPlayerDialog, EditPlayerDialogResult } from './edit-player-dialog';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatTableModule, MatCardModule, MatButtonModule,
    MatButtonToggleModule, MatSelectModule, MatFormFieldModule,
    MatIconModule, MatSnackBarModule, MatDialogModule, MatChipsModule
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard implements OnInit {
  private playerService   = inject(PlayerService);
  private planService     = inject(PlanService);
  private allianceService = inject(AllianceService);
  private auth            = inject(AuthService);
  private snackBar        = inject(MatSnackBar);
  private dialog          = inject(MatDialog);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);

  allianceId!: string;
  alliance: Alliance | null = null;
  players$!: Observable<Player[]>;
  sortedPlayers$!: Observable<Player[]>;
  sortKey = new BehaviorSubject<'name' | 'legion'>('name');

  displayedColumns: string[] = ['inGameName', 'inGameId', 't2', 't7', 't12', 't14', 't19', 'tier', 'legion', 'actions'];

  finalTimeL1     = '';
  finalTimeL2     = '';
  timeConflict    = false;
  pendingDeleteId: string | null = null;

  async ngOnInit() {
    this.allianceId  = this.route.snapshot.paramMap.get('allianceId')!;
    this.players$    = this.playerService.getPlayersByAlliance(this.allianceId);
    this.sortedPlayers$ = combineLatest([this.players$, this.sortKey]).pipe(
      map(([players, key]) => this.sortPlayers(players, key))
    );
    this.alliance    = await this.allianceService.getAlliance(this.allianceId);
    this.finalTimeL1 = this.alliance?.finalTimeL1 ?? '';
    this.finalTimeL2 = this.alliance?.finalTimeL2 ?? '';
    this.timeConflict = this.checkConflict();
  }

  private sortPlayers(players: Player[], key: 'name' | 'legion'): Player[] {
    return [...players].sort((a, b) => {
      if (key === 'name') {
        return a.inGameName.localeCompare(b.inGameName);
      }
      const legionOrder = (l: 1 | 2 | 'unassigned' | undefined) => {
        const v = String(l ?? 'unassigned');
        return v === '1' ? 0 : v === '2' ? 1 : 2;
      };
      const diff = legionOrder(a.legion) - legionOrder(b.legion);
      return diff !== 0 ? diff : a.inGameName.localeCompare(b.inGameName);
    });
  }

  onTimeChange() {
    this.timeConflict = this.checkConflict();
  }

  private checkConflict(): boolean {
    return !!(this.finalTimeL1 && this.finalTimeL2 && this.finalTimeL1 === this.finalTimeL2);
  }

  async saveFinalTimes() {
    try {
      await this.allianceService.updateAlliance(this.allianceId, {
        finalTimeL1: this.finalTimeL1,
        finalTimeL2: this.finalTimeL2
      });
      this.snackBar.open('Battle times saved', 'Close', { duration: 2000 });
    } catch (e) {
      this.snackBar.open('Failed to save battle times', 'Close', { duration: 3000 });
    }
  }

  async setLegion(
    playerId: string,
    previousLegion: 1 | 2 | 'unassigned' | undefined,
    legion: 1 | 2 | 'unassigned'
  ) {
    try {
      await this.playerService.updatePlayerLegion(playerId, legion);
      // If the player was previously on a real legion (1 or 2) and that
      // legion has actually changed, scrub their stale assignments from
      // the legion they just left so they don't linger in personal /
      // global plans (a recurring source of bug reports).
      // Stored legion can be either number or string ("1"/"2") in the wild,
      // so normalize before comparing.
      const prevNum = Number(previousLegion);
      const newNum  = Number(legion);
      if ((prevNum === 1 || prevNum === 2) && prevNum !== newNum) {
        await this.planService.deletePlayerAssignmentsInLegion(
          playerId, this.allianceId, prevNum as 1 | 2
        );
      }
    } catch (e) {
      console.error('Failed to update legion', e);
    }
  }

  async setTier(playerId: string, value: PlayerTier | 'none') {
    try {
      await this.playerService.updatePlayerTier(playerId, value === 'none' ? null : value);
    } catch (e) {
      console.error('Failed to update tier', e);
    }
  }

  openEditDialog(player: Player) {
    const ref = this.dialog.open(EditPlayerDialog, { data: { player } });
    ref.afterClosed().subscribe(async (result: EditPlayerDialogResult | undefined) => {
      if (!result) return;
      try {
        await this.playerService.savePlayer({ ...player, ...result });
        this.snackBar.open(`${result.inGameName} updated`, 'Close', { duration: 2000 });
      } catch (e) {
        this.snackBar.open('Failed to update player', 'Close', { duration: 3000 });
      }
    });
  }

  requestDelete(playerId: string) {
    this.pendingDeleteId = playerId;
  }

  cancelDelete() {
    this.pendingDeleteId = null;
  }

  async confirmDelete(player: Player) {
    try {
      await Promise.all([
        this.playerService.deletePlayer(player.id),
        this.planService.deletePlayerAssignments(player.id, this.allianceId)
      ]);
      this.pendingDeleteId = null;
      this.snackBar.open(`${player.inGameName} deleted`, 'Close', { duration: 3000 });
    } catch (e) {
      this.snackBar.open('Failed to delete player', 'Close', { duration: 3000 });
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
