import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MapViewer } from '../../shared/map-viewer/map-viewer';
import { Observable, combineLatest, BehaviorSubject, firstValueFrom } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { PlanService } from '../../core/services/plan.service';
import { PlayerService } from '../../core/services/player.service';
import { AllianceService } from '../../core/services/alliance.service';
import { TaskTemplate, Assignment, MapLocation } from '../../core/models/plan.model';
import { Player } from '../../core/models/player.model';
import { Alliance } from '../../core/models/alliance.model';
import { AutoPlanModal, AutoPlanModalData } from './auto-plan-modal/auto-plan-modal';
import { AutoPlanResult } from './auto-plan.service';

type GroupBy = 'location' | 'task' | 'player';
type GroupItem = { title: string; subtitle: string; id: string; taskColor: string };
type AssignmentGroup = { label: string; items: GroupItem[]; groupColor?: string };

const COLOR_PALETTE = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
  '#00acc1', '#f06292', '#00897b', '#c0ca33', '#546e7a',
  '#ff7043', '#5c6bc0'
];

@Component({
  selector: 'app-battle-plan-builder',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatButtonToggleModule, MatSelectModule, MatIconModule,
    MatListModule, MatSnackBarModule, MatDialogModule, MapViewer
  ],
  templateUrl: './battle-plan-builder.html',
  styleUrl: './battle-plan-builder.scss'
})
export class BattlePlanBuilder implements OnInit {
  private fb              = inject(FormBuilder);
  private planService     = inject(PlanService);
  private playerService   = inject(PlayerService);
  private allianceService = inject(AllianceService);
  private snackBar        = inject(MatSnackBar);
  private dialog          = inject(MatDialog);
  private route           = inject(ActivatedRoute);
  private destroyRef      = inject(DestroyRef);

  allianceId!: string;
  alliance: Alliance | null = null;

  tasks$!: Observable<TaskTemplate[]>;
  players$!: Observable<Player[]>;
  filteredPlayers$!: Observable<Player[]>;
  allAssignments$!: Observable<Assignment[]>;
  groupedAssignments$!: Observable<AssignmentGroup[]>;
  filteredLocations$!: Observable<MapLocation[]>;

  /** Set of location IDs that have at least one teleport assignment for the
   *  current legion. Drives the small black-square overlay on pins. */
  locationsWithTeleport$!: Observable<Set<string>>;

  readonly currentLegion$ = new BehaviorSubject<1 | 2>(1);
  readonly groupBy$ = new BehaviorSubject<GroupBy>('location');
  readonly selectedLocationId$ = new BehaviorSubject<string | null>(null);
  selectedLocationAssignments$!: Observable<{
    locationName: string;
    phases: { phase: 1 | 2; taskGroups: { taskName: string; taskColor: string; players: { id: string; name: string }[] }[] }[];
  } | null>;
  private currentAssignments: Assignment[] = [];
  private currentTasks: TaskTemplate[] = [];

  private readonly PHASE_2_ONLY = new Set([
    'loc_mercenary', 'loc_forge', 'loc_munitions',
    'loc_arsenal_1', 'loc_arsenal_2', 'loc_arsenal_3', 'loc_arsenal_4'
  ]);

  locations: MapLocation[] = this.planService.MAP_LOCATIONS;

  assignmentForm = this.fb.group({
    playerId:   ['', Validators.required],
    locationId: ['', Validators.required],
    taskId:     ['', Validators.required],
    phase:      [1,  Validators.required]
  });

