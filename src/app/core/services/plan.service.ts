import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, collectionData, getDocs, getDoc, query, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TaskTemplate, Assignment, MapLocation, AutoPlanConfig } from '../models/plan.model';

@Injectable({ providedIn: 'root' })
export class PlanService {
  private firestore = inject(Firestore);
  private tasksCollection       = collection(this.firestore, 'tasks');
  private assignmentsCollection = collection(this.firestore, 'assignments');
  private autoPlanConfigsCollection = collection(this.firestore, 'autoPlanConfigs');

  // Synthetic, auto-managed Teleport Location task — one per alliance.
  static readonly TELEPORT_TASK_NAME  = 'Teleport Location';
  static readonly TELEPORT_TASK_COLOR = '#000000';
  static readonly TELEPORT_TASK_LIMIT = 999;
  static teleportTaskId(allianceId: string): string {
    return `task_teleport_${allianceId}`;
  }

  // Hardcoded map locations for Foundry Battle.
  // Phase rule: central + workshop appear only in phase 2; outer + global in both.
  readonly MAP_LOCATIONS: MapLocation[] = [
    // Central — phase 2 only
    { id: 'loc_forge',      name: 'Imperial Foundry',    x: 50,   y: 50,   type: 'central',  phases: [2]    },
    { id: 'loc_mercenary',  name: 'Mercenary Camp',      x: 49.5, y: 27.5, type: 'central',  phases: [2]    },
    { id: 'loc_munitions',  name: 'Munitions Warehouse', x: 49.5, y: 68.5, type: 'central',  phases: [2]    },
    // Outer — both phases
    { id: 'loc_boiler',     name: 'Boiler Room',         x: 34,   y: 13.7, type: 'outer',    phases: [1, 2] },
    { id: 'loc_repair_4',   name: 'Repair Facility IV',  x: 65.4, y: 13.7, type: 'outer',    phases: [1, 2] },
    { id: 'loc_proto_1',    name: 'Prototype Site I',    x: 17,   y: 40,   type: 'outer',    phases: [1, 2] },
    { id: 'loc_repair_1',   name: 'Repair Facility I',   x:  9,   y: 51.7, type: 'outer',    phases: [1, 2] },
    { id: 'loc_repair_2',   name: 'Repair Facility II',  x: 90,   y: 44,   type: 'outer',    phases: [1, 2] },
    { id: 'loc_proto_2',    name: 'Prototype Site II',   x: 82,   y: 58,   type: 'outer',    phases: [1, 2] },
    { id: 'loc_repair_3',   name: 'Repair Facility III', x: 33.1, y: 81.7, type: 'outer',    phases: [1, 2] },
    { id: 'loc_transit',    name: 'Transit Station',     x: 65.5, y: 81.7, type: 'outer',    phases: [1, 2] },
    // Workshop / Arsenal — phase 2 only
    { id: 'loc_arsenal_1',  name: 'Arsenal Supplies NW', x: 29,   y: 32,   type: 'workshop', phases: [2]    },
    { id: 'loc_arsenal_2',  name: 'Arsenal Supplies NE', x: 69,   y: 37,   type: 'workshop', phases: [2]    },
    { id: 'loc_arsenal_3',  name: 'Arsenal Supplies SW', x: 26,   y: 64,   type: 'workshop', phases: [2]    },
    { id: 'loc_arsenal_4',  name: 'Arsenal Supplies SE', x: 68,   y: 66,   type: 'workshop', phases: [2]    },
    // Global — both phases, no map pin
    { id: 'loc_global',     name: 'Global',              x:  0,   y:  0,   type: 'global',   phases: [1, 2] },
  ];

  // Tasks — scoped to alliance (shared between Legion 1 and Legion 2)
  getTasksByAlliance(allianceId: string): Observable<TaskTemplate[]> {
    return collectionData(
      query(this.tasksCollection, where('allianceId', '==', allianceId)),
      { idField: 'id' }
    ) as Observable<TaskTemplate[]>;
  }

