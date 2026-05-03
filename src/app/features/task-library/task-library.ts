import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlanService } from '../../core/services/plan.service';
import { TaskTemplate, MapLocation } from '../../core/models/plan.model';

const COLOR_PALETTE = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
  '#00acc1', '#f06292', '#00897b', '#c0ca33', '#546e7a',
  '#ff7043', '#5c6bc0'
];

interface PriorityLocationEntry {
  id: string;
  name: string;
  included: boolean;
}

@Component({
  selector: 'app-task-library',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatListModule, MatCheckboxModule,
    MatSlideToggleModule, MatSnackBarModule, DragDropModule
  ],
  templateUrl: './task-library.html',
  styleUrl: './task-library.scss'
})
export class TaskLibrary implements OnInit {
  private fb          = inject(FormBuilder);
  private planService = inject(PlanService);
  private snackBar    = inject(MatSnackBar);
  private route       = inject(ActivatedRoute);
  private destroyRef  = inject(DestroyRef);

  allianceId!: string;
  // Editable tasks (excludes the synthetic teleport task).
  tasks$!: Observable<TaskTemplate[]>;
  // Whether the alliance currently has the teleport task enabled.
  teleportEnabled$!: Observable<boolean>;

  private currentTasks: TaskTemplate[] = [];
  editingTask: TaskTemplate | null = null;

  // Priority locations editor state — drag-reorderable list with checkboxes.
  priorityLocations: PriorityLocationEntry[] = [];

  taskForm = this.fb.group({
    name:                  ['', Validators.required],
    description:           [''],
    maxPlayersPerLocation: [null as number | null, Validators.min(1)],
    playerAtLocation:      [false]
  });

  ngOnInit() {
    this.allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    const allTasks$ = this.planService.getTasksByAlliance(this.allianceId);

    this.tasks$ = allTasks$.pipe(
      map(tasks => tasks
        .filter(t => !t.isTeleport)
        .sort((a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
          || a.name.localeCompare(b.name)
        )
      )
    );
    this.tasks$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => this.currentTasks = t);

    this.teleportEnabled$ = allTasks$.pipe(map(tasks => tasks.some(t => t.isTeleport)));

    // Initialize priority editor with all non-global locations, all included.
    this.priorityLocations = this.defaultPriorityLocations();
  }

  // ── Priority editor helpers ────────────────────────────────────────────

  private defaultPriorityLocations(): PriorityLocationEntry[] {
    return this.planService.MAP_LOCATIONS
      .filter(l => l.type !== 'global')
      .map(l => ({ id: l.id, name: l.name, included: true }));
  }

  private buildPriorityFromTask(task: TaskTemplate): PriorityLocationEntry[] {
    const allLocs: MapLocation[] = this.planService.MAP_LOCATIONS.filter(l => l.type !== 'global');
    const ids = task.priorityLocationIds ?? [];
    // Ordered: priority list first (in saved order), then leftover locations
    // shown as un-included.
    const ordered: PriorityLocationEntry[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const loc = allLocs.find(l => l.id === id);
      if (loc) {
        ordered.push({ id: loc.id, name: loc.name, included: true });
        seen.add(loc.id);
      }
    }
    for (const loc of allLocs) {
      if (!seen.has(loc.id)) ordered.push({ id: loc.id, name: loc.name, included: false });
    }
    // If task has no priorityLocationIds yet, treat as "all included" default.
    if (ids.length === 0) return this.defaultPriorityLocations();
    return ordered;
  }

  onPriorityDrop(event: CdkDragDrop<PriorityLocationEntry[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.priorityLocations];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.priorityLocations = next;
  }

  togglePriorityIncluded(id: string, included: boolean) {
    this.priorityLocations = this.priorityLocations.map(p =>
      p.id === id ? { ...p, included } : p
    );
  }

  // ── Task drag-and-drop reordering ──────────────────────────────────────

  async onDrop(event: CdkDragDrop<TaskTemplate[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const reordered = [...this.currentTasks];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.currentTasks = reordered;
    try {
      await this.planService.reorderTasks(reordered.map(t => t.id));
    } catch (err) {
      console.error(err);
      this.snackBar.open('Failed to save new order', 'Close', { duration: 3000 });
    }
  }

  // ── Edit / save / delete ───────────────────────────────────────────────

  startEditTask(task: TaskTemplate) {
    this.editingTask = task;
    this.taskForm.setValue({
      name:                  task.name,
      description:           task.description ?? '',
      maxPlayersPerLocation: task.maxPlayersPerLocation ?? null,
      playerAtLocation:      task.playerAtLocation ?? false
    });
    this.priorityLocations = this.buildPriorityFromTask(task);
  }

  cancelEdit() {
    this.editingTask = null;
    this.taskForm.reset({
      name: '', description: '', maxPlayersPerLocation: null, playerAtLocation: false
    });
    this.taskForm.markAsPristine();
    this.taskForm.markAsUntouched();
    this.priorityLocations = this.defaultPriorityLocations();
  }

  async saveTask() {
    if (!this.taskForm.valid) return;
    const val = this.taskForm.value;
    const priorityLocationIds = this.priorityLocations
      .filter(p => p.included)
      .map(p => p.id);

    let task: TaskTemplate;

    if (this.editingTask) {
      task = {
        ...this.editingTask,
        name: val.name!,
        playerAtLocation:    !!val.playerAtLocation,
        priorityLocationIds,
        ...(val.description           ? { description: val.description }                       : {}),
        ...(val.maxPlayersPerLocation ? { maxPlayersPerLocation: val.maxPlayersPerLocation! } : {})
      };
      if (!val.description)           delete task.description;
      if (!val.maxPlayersPerLocation) delete task.maxPlayersPerLocation;
    } else {
      const usedColors = this.currentTasks.map(t => t.color).filter(Boolean) as string[];
      const color = COLOR_PALETTE.find(c => !usedColors.includes(c))
        ?? COLOR_PALETTE[this.currentTasks.length % COLOR_PALETTE.length];
      task = {
        id:          'task_' + Date.now(),
        allianceId:  this.allianceId,
        name:        val.name!,
        color,
        playerAtLocation:    !!val.playerAtLocation,
        priorityLocationIds,
        ...(val.description           ? { description: val.description }                       : {}),
        ...(val.maxPlayersPerLocation ? { maxPlayersPerLocation: val.maxPlayersPerLocation! } : {})
      };
    }

    try {
      const wasEditing = !!this.editingTask;
      await this.planService.saveTask(task);
      this.cancelEdit();
      this.snackBar.open(wasEditing ? 'Task updated' : 'Task created', 'Close', { duration: 2000 });
    } catch (err) {
      console.error(err);
      this.snackBar.open('Error saving task.', 'Close', { duration: 3000 });
    }
  }

  async deleteTask(id: string) {
    await this.planService.deleteTask(id);
  }

  // ── Teleport task toggle ──────────────────────────────────────────────

  async onTeleportToggle(enabled: boolean) {
    try {
      if (enabled) {
        await this.planService.enableTeleportTask(this.allianceId);
        this.snackBar.open('Teleport Location task enabled', 'Close', { duration: 2000 });
      } else {
        await this.planService.disableTeleportTask(this.allianceId);
        this.snackBar.open('Teleport Location task disabled', 'Close', { duration: 2000 });
      }
    } catch (err) {
      console.error(err);
      this.snackBar.open('Error updating teleport task', 'Close', { duration: 3000 });
    }
  }
}