  async ngOnInit() {
    this.allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    this.alliance   = await this.allianceService.getAlliance(this.allianceId);

    this.tasks$           = this.planService.getTasksByAlliance(this.allianceId);
    this.players$         = this.playerService.getPlayersByAlliance(this.allianceId);
    this.allAssignments$  = this.planService.getAssignmentsByAlliance(this.allianceId);

    this.locationsWithTeleport$ = combineLatest([
      this.allAssignments$, this.tasks$, this.currentLegion$
    ]).pipe(
      map(([assignments, tasks, legion]) => {
        const teleIds = new Set(tasks.filter(t => t.isTeleport).map(t => t.id));
        const out = new Set<string>();
        for (const a of assignments) {
          if (a.legion === legion && teleIds.has(a.taskId)) out.add(a.locationId);
        }
        return out;
      })
    );

    this.filteredPlayers$ = combineLatest([this.players$, this.currentLegion$]).pipe(
      map(([players, legion]) => players
        .filter(p => Number(p.legion) === legion)
        .sort((a, b) => a.inGameName.localeCompare(b.inGameName))
      )
    );

    this.currentLegion$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.assignmentForm.get('playerId')!.reset();
    });

    // Cache for validation
    this.allAssignments$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(a => this.currentAssignments = a);
    this.tasks$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => this.currentTasks = t);

    // Filtered locations by phase
    const phaseControl = this.assignmentForm.get('phase')!;
    this.filteredLocations$ = phaseControl.valueChanges.pipe(
      startWith(phaseControl.value),
      map(phase => {
        const filtered = this.locations.filter(loc => phase === 2 || !this.PHASE_2_ONLY.has(loc.id));
        const currentLoc = this.assignmentForm.get('locationId')!.value;
        if (currentLoc && !filtered.some(l => l.id === currentLoc)) {
          this.assignmentForm.get('locationId')!.reset();
        }
        return filtered;
      })
    );

    // Resolve assignments for display, filtered by current legion
    const resolvedAssignments$ = combineLatest([
      this.allAssignments$, this.tasks$, this.players$, this.currentLegion$
    ]).pipe(
      map(([assignments, tasks, players, legion]) =>
        assignments
          .filter(a => a.legion === legion)
          .map(a => {
            const task = tasks.find(t => t.id === a.taskId);
            return {
              id: a.id,
              phase: a.phase,
              playerName: players.find(p => p.id === a.playerId)?.inGameName ?? a.playerId,
              locationName: this.locations.find(l => l.id === a.locationId)?.name ?? a.locationId,
              taskName: task?.name ?? a.taskId,
              taskColor: task?.color ?? '#757575',
            };
          })
      )
    );

    this.selectedLocationAssignments$ = combineLatest([
      this.allAssignments$, this.tasks$, this.players$, this.currentLegion$, this.selectedLocationId$
    ]).pipe(
      map(([assignments, tasks, players, legion, locId]) => {
        if (!locId) return null;
        const loc = this.locations.find(l => l.id === locId);
        const filtered = assignments.filter(a => a.legion === legion && a.locationId === locId);

        const buildPhase = (phase: 1 | 2) => {
          const groupMap = new Map<string, { taskName: string; taskColor: string; taskOrder: number; players: { id: string; name: string }[] }>();
          for (const a of filtered.filter(x => x.phase === phase)) {
            const task = tasks.find(t => t.id === a.taskId);
            if (!groupMap.has(a.taskId)) {
              groupMap.set(a.taskId, {
                taskName:  task?.name ?? a.taskId,
                taskColor: task?.color ?? '#757575',
                taskOrder: task?.order ?? Number.MAX_SAFE_INTEGER,
                players:   []
              });
            }
            groupMap.get(a.taskId)!.players.push({
              id:   a.id,
              name: players.find(p => p.id === a.playerId)?.inGameName ?? a.playerId
            });
          }
          return Array.from(groupMap.values())
            .map(g => ({ ...g, players: g.players.sort((x, y) => x.name.localeCompare(y.name)) }))
            .sort((x, y) => x.taskOrder - y.taskOrder || x.taskName.localeCompare(y.taskName));
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

    this.groupedAssignments$ = combineLatest([resolvedAssignments$, this.groupBy$]).pipe(
      map(([assignments, groupBy]) => {
        const groups = new Map<string, { items: GroupItem[]; groupColor?: string }>();
        for (const a of assignments) {
          let groupKey: string, title: string, subtitle: string, groupColor: string | undefined;
          if (groupBy === 'location') {
            groupKey = `Phase ${a.phase} · ${a.locationName}`;
            title = a.playerName; subtitle = a.taskName;
          } else if (groupBy === 'task') {
            groupKey = a.taskName; groupColor = a.taskColor;
            title = a.playerName; subtitle = `Phase ${a.phase} · ${a.locationName}`;
          } else {
            groupKey = a.playerName;
            title = `Phase ${a.phase} · ${a.locationName}`; subtitle = a.taskName;
          }
          if (!groups.has(groupKey)) groups.set(groupKey, { items: [], groupColor });
          groups.get(groupKey)!.items.push({ title, subtitle, id: a.id, taskColor: a.taskColor });
        }
        return Array.from(groups.entries())
          .map(([label, { items, groupColor }]) => ({ label, items, groupColor }))
          .sort((a, b) => a.label.localeCompare(b.label));
      })
    );
  }

  setLegion(legion: 1 | 2) {
    this.currentLegion$.next(legion);
  }

  selectLocation(locationId: string) {
    this.selectedLocationId$.next(
      this.selectedLocationId$.getValue() === locationId ? null : locationId
    );
  }

  async createAssignment() {
    if (!this.assignmentForm.valid) return;
    const val    = this.assignmentForm.value;
    const legion = this.currentLegion$.getValue();
    const phaseVal = val.phase as unknown;
    const phases: (1 | 2)[] = phaseVal === 'both' ? [1, 2] : [phaseVal as 1 | 2];
    const task = this.currentTasks.find(t => t.id === val.taskId);

    for (const phase of phases) {
      const dupId = `assign_${this.allianceId}_l${legion}_${val.playerId}_p${phase}_${val.locationId}`;
      if (this.currentAssignments.some(a => a.id === dupId)) {
        this.snackBar.open(`Phase ${phase}: player already assigned at that location.`, 'Close', { duration: 3000 });
        return;
      }
      if (task?.maxPlayersPerLocation != null) {
        const existing = this.currentAssignments.filter(
          a => a.taskId === val.taskId && a.locationId === val.locationId && a.phase === phase && a.legion === legion
        ).length;
        if (existing >= task.maxPlayersPerLocation) {
          this.snackBar.open(
            `Phase ${phase}: "${task.name}" is full at that location.`,
            'Close', { duration: 4000 }
          );
          return;
        }
      }
    }

    try {
      for (const phase of phases) {
        await this.planService.saveAssignment({
          id: `assign_${this.allianceId}_l${legion}_${val.playerId!}_p${phase}_${val.locationId!}`,
          allianceId: this.allianceId,
          legion,
          playerId:   val.playerId!,
          locationId: val.locationId!,
          taskId:     val.taskId!,
          phase
        });
      }
      this.snackBar.open(
        phases.length > 1 ? 'Assignments created for both phases' : 'Assignment created',
        'Close', { duration: 2000 }
      );
    } catch (err) {
      console.error(err);
    }
  }

  async deleteAssignment(id: string) {
    await this.planService.deleteAssignment(id);
  }

  // ── Auto-plan modal ────────────────────────────────────────────────────

  async openAutoPlan() {
    const legion  = this.currentLegion$.getValue();
    const players = await firstValueFrom(this.filteredPlayers$);
    const tasks   = await firstValueFrom(this.tasks$);

    const ref = this.dialog.open<AutoPlanModal, AutoPlanModalData, AutoPlanResult | null>(
      AutoPlanModal,
      {
        data: { allianceId: this.allianceId, legion, tasks, players },
        width: '720px',
        maxHeight: '90vh',
      }
    );

    // The modal returns a result only when the admin clicked "Accept Plan".
    // At that point we overwrite the legion's assignments.
    ref.afterClosed().subscribe(async result => {
      if (!result) return;
      try {
        await this.planService.deleteAssignmentsForLegion(this.allianceId, result.legion);
        await Promise.all(result.proposed.map(a => this.planService.saveAssignment(a)));
        const msg = result.notPlaced.length > 0
          ? `Plan applied · ${result.notPlaced.length} slot${result.notPlaced.length === 1 ? '' : 's'} not placed`
          : 'Plan applied';
        this.snackBar.open(msg, 'Close', { duration: 3000 });
      } catch (err) {
        console.error(err);
        this.snackBar.open('Failed to apply plan', 'Close', { duration: 3000 });
      }
    });
  }
}
