import { Player, TimeKey } from '../models/player.model';
import { computeSelection } from './state-selection';

const TIMES: TimeKey[] = ['time_12', 'time_14', 'time_19'];

let seq = 0;
function player(score: number | undefined, times: TimeKey[], name?: string): Player {
  const id = String(++seq).padStart(4, '0');
  return {
    id,
    inGameName: name ?? `p${id}`,
    allianceId: '3038-a',
    labyrinthScore: score,
    availability: {
      time_2: false, time_7: false,
      time_12: times.includes('time_12'),
      time_14: times.includes('time_14'),
      time_19: times.includes('time_19'),
    },
  };
}

function many(n: number, score: (i: number) => number, times: TimeKey[]): Player[] {
  return Array.from({ length: n }, (_, i) => player(score(i), times));
}

describe('computeSelection', () => {
  it('takes the top 60 by labyrinth score when coverage is already fine', () => {
    const pool = many(80, (i) => 1000 - i, TIMES);
    const r = computeSelection(pool, TIMES);
    expect(r.playerIds).toEqual(pool.slice(0, 60).map((p) => p.id));
    expect(r.coverage).toEqual({ time_12: 60, time_14: 60, time_19: 60 });
    expect(r.shortfalls).toEqual([]);
  });

  it('swaps in lower-scored players to reach 30 at a short time', () => {
    const strong = many(60, (i) => 1000 - i, ['time_12', 'time_14']); // nobody at 19
    const at19 = many(40, (i) => 100 - i, ['time_19']);
    const r = computeSelection([...strong, ...at19], TIMES);

    expect(r.playerIds.length).toBe(60);
    expect(r.coverage['time_19']).toBe(30);
    expect(r.coverage['time_12']).toBe(30);
    expect(r.shortfalls).toEqual([]);
    // The best 30 of the strong group stay; the best 30 of the 19:00 group come in.
    expect(r.playerIds).toEqual(expect.arrayContaining(strong.slice(0, 30).map((p) => p.id)));
    expect(r.playerIds).toEqual(expect.arrayContaining(at19.slice(0, 30).map((p) => p.id)));
  });

  it('prefers swapping out a player whose removal keeps other times covered', () => {
    const only12 = many(30, (i) => 900 - i, ['time_12']);
    const only14 = many(30, (i) => 800 - i, ['time_14']);
    const at19 = many(5, (i) => 10 - i, ['time_19', 'time_12', 'time_14']);
    const r = computeSelection([...only12, ...only14, ...at19], TIMES);
    // 19:00 can only ever reach 5, but 12:00 and 14:00 must not drop below 30.
    expect(r.coverage['time_12']).toBeGreaterThanOrEqual(30);
    expect(r.coverage['time_14']).toBeGreaterThanOrEqual(30);
    expect(r.coverage['time_19']).toBe(5);
    expect(r.shortfalls).toEqual([{ time: 'time_19', missing: 25 }]);
  });

  it('reports a shortfall when the pool cannot cover a time', () => {
    const pool = [...many(70, (i) => 500 - i, ['time_12', 'time_14']), ...many(12, () => 1, ['time_19'])];
    const r = computeSelection(pool, TIMES);
    expect(r.coverage['time_19']).toBe(12);
    expect(r.shortfalls).toEqual([{ time: 'time_19', missing: 18 }]);
    expect(r.playerIds.length).toBe(60);
  });

  it('always keeps pinned players, even low-scored ones', () => {
    const pool = many(80, (i) => 1000 - i, TIMES);
    const low = pool[79];
    const r = computeSelection(pool, TIMES, [low.id]);
    expect(r.playerIds).toContain(low.id);
    expect(r.playerIds.length).toBe(60);
    expect(r.playerIds).not.toContain(pool[59].id);
  });

  it('never swaps out a pinned player to fix coverage', () => {
    const pinnedPlayers = many(60, (i) => 1000 - i, ['time_12', 'time_14']);
    const at19 = many(30, () => 1, ['time_19']);
    const r = computeSelection([...pinnedPlayers, ...at19], TIMES, pinnedPlayers.map((p) => p.id));
    expect(r.playerIds.sort()).toEqual(pinnedPlayers.map((p) => p.id).sort());
    expect(r.shortfalls).toEqual([{ time: 'time_19', missing: 30 }]);
  });

  it('ignores players not available at any battle time', () => {
    const pool = [player(9999, []), ...many(10, () => 1, TIMES)];
    const r = computeSelection(pool, TIMES);
    expect(r.playerIds).not.toContain(pool[0].id);
    expect(r.playerIds.length).toBe(10);
  });

  it('breaks score ties by number of available times, then by name', () => {
    const b = player(50, ['time_12'], 'Bravo');
    const a = player(50, ['time_12'], 'Alpha');
    const flexible = player(50, TIMES, 'Zulu');
    const r = computeSelection([b, a, flexible], TIMES, [], 2);
    expect(r.playerIds).toEqual([flexible.id, a.id]);
  });

  it('ranks players without a score last', () => {
    const none = player(undefined, TIMES);
    const some = player(1, TIMES);
    const r = computeSelection([none, some], TIMES, [], 1);
    expect(r.playerIds).toEqual([some.id]);
  });
});
