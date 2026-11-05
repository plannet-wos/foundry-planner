import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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
import { Alliance, allianceId } from '../../core/models/alliance.model';
import { BehaviorSubject, combineLatest, Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { RANK } from '../../core/constants/roles';
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
  private cdr             = inject(ChangeDetectorRef);

  allianceId!: string;
  alliance: Alliance | null = null;
  players$!: Observable<Player[]>;
  sortedPlayers$!: Observable<Player[]>;
  sortKey = new BehaviorSubject<'name' | 'legion'>('name');

  displayedColumns: string[] = ['inGameName', 'inGameId', 'labyrinth', 'stateEvent', 't2', 't7', 't12', 't14', 't19', 'tier', 'legion', 'actions'];

  finalTimeL1     = '';
  finalTimeL2     = '';
  timeConflict    = false;
  pendingDeleteId: string | null = null;
  /** False for an R4/R5 viewing a state alliance: only State Admins and up change its roster. */
  canEdit         = true;

  async ngOnInit() {
    this.allianceId = allianceId(
      this.route.snapshot.paramMap.get('stateId')!,
      this.route.snapshot.paramMap.get('allianceSlug')!,
    );
    this.alliance   = await this.allianceService.getAlliance(this.allianceId);
    const rank = this.auth.rank();
    this.canEdit = this.alliance?.type !== 'state_event' || (rank !== null && rank <= RANK.STATE_ADMIN);
    if (!this.canEdit) this.displayedColumns = this.displayedColumns.filter(c => c !== 'actions');
    // State alliances always play with a single legion, so there's nothing to assign.
    if (this.alliance?.type === 'state_event') this.displayedColumns = this.displayedColumns.filter(c => c !== 'legion');

    // Load players based on alliance type
    if (this.alliance?.type === 'state_event') {
      // State event: roster is every real alliance's players in the same state.
      this.players$ = from(this.playerService.getPlayersForStateEvent(this.alliance.stateId, this.allianceId, this.alliance.selection?.playerIds));
    } else {
      // Normal alliance: load only players for this alliance
      this.players$ = this.playerService.getPlayersByAlliance(this.allianceId);
    }

    this.sortedPlayers$ = combineLatest([this.players$, this.sortKey]).pipe(
      map(([players, key]) => this.sortPlayers(players, key))
    );
    this.finalTimeL1 = this.alliance?.finalTimeL1 ?? '';
    this.finalTimeL2 = this.alliance?.finalTimeL2 ?? '';
    this.timeConflict = this.checkConflict();
    // Zoneless: async ngOnInit resumes outside any CD trigger, so property
    // assignments above don't repaint. Nudge CD so the async pipe subscribes
    // to the freshly-assigned sortedPlayers$ immediately.
    this.cdr.markForCheck();
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
      // Get the correct legion value for each player
      const aLegion = this.alliance?.type === 'state_event' ? a.legionByAlliance?.[this.allianceId] : a.legion;
      const bLegion = this.alliance?.type === 'state_event' ? b.legionByAlliance?.[this.allianceId] : b.legion;
      const diff = legionOrder(aLegion) - legionOrder(bLegion);
      return diff !== 0 ? diff : a.inGameName.localeCompare(b.inGameName);
    });
  }

  onTimeChange() {
    this.timeConflict = this.checkConflict();
  }

  private checkConflict(): boolean {
    if (this.alliance?.type === 'state_event') return false;
    return !!(this.finalTimeL1 && this.finalTimeL2 && this.finalTimeL1 === this.finalTimeL2);
  }

  async saveFinalTimes() {
    try {
      await this.allianceService.updateAlliance(this.allianceId, this.alliance?.type === 'state_event'
        ? { finalTimeL1: this.finalTimeL1 }
        : { finalTimeL1: this.finalTimeL1, finalTimeL2: this.finalTimeL2 });
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
      // For cross-alliance events, use alliance-specific update
      if (this.alliance?.type === 'state_event') {
        await this.playerService.updatePlayerLegionInAlliance(playerId, this.allianceId, legion);
      } else {
        await this.playerService.updatePlayerLegion(playerId, legion);
      }

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
      // For cross-alliance events, use alliance-specific update
      if (this.alliance?.type === 'state_event') {
        await this.playerService.updatePlayerTierInAlliance(playerId, this.allianceId, value === 'none' ? null : value);
      } else {
        await this.playerService.updatePlayerTier(playerId, value === 'none' ? null : value);
      }
    } catch (e) {
      console.error('Failed to update tier', e);
    }
  }

  openEditDialog(player: Player) {
    const ref = this.dialog.open(EditPlayerDialog, { data: { player } });
    ref.afterClosed().subscribe(async (result: EditPlayerDialogResult | undefined) => {
      if (!result) return;
      try {
        // labyrinthScore goes through its own write so clearing it really removes the field
        // (a merge write of the old player object would put the old score straight back).
        const { labyrinthScore, ...edits } = result;
        const { labyrinthScore: _previous, ...base } = player;
        await this.playerService.savePlayer({ ...base, ...edits });
        await this.playerService.updateLabyrinthScore(player.id, labyrinthScore);
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
      // For cross-alliance events, only delete assignments; don't delete the player record
      if (this.alliance?.type === 'state_event') {
        await this.planService.deletePlayerAssignments(player.id, this.allianceId);
        this.snackBar.open(`${player.inGameName} removed from event`, 'Close', { duration: 3000 });
      } else {
        // Normal alliance: delete both player and assignments
        await Promise.all([
          this.playerService.deletePlayer(player.id),
          this.planService.deletePlayerAssignments(player.id, this.allianceId)
        ]);
        this.snackBar.open(`${player.inGameName} deleted`, 'Close', { duration: 3000 });
      }
      this.pendingDeleteId = null;
    } catch (e) {
      this.snackBar.open('Failed to delete player', 'Close', { duration: 3000 });
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  /** Get the effective league for a player in the current alliance context */
  getPlayerLegion(player: Player): 1 | 2 | 'unassigned' {
    if (this.alliance?.type === 'state_event') {
      return player.legionByAlliance?.[this.allianceId] ?? 'unassigned';
    }
    return player.legion ?? 'unassigned';
  }

  /** Get the effective tier for a player in the current alliance context */
  getPlayerTier(player: Player): PlayerTier | undefined {
    if (this.alliance?.type === 'state_event') {
      return player.tierByAlliance?.[this.allianceId];
    }
    return player.tier;
  }
}
