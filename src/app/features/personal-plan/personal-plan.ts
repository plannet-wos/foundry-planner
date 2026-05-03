import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MapViewer } from '../../shared/map-viewer/map-viewer';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance } from '../../core/models/alliance.model';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlanService } from '../../core/services/plan.service';
import { PlayerService } from '../../core/services/player.service';
import { Assignment, MapLocation, TaskTemplate } from '../../core/models/plan.model';
import { Player } from '../../core/models/player.model';

const SESSION_KEY = 'fp_player_id';

@Component({
  selector: 'app-personal-plan',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatButtonToggleModule, MatIconModule, MatListModule,
    MapViewer
  ],
  templateUrl: './personal-plan.html',
  styleUrl: './personal-plan.scss'
})
export class PersonalPlan implements OnInit {
  private planService     = inject(PlanService);
  private playerService   = inject(PlayerService);
  private allianceService = inject(AllianceService);
  private route           = inject(ActivatedRoute);
  private destroyRef      = inject(DestroyRef);

  private alliance: Alliance | null = null;

  searchId      = '';
  activeId      = '';
  playerName    = '';
  searchError   = false;
  personalPhase: 1 | 2 = 1;

  private personalPhase$ = new BehaviorSubject<1 | 2>(1);
  private searchId$      = new BehaviorSubject<string>('');
  private currentPlayers: Player[] = [];

  assignments$!: Observable<Assignment[]>;
  tasks$!:       Observable<TaskTemplate[]>;
  players$!:     Observable<Player[]>;
  locations:     MapLocation[] = this.planService.MAP_LOCATIONS;

  battleInfo$!: Observable<{ legion: number; time: string } | null>;

  personalAssignments$!: Observable<{
    phase: 1 | 2; location: MapLocation | undefined;
    locationName: string; taskName: string; taskDesc: string; taskColor: string;
    isTeleport: boolean;
  }[] | null>;

  async ngOnInit() {
    const allianceId  = this.route.snapshot.paramMap.get('allianceId')!;
    this.assignments$ = this.planService.getAssignmentsByAlliance(allianceId);
    this.tasks$       = this.planService.getTasksByAlliance(allianceId);
    this.players$     = this.playerService.getPlayersByAlliance(allianceId);

    this.alliance = await this.allianceService.getAlliance(allianceId);

    this.battleInfo$ = combineLatest([this.players$, this.searchId$]).pipe(
      map(([players, id]) => {
        if (!id || !this.alliance) return null;
        const player = players.find(p => p.id === id);
        if (!player || !player.legion || player.legion === 'unassigned') return null;
        const legionNum = Number(player.legion);
        if (legionNum !== 1 && legionNum !== 2) return null;
        const time = legionNum === 1
          ? this.alliance.finalTimeL1
          : this.alliance.finalTimeL2;
        if (!time) return null;
        return { legion: legionNum, time };
      })
    );

    // Cache player list for ID validation
    this.players$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(players => this.currentPlayers = players);

    this.personalAssignments$ = combineLatest([
      this.assignments$, this.tasks$, this.personalPhase$, this.searchId$
    ]).pipe(
      map(([assignments, tasks, phase, searchId]) => {
        if (!searchId) return null;
        return assignments
          .filter(a => a.playerId === searchId && a.phase === phase)
          .map(a => {
            const loc  = this.locations.find(l => l.id === a.locationId);
            const task = tasks.find(t => t.id === a.taskId);
            return {
              phase:        a.phase,
              location:     loc,
              locationName: loc?.name || 'Unknown',
              taskName:     task?.name || 'Unknown Task',
              taskDesc:     task?.description || '',
              taskColor:    task?.color || '#757575',
              isTeleport:   !!task?.isTeleport
            };
          });
      })
    );

    // Resolve player name for display
    combineLatest([this.players$, this.searchId$]).pipe(
      takeUntilDestroyed(this.destroyRef),
      map(([players, id]) => players.find(p => p.id === id)?.inGameName ?? '')
    ).subscribe(name => this.playerName = name);

    // Restore saved player ID from session
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      this.searchId = saved;
      this.applySearch(saved);
    }
  }

  search() {
    const id = this.searchId.trim();
    if (!id) return;

    const found = this.currentPlayers.find(p => p.id === id);
    if (!found) {
      this.searchError = true;
      return;
    }

    this.searchError = false;
    sessionStorage.setItem(SESSION_KEY, id);
    this.applySearch(id);
  }

  clearPlayer() {
    sessionStorage.removeItem(SESSION_KEY);
    this.searchId   = '';
    this.activeId   = '';
    this.playerName = '';
    this.searchError = false;
    this.searchId$.next('');
  }

  setPersonalPhase(phase: 1 | 2) {
    this.personalPhase = phase;
    this.personalPhase$.next(phase);
  }

  private applySearch(id: string) {
    this.activeId = id;
    this.searchId$.next(id);
  }
}
