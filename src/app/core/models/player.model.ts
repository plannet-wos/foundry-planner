export interface PlayerAvailability {
  time_2: boolean;
  time_7: boolean;
  time_12: boolean;
  time_14: boolean;
  time_19: boolean;
}

/** Spending tier — drives auto-plan priority. Whales pick first, then
 *  dolphins, then everyone else. Edited from the admin dashboard. */
export type PlayerTier = 'whale' | 'dolphin';

export interface Player {
  id: string;          // inGameId — Firestore document ID
  inGameName: string;
  allianceId: string;
  availability: PlayerAvailability;
  legion?: 1 | 2 | 'unassigned';
  tier?: PlayerTier;   // omitted = no tier ("everyone else")
  createdAt?: number;
}
