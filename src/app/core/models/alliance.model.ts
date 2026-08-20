export interface Alliance {
  id: string;        // URL-safe slug — used as Firestore doc ID and route param
  name: string;
  finalTime?: string;  // legacy — superseded by per-legion times below
  finalTimeL1?: string;
  finalTimeL2?: string;
  isCrossAlliance?: boolean;  // true = uses players from other alliances
  createdAt: number;
}

/**
 * Shape of a document in the `accounts` collection. Not read or written
 * directly by app code anymore — the collection is fully unreadable and its
 * writes are gated by a password-hash proof (see firestore.rules and
 * auth.service.ts). Kept here as documentation of what's actually stored.
 */
export interface Account {
  id: string;            // username, also the doc ID
  username: string;
  passwordHash: string;  // PBKDF2-SHA256, salt derived from username — see password.util.ts
  allianceId?: string;   // alliance-admin accounts
  role?: 'superadmin';   // the one superadmin account has this instead of allianceId
  lastLoginAt?: number;
}
