import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PlanService } from '../../../core/services/plan.service';
import { AutoPlanService, AutoPlanResult } from '../auto-plan.service';
import { AutoPlanConfig, AutoPlanRow, Assignment, MapLocation, TaskTemplate } from '../../../core/models/plan.model';
import { Player } from '../../../core/models/player.model';

export interface AutoPlanModalData {
  allianceId: string;
  legion: 1 | 2;
  tasks: TaskTemplate[];        // includes teleport task if enabled
  players: Player[];            // already filtered to this legion
}

interface RowVM extends AutoPlanRow {
  // Local-only id for *ngFor trackBy stability across edits.
  uid: string;
}

interface PreviewGroup {
  phase: 1 | 2;
  taskGroups: {
    taskName: string;
    taskColor: string;
    isTeleport: boolean;
    items: { playerName: string; locationName: string }[];
  }[];
}

@Component({
  selector: 'app-auto-plan-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatIconModule, MatListModule, MatSnackBarModule,
  ],
  templateUrl: './auto-plan-modal.html',
  styleUrl: './auto-plan-modal.scss',
})
export class AutoPlanModal implements OnInit {
  private planService = inject(PlanService);
  private autoPlan    = inject(AutoPlanService);
  private snackBar    = inject(MatSnackBar);

  // Editable tasks (excludes teleport), sorted by library order.
  editableTasks: TaskTemplate[] = [];

  // Per-task row lists keyed by taskId. Order within = priority order.
  rowsByTask: Map<string, RowVM[]> = new Map();

  saving = false;
  generating = false;

  /** When non-null, the modal is in preview mode: show the plan we just
   *  generated and the Accept Plan button. */
  result: AutoPlanResult | null = null;
  /** View-model derived from `result`, grouped by phase → task. */
  preview: PreviewGroup[] = [];

  constructor(
    private dialogRef: MatDialogRef<AutoPlanModal, AutoPlanResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: AutoPlanModalData,
  ) {
    // Lock close-on-backdrop while we're holding generated state, so the
    // admin doesn't lose work by mis-clicking outside the dialog.
    dialogRef.disableClose = true;
  }

  /** localStorage key — auto-mirror of the form so unsaved inputs survive a
   *  page reload, hot-reload, or accidental cancel. Lifecycle independent
   *  of Firestore: cleared explicitly only when the admin hits Cancel and
   *  confirms (or after a successful Accept Plan). */
  private get cacheKey(): string {
    return `fp_autoplan_${this.data.allianceId}_l${this.data.legion}`;
  }

  async ngOnInit() {
    this.editableTasks = this.data.tasks
      .filter(t => !t.isTeleport)
      .sort((a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        || a.name.localeCompare(b.name)
      );

    // Initialize empty row list per task.
    for (const t of this.editableTasks) this.rowsByTask.set(t.id, []);

    // Load order (Firestore wins — explicit Save is the canonical source):
    //   1. Firestore-saved config (last explicitly Saved state)
    //   2. localStorage cache — fallback only if nothing was ever saved.
    // This protects against the cache shadowing a real Save with stale
    // half-edits from a previous session.
    let firestoreRows: AutoPlanRow[] = [];
    try {
      const config = await this.planService.getAutoPlanConfig(this.data.allianceId, this.data.legion);
      if (config) firestoreRows = config.rows;
    } catch (err) {
      console.error('Failed to load auto-plan config', err);
    }

    let cacheRows: AutoPlanRow[] = [];
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { rows?: AutoPlanRow[] };
        if (parsed && Array.isArray(parsed.rows)) cacheRows = parsed.rows;
      }
    } catch (err) {
      console.error('Failed to read auto-plan cache', err);
    }

