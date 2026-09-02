export interface Alliance {
  id: string;         // "{stateId}-{slug}" composite — see allianceId() below. URL keeps the bare slug; see the rollout plan.
  stateId: string;
  slug: string;        // the bare, human-readable part used in routes, e.g. "eagle"
  name: string;
  finalTime?: string;  // legacy — superseded by per-legion times below
  finalTimeL1?: string;
  finalTimeL2?: string;
  isCrossAlliance?: boolean;  // true = uses players from other alliances
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
