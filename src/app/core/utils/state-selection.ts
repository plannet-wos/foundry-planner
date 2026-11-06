import { Player, TimeKey } from '../models/player.model';

export const ROSTER_SIZE = 50;
export const PLAYERS_PER_TIME = 30;

export interface SelectionResult {
  playerIds: string[];
  /** How many selected players are available at each battle time. */
  coverage: Partial<Record<TimeKey, number>>;
  /** Times that still have fewer than PLAYERS_PER_TIME available, with how many are missing. */
  shortfalls: { time: TimeKey; missing: number }[];
}

const score = (p: Player) => p.labyrinthScore ?? 0;
const availableAt = (p: Player, t: TimeKey) => !!p.availability?.[t];
const timesAvailable = (p: Player, times: TimeKey[]) => times.filter((t) => availableAt(p, t)).length;

/** Priority order: labyrinth score, then players available at more of the battle times, then name. */
export function comparePriority(times: TimeKey[]) {
  return (a: Player, b: Player) =>
    score(b) - score(a)
    || timesAvailable(b, times) - timesAvailable(a, times)
    || a.inGameName.localeCompare(b.inGameName)
    || a.id.localeCompare(b.id);
}

export function coverageOf(players: Player[], times: TimeKey[]): Partial<Record<TimeKey, number>> {
  const coverage: Partial<Record<TimeKey, number>> = {};
  for (const t of times) coverage[t] = players.filter((p) => availableAt(p, t)).length;
  return coverage;
}

export function shortfallsOf(coverage: Partial<Record<TimeKey, number>>, times: TimeKey[], perTime = PLAYERS_PER_TIME) {
  return times
    .filter((t) => (coverage[t] ?? 0) < perTime)
    .map((t) => ({ time: t, missing: perTime - (coverage[t] ?? 0) }));
}

/**
 * Picks the state alliance roster: up to `size` players, favouring the highest labyrinth
 * scores, while making sure at least `perTime` of them are available at each battle time.
 *
 * 1. Pinned players are always kept.
 * 2. The rest is filled in priority order (see comparePriority) from players available at
 *    at least one of the battle times.
 * 3. While a time is short, the best unselected player available at that time is swapped in
 *    for the lowest-priority unpinned player who isn't available then, as long as the swap
 *    doesn't leave any other time worse off or below `perTime`. Every swap strictly reduces
 *    the total shortfall, so this terminates.
 * 4. A time that the pool simply can't cover is reported in `shortfalls`.
 */
export function computeSelection(
  pool: Player[],
  times: TimeKey[],
  pinnedIds: string[] = [],
  size = ROSTER_SIZE,
  perTime = PLAYERS_PER_TIME,
): SelectionResult {
  const byPriority = [...pool].sort(comparePriority(times));
  const pinned = new Set(pinnedIds);

  const selected: Player[] = byPriority.filter((p) => pinned.has(p.id));
  const selectedIds = new Set(selected.map((p) => p.id));
  for (const p of byPriority) {
    if (selected.length >= size) break;
    if (selectedIds.has(p.id) || timesAvailable(p, times) === 0) continue;
    selected.push(p);
    selectedIds.add(p.id);
  }

  const count = (t: TimeKey) => selected.filter((p) => availableAt(p, t)).length;

  let improved = true;
  while (improved) {
    improved = false;
    for (const t of times) {
      if (count(t) >= perTime) continue;

      const candidates = byPriority.filter((p) => !selectedIds.has(p.id) && availableAt(p, t));
      if (candidates.length === 0) continue;

      if (selected.length < size) {
        selected.push(candidates[0]);
        selectedIds.add(candidates[0].id);
        improved = true;
        continue;
      }

      const removable = [...selected]
        .sort(comparePriority(times))
        .reverse() // lowest priority first
        .filter((p) => !pinned.has(p.id) && !availableAt(p, t));

      // The swap may not make any other time worse than it is, or push it below perTime.
      const keepsOthers = (out: Player, inc: Player) => times.every((u) => {
        const before = count(u);
        const after = before - (availableAt(out, u) ? 1 : 0) + (availableAt(inc, u) ? 1 : 0);
        return after >= Math.min(before, perTime);
      });

      let swap: [Player, Player] | undefined;
      for (const inc of candidates) {
        const out = removable.find((p) => keepsOthers(p, inc));
        if (out) { swap = [out, inc]; break; }
      }
      if (!swap) continue;

      const [out, inc] = swap;
      selected.splice(selected.indexOf(out), 1);
      selectedIds.delete(out.id);
      selected.push(inc);
      selectedIds.add(inc.id);
      improved = true;
    }
  }

  const ordered = selected.sort(comparePriority(times));
  const coverage = coverageOf(ordered, times);
  return {
    playerIds: ordered.map((p) => p.id),
    coverage,
    shortfalls: shortfallsOf(coverage, times, perTime),
  };
}