  async saveTask(task: TaskTemplate): Promise<void> {
    await setDoc(doc(this.firestore, `tasks/${task.id}`), task, { merge: true });
  }

  async reorderTasks(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, index) =>
      setDoc(doc(this.firestore, `tasks/${id}`), { order: index }, { merge: true })
    ));
  }

  async deleteTask(taskId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `tasks/${taskId}`));
  }

  // Assignments — scoped to alliance (both legions)
  getAssignmentsByAlliance(allianceId: string): Observable<Assignment[]> {
    return collectionData(
      query(this.assignmentsCollection, where('allianceId', '==', allianceId)),
      { idField: 'id' }
    ) as Observable<Assignment[]>;
  }

  async saveAssignment(assignment: Assignment): Promise<void> {
    await setDoc(doc(this.firestore, `assignments/${assignment.id}`), assignment, { merge: true });
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `assignments/${assignmentId}`));
  }

  async deletePlayerAssignments(playerId: string, allianceId: string): Promise<void> {
    const q = query(
      this.assignmentsCollection,
      where('playerId', '==', playerId),
      where('allianceId', '==', allianceId)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  // Delete every assignment a single player has in a specific legion (both
  // phases). Used when a player is moved off a legion (legion change or
  // unassigned) so stale rows don't linger and pollute personal/global plans.
  async deletePlayerAssignmentsInLegion(
    playerId: string, allianceId: string, legion: 1 | 2
  ): Promise<void> {
    const q = query(
      this.assignmentsCollection,
      where('allianceId', '==', allianceId),
      where('playerId',   '==', playerId),
      where('legion',     '==', legion)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  // Delete every assignment for a legion (both phases). Used by auto-plan
  // accept-flow before writing the freshly generated plan.
  async deleteAssignmentsForLegion(allianceId: string, legion: 1 | 2): Promise<void> {
    const q = query(
      this.assignmentsCollection,
      where('allianceId', '==', allianceId),
      where('legion', '==', legion)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  // ── Synthetic Teleport Location task ─────────────────────────────────────

  async enableTeleportTask(allianceId: string): Promise<void> {
    const id = PlanService.teleportTaskId(allianceId);
    const task: TaskTemplate = {
      id,
      allianceId,
      name: PlanService.TELEPORT_TASK_NAME,
      color: PlanService.TELEPORT_TASK_COLOR,
      maxPlayersPerLocation: PlanService.TELEPORT_TASK_LIMIT,
      isTeleport: true,
      // Allow every map location (auto-plan picks workshops or player-at-loc
      // buildings; admins never edit this list).
      priorityLocationIds: this.MAP_LOCATIONS
        .filter(l => l.type !== 'global')
        .map(l => l.id),
    };
    await setDoc(doc(this.firestore, `tasks/${id}`), task, { merge: true });
  }

  async disableTeleportTask(allianceId: string): Promise<void> {
    const id = PlanService.teleportTaskId(allianceId);
    // Delete the task itself…
    await deleteDoc(doc(this.firestore, `tasks/${id}`));
    // …and any assignments that referenced it.
    const q = query(
      this.assignmentsCollection,
      where('allianceId', '==', allianceId),
      where('taskId', '==', id)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  // ── Auto-plan config (per alliance + legion) ─────────────────────────────

  async getAutoPlanConfig(allianceId: string, legion: 1 | 2): Promise<AutoPlanConfig | null> {
    const id = `${allianceId}_l${legion}`;
    const snap = await getDoc(doc(this.firestore, `autoPlanConfigs/${id}`));
    return snap.exists() ? (snap.data() as AutoPlanConfig) : null;
  }

  async saveAutoPlanConfig(config: AutoPlanConfig): Promise<void> {
    await setDoc(
      doc(this.firestore, `autoPlanConfigs/${config.id}`),
      config,
      { merge: true }
    );
  }
}
