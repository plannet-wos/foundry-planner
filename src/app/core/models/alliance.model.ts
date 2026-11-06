import { TimeKey } from './player.model';

/**
 * A state alliance's saved 50-player roster, picked by a State Admin on the selection page
 * (see features/state-selection and core/utils/state-selection.ts). Lives on the alliance
 * doc rather than on player docs because `players` is open to anyone, while alliance-doc
 * writes are already limited to State Admins of that state by firestore.rules.
 */
export interface StateSelection {
  playerIds: string[];
  /** Players the State Admin locked in: Compute always keeps them. A subset of playerIds. */
  pinnedIds: string[];
  updatedAt: number;
  updatedBy?: string;
}

export interface Alliance {
  id: string;         // "{stateId}-{slug}" composite — see allianceId() below. URL keeps the bare slug; see the rollout plan.
  stateId: string;
  slug: string;        // the bare, human-readable part used in routes, e.g. "eagle"
  name: string;
  /**
   * Absent (or 'alliance') = a normal alliance. 'state_event' = a state-wide event shell —
   * a battle-plan built for a state-wide event, whose player roster is every real alliance
   * in the same state rather than its own signups (there are none — signup.html hides the
   * registration form for these). Replaces the old isCrossAlliance boolean, which had no
   * creation UI (set by hand in Firestore) and whose player query
   * (PlayerService.getPlayersFromOtherAlliances) had no state scoping at all — see the
   * multi-state rollout plan for why that became a real cross-state leak once other states
   * existed. See PlayerService.getPlayersForStateEvent() for the replacement.
   */
  type?: 'alliance' | 'state_event';
  finalTime?: string;  // legacy — superseded by per-legion times below
  finalTimeL1?: string;
  finalTimeL2?: string;
  /** state_event only: the 3 battle slots this state alliance plays, set by a State Admin. */
  battleTimes?: TimeKey[];
  /** state_event only: the selected roster. When set and non-empty, it replaces "every player in the state" as the event's roster. */
  selection?: StateSelection;
  createdAt: number;
}

export function allianceId(stateId: string, slug: string): string {
  return `${stateId}-${slug}`;
}

/** Inverse of allianceId() — recovers the bare slug from a composite ID once the stateId is known (e.g. from an Account doc, to build a route without an extra Firestore read). */
export function allianceSlugFromId(stateId: string, id: string): string {
  return id.slice(stateId.length + 1);
}

// `Account` used to be documented here (the accounts collection's old, username-keyed shape).
// It's now uid-keyed and lives in account.model.ts, mirrored from plannet-wos — see that file.
