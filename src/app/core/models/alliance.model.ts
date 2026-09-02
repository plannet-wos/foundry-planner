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
