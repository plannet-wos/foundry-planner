import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MapViewer } from '../../shared/map-viewer/map-viewer';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlanService } from '../../core/services/plan.service';
import { PlayerService } from '../../core/services/player.service';
import { Assignment, MapLocation, TaskTemplate } from '../../core/models/plan.model';
import { Player } from '../../core/models/player.model';

@Component({
  selector: 'app-global-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonToggleModule, MatIconModule, MatListModule, MapViewer],
  templateUrl: './global-plan.html',
  styleUrl: './global-plan.scss'
})
export class GlobalPlan implements OnInit {
  private planService   = inject(PlanService);
  private playerService = inject(PlayerService);
  private route         = inject(ActivatedRoute);

  private readonly PHASE_1_LOCKED = new Set([
    'loc_mercenary', 'loc_forge', 'loc_munitions',
    'loc_arsenal_1', 'loc_arsenal_2', 'loc_arsenal_3', 'loc_arsenal_4'
  ]);

  globalPhase:  1 | 2 = 1;
  globalLegion: 1 | 2 = 1;

  private globalPhase$  = new BehaviorSubject<1 | 2>(1);
  private globalLegion$ = new BehaviorSubject<1 | 2>(1);

  assignments$!: Observable<Assignment[]>;
  tasks$!:       Observable<TaskTemplate[]>;
  players$!:     Observable<Player[]>;
  locations:     MapLocation[] = this.planService.MAP_LOCATIONS;

  locationAssignments$!: Observable<{ location: MapLocation; taskGroups: { taskName: string; players: string[] }[]; hasTeleport: boolean }[]>;

  readonly selectedLocationId$ = new BehaviorSubject<string | null>(null);
  selectedLocationAssignments$!: Observable<{
    locationName: string;
    phases: { phase: 1 | 2; taskGroups: { taskName: string; taskColor: string; players: string[] }[] }[];
  } | null>;

  ngOnInit() {
    const allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    this.assignments$ = this.planService.getAssignmentsByAlliance(allianceId);
    this.tasks$       = this.planService.getTasksByAlliance(allianceId);
    this.players$     = this.playerService.getPlayersByAlliance(allianceId);

    this.selectedLocationAssignments$ = combineLatest([
      this.assignments$, this.tasks$, this.players$, this.globalLegion$, this.selectedLocationId$
    ]).pipe(
      map(([assignments, tasks, players, legion, locId]) => {
        if (!locId) return null;
        const loc = this.locations.find(l => l.id === locId);
        const filtered = assignments.filter(a => a.legion === legion && a.locationId === locId);

        // Sort tasks the same way the Task Library does, then use that index
        // as the canonical "task order". This way the overlay always matches
        // the library exactly — including for tasks that have no `order`
        // field saved (which would otherwise fall to name-tiebreak).
        const orderedTasks = [...tasks].sort((a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
          || a.name.localeCompare(b.name)
        );
        const taskIndex = new Map(orderedTasks.map((t, i) => [t.id, i]));

        const buildPhase = (phase: 1 | 2) => {
          const groupMap = new Map<string, { taskName: string; taskColor: string; taskOrder: number; players: string[] }>();
          for (const a of filtered.filter(x => x.phase === phase)) {
            const task = tasks.find(t => t.id === a.taskId);
            if (!groupMap.has(a.taskId)) {
              groupMap.set(a.taskId, {
                taskName:  task?.name ?? a.taskId,
                taskColor: task?.color ?? '#757575',
                taskOrder: taskIndex.get(a.taskId) ?? Number.MAX_SAFE_INTEGER,
                players:   []
              });
            }
            groupMap.get(a.taskId)!.players.push(
              players.find(p => p.id === a.playerId)?.inGameName ?? a.playerId
            );
          }
          return Array.from(groupMap.values())
            .map(g => ({ ...g, players: g.players.sort((x, y) => x.localeCompare(y)) }))
            .sort((x, y) => x.taskOrder - y.taskOrder);
        };

        return {
          locationName: loc?.name ?? 'Unknown',
          phases: [
            { phase: 1 as const, taskGroups: buildPhase(1) },
            { phase: 2 as const, taskGroups: buildPhase(2) }
          ]
        };
      })
    );

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
            const teleIds = new Set(tasks.filter(t => t.isTeleport).map(t => t.id));
            const hasTeleport = locAssignments.some(a => teleIds.has(a.taskId));
            return { location: loc, taskGroups, hasTeleport };
          })
      )
    );
  }

  setGlobalPhase(phase: 1 | 2) {
    this.globalPhase = phase;
    this.globalPhase$.next(phase);
  }

  setGlobalLegion(legion: 1 | 2) {
    this.globalLegion = legion;
    this.globalLegion$.next(legion);
  }

  selectLocation(locationId: string) {
    this.selectedLocationId$.next(
      this.selectedLocationId$.getValue() === locationId ? null : locationId
    );
  }
}
