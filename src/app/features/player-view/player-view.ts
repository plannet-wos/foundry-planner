import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlanService } from '../../core/services/plan.service';
import { PlayerService } from '../../core/services/player.service';
import { AllianceService } from '../../core/services/alliance.service';
import { Assignment, MapLocation, TaskTemplate } from '../../core/models/plan.model';
import { Player } from '../../core/models/player.model';
import { Alliance } from '../../core/models/alliance.model';

@Component({
  selector: 'app-player-view',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatButtonToggleModule, MatTabsModule, MatListModule
  ],
  templateUrl: './player-view.html',
  styleUrl: './player-view.scss'
})
export class PlayerView implements OnInit {
  private planService     = inject(PlanService);
  private playerService   = inject(PlayerService);
  private allianceService = inject(AllianceService);
  private route           = inject(ActivatedRoute);

  allianceId!: string;
  alliance: Alliance | null = null;

  private readonly PHASE_1_LOCKED = new Set([
    'loc_mercenary', 'loc_forge', 'loc_munitions',
    'loc_arsenal_1', 'loc_arsenal_2', 'loc_arsenal_3', 'loc_arsenal_4'
  ]);

  searchId = '';
  personalPhase: 1 | 2 = 1;
  globalPhase:   1 | 2 = 1;
  globalLegion:  1 | 2 = 1;

  private personalPhase$ = new BehaviorSubject<1 | 2>(1);
  private globalPhase$   = new BehaviorSubject<1 | 2>(1);
  private globalLegion$  = new BehaviorSubject<1 | 2>(1);
  private searchId$      = new BehaviorSubject<string>('');

  assignments$!: Observable<Assignment[]>;
  tasks$!:       Observable<TaskTemplate[]>;
  players$!:     Observable<Player[]>;
  locations:     MapLocation[] = this.planService.MAP_LOCATIONS;

  personalAssignments$!: Observable<{ phase: 1 | 2; location: MapLocation | undefined; locationName: string; taskName: string; taskDesc: string; taskColor: string }[] | null>;
  locationAssignments$!: Observable<{ location: MapLocation; taskGroups: { taskName: string; players: string[] }[] }[]>;

  async ngOnInit() {
    this.allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    this.alliance   = await this.allianceService.getAlliance(this.allianceId);

    this.assignments$ = this.planService.getAssignmentsByAlliance(this.allianceId);
    this.tasks$       = this.planService.getTasksByAlliance(this.allianceId);
    this.players$     = this.playerService.getPlayersByAlliance(this.allianceId);

    // Global map: filtered by phase + legion
    this.locationAssignments$ = combineLatest([
      this.assignments$, this.tasks$, this.players$, this.globalPhase$, this.globalLegion$
    ]).pipe(
      map(([assignments, tasks, players, phase, legion]) =>
        this.locations
          .filter(loc => phase === 2 || !this.PHASE_1_LOCKED.has(loc.id))
          .map(loc => {
            const locAssignments = assignments.filter(a =>
              a.locationId === loc.id && a.phase === phase && a.legion === legion
            );
            const taskGroups = locAssignments.reduce((acc, a) => {
              const taskName   = tasks.find(t => t.id === a.taskId)?.name ?? a.taskId;
              const playerName = players.find(p => p.id === a.playerId)?.inGameName ?? a.playerId;
              const group = acc.find(g => g.taskName === taskName);
              if (group) group.players.push(playerName);
              else acc.push({ taskName, players: [playerName] });
              return acc;
            }, [] as { taskName: string; players: string[] }[]);
            return { location: loc, taskGroups };
          })
      )
    );

    // Personal plan: filtered by playerId + phase
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
              taskColor:    task?.color || '#757575'
            };
          });
      })
    );
  }

  search() {
    if (!this.searchId) return;
    this.searchId$.next(this.searchId);
  }

  setPersonalPhase(phase: 1 | 2) {
    this.personalPhase = phase;
    this.personalPhase$.next(phase);
  }

  setGlobalPhase(phase: 1 | 2) {
    this.globalPhase = phase;
    this.globalPhase$.next(phase);
  }

  setGlobalLegion(legion: 1 | 2) {
    this.globalLegion = legion;
    this.globalLegion$.next(legion);
  }
}
