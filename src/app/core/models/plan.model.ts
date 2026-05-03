export interface TaskTemplate {
  id: string;
  allianceId: string;
  name: string;
  description?: string;
  maxPlayersPerLocation?: number;
  color?: string;
  order?: number;
  // If true, the player physically teleports to (one of) this task's location(s).
  // Drives the synthetic Teleport Location pin: when a player has any
  // playerAtLocation task, their teleport sits at the highest-priority such
  // location they were assigned to. Otherwise it sits at the nearest workshop.
  playerAtLocation?: boolean;
  // Ordered list of allowed locationIds for this task. Highest priority first.
  // Locations not in the list are not allowed for this task.
  priorityLocationIds?: string[];
  // Marks the synthetic, auto-managed "Teleport Location" task (one per
  // alliance). Not editable in the task library; rendered as a black square.
  isTeleport?: boolean;
}

export interface MapLocation {
  id: string;
  name: string;
  x: number; // percentage from left
  y: number; // percentage from top
  type: 'outer' | 'central' | 'workshop' | 'global';
  // Phases in which the location exists. Outer + global = [1, 2];
  // central + workshop only appear in phase 2.
  phases: (1 | 2)[];
}

// Auto-create plan inputs persisted per alliance + legion.
export interface AutoPlanConfig {
  id: string; // `${allianceId}_l${legion}`
  allianceId: string;
  legion: 1 | 2;
  rows: AutoPlanRow[];
}

export interface AutoPlanRow {
  taskId: string;
  playerId: string;
  count: number;
}

export interface Assignment {
  id: string; // assign_${allianceId}_l${legion}_${playerId}_p${phase}_${locationId}
  allianceId: string;
  legion: 1 | 2;
  playerId: string;
  locationId: string;
  taskId: string;
  phase: 1 | 2;
}