    const sourceRows = firestoreRows.length > 0 ? firestoreRows : cacheRows;
    for (const r of sourceRows) {
      const list = this.rowsByTask.get(r.taskId);
      if (!list) continue;
      list.push({ ...r, uid: this.uid() });
    }
  }

  /** Persist current form to localStorage. Called on every row change so
   *  even an accidental browser close keeps the inputs recoverable. */
  private mirrorToCache() {
    try {
      const rows = this.collectRows();
      localStorage.setItem(this.cacheKey, JSON.stringify({ rows, ts: Date.now() }));
    } catch (err) {
      // Storage quota or private mode — non-fatal.
      console.warn('auto-plan cache write failed', err);
    }
  }

  private clearCache() {
    try { localStorage.removeItem(this.cacheKey); } catch { /* ignore */ }
  }

  /** Two-way [(ngModel)] mutates `row` in place, so we just need to mirror
   *  on any user action. Called from template (input/change events). */
  onRowChanged() { this.mirrorToCache(); }

  // ── Row mgmt ───────────────────────────────────────────────────────────

  addRow(taskId: string) {
    const list = this.rowsByTask.get(taskId);
    if (!list) return;
    list.push({ taskId, playerId: '', count: 1, uid: this.uid() });
    this.mirrorToCache();
  }

  removeRow(taskId: string, uid: string) {
    const list = this.rowsByTask.get(taskId) ?? [];
    this.rowsByTask.set(taskId, list.filter(r => r.uid !== uid));
    this.mirrorToCache();
  }

  rowsFor(taskId: string): RowVM[] {
    return this.rowsByTask.get(taskId) ?? [];
  }

  trackByUid = (_: number, r: RowVM) => r.uid;
  trackByTaskId = (_: number, t: TaskTemplate) => t.id;

  // ── Save / Generate / Accept / Cancel ──────────────────────────────────

  private collectRows(): AutoPlanRow[] {
    const out: AutoPlanRow[] = [];
    for (const task of this.editableTasks) {
      for (const r of this.rowsFor(task.id)) {
        if (!r.playerId || r.count < 1) continue;
        out.push({ taskId: r.taskId, playerId: r.playerId, count: r.count });
      }
    }
    return out;
  }

  async save() {
    this.saving = true;
    try {
      const config: AutoPlanConfig = {
        id: `${this.data.allianceId}_l${this.data.legion}`,
        allianceId: this.data.allianceId,
        legion: this.data.legion,
        rows: this.collectRows(),
      };
      await this.planService.saveAutoPlanConfig(config);
      this.snackBar.open('Inputs saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error(err);
      this.snackBar.open('Save failed', 'Close', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  generate() {
    this.generating = true;
    try {
      const rows = this.collectRows();
      if (rows.length === 0) {
        this.snackBar.open('Add at least one row before generating', 'Close', { duration: 3000 });
        this.generating = false;
        return;
      }
      const playerNameById = new Map(this.data.players.map(p => [p.id, p.inGameName]));
      const playerTierById = new Map(this.data.players.map(p => [p.id, p.tier]));
      const result = this.autoPlan.generate({
        allianceId: this.data.allianceId,
        legion: this.data.legion,
        rows,
        tasks: this.data.tasks,
        playerName: id => playerNameById.get(id) ?? id,
        playerTier: id => playerTierById.get(id),
      });
      this.result = result;
      this.preview = this.buildPreview(result.proposed);
    } catch (err) {
      console.error(err);
      this.snackBar.open('Generation failed', 'Close', { duration: 3000 });
    } finally {
      this.generating = false;
    }
  }

  /** Switch back from preview to inputs (e.g. to tweak rows and regenerate). */
  backToInputs() {
    this.result = null;
    this.preview = [];
  }

  /** Close, returning the result so the parent can commit it. */
  acceptPlan() {
    if (!this.result) return;
    // Plan is being committed by parent — safe to drop the unsaved-input cache.
    this.clearCache();
    this.dialogRef.close(this.result);
  }

  cancel() {
    this.dialogRef.close(null);
  }

  // ── Preview rendering helpers ──────────────────────────────────────────

  private buildPreview(proposed: Assignment[]): PreviewGroup[] {
    const taskById = new Map(this.data.tasks.map(t => [t.id, t]));
    const locById  = new Map<string, MapLocation>(
      this.planService.MAP_LOCATIONS.map(l => [l.id, l])
    );
    const playerById = new Map(this.data.players.map(p => [p.id, p]));

    const buildOne = (phase: 1 | 2): PreviewGroup => {
      const groups = new Map<string, {
        taskName: string; taskColor: string; isTeleport: boolean; taskOrder: number;
        items: { playerName: string; locationName: string }[];
      }>();

      for (const a of proposed) {
        if (a.phase !== phase) continue;
        const task = taskById.get(a.taskId);
        const loc  = locById.get(a.locationId);
        const player = playerById.get(a.playerId);
        const key = a.taskId;
        if (!groups.has(key)) {
          groups.set(key, {
            taskName:  task?.name ?? a.taskId,
            taskColor: task?.color ?? '#757575',
            isTeleport: !!task?.isTeleport,
            taskOrder: task?.order ?? Number.MAX_SAFE_INTEGER,
            items: [],
          });
        }
        groups.get(key)!.items.push({
          playerName:   player?.inGameName ?? a.playerId,
          locationName: loc?.name ?? a.locationId,
        });
      }

      return {
        phase,
        taskGroups: Array.from(groups.values())
          .map(g => ({
            ...g,
            items: g.items.sort((x, y) => x.playerName.localeCompare(y.playerName)),
          }))
          .sort((x, y) => x.taskOrder - y.taskOrder || x.taskName.localeCompare(y.taskName))
          .map(({ taskOrder: _drop, ...rest }) => rest),
      };
    };

    return [buildOne(1), buildOne(2)];
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private uidCounter = 0;
  private uid(): string { return `r${Date.now()}_${++this.uidCounter}`; }
}
