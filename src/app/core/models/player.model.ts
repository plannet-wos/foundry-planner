export interface PlayerAvailability {
  time_2: boolean;
  time_7: boolean;
  time_12: boolean;
  time_14: boolean;
  time_19: boolean;
}

/** One of the five Foundry battle slots, as stored on PlayerAvailability. */
export type TimeKey = keyof PlayerAvailability;

export const TIME_KEYS: TimeKey[] = ['time_2', 'time_7', 'time_12', 'time_14', 'time_19'];

export const TIME_LABEL: Record<TimeKey, string> = {
  time_2: '02:00',
  time_7: '07:00',
  time_12: '12:00',
  time_14: '14:00',
  time_19: '19:00',
};

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
  /** Labyrinth score, entered by the player's own R4/R5. Drives state-alliance selection
   *  priority (higher first); omitted = no score yet, ranked as 0. */
  labyrinthScore?: number;
  legionByAlliance?: { [allianceId: string]: 1 | 2 | 'unassigned' };  // For cross-alliance events
  tierByAlliance?: { [allianceId: string]: PlayerTier };              // For cross-alliance events
  createdAt?: number;
}
