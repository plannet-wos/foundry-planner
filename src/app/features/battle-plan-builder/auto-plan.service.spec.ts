import { TestBed } from '@angular/core/testing';
import { AutoPlanService } from './auto-plan.service';
import { PlanService } from '../../core/services/plan.service';
import { AutoPlanRow, MapLocation, TaskTemplate } from '../../core/models/plan.model';

// Four phase-1 locations in a row; priority order = loc1 first.
const LOCS: MapLocation[] = [1, 2, 3, 4].map(i => ({
  id: `loc${i}`, name: `Loc ${i}`, x: i * 10, y: 50, type: 'outer', phases: [1, 2],
}));

const TASK: TaskTemplate = {
  id: 'rally', allianceId: 'a', name: 'Rally', order: 0,
  maxPlayersPerLocation: 1, priorityLocationIds: LOCS.map(l => l.id),
  rankByStrength: true,
};

describe('AutoPlanService labyrinth score ordering', () => {
  let service: AutoPlanService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PlanService, useValue: { MAP_LOCATIONS: LOCS } }],
    });
    service = TestBed.inject(AutoPlanService);
  });

  function phase1Picks(
    rows: string[],
    tier: Record<string, 'whale' | 'dolphin' | undefined>,
    score: Record<string, number | undefined>,
    task: TaskTemplate = TASK,
  ): Record<string, string> {
    const r = service.generate({
      allianceId: 'a', legion: 1,
      rows: rows.map((playerId): AutoPlanRow => ({ taskId: task.id, playerId, count: 1 })),
      tasks: [task],
      playerName: id => id,
      playerTier: id => tier[id],
      labyrinthScore: id => score[id],
    });
    return Object.fromEntries(r.proposed.filter(a => a.phase === 1).map(a => [a.playerId, a.locationId]));
  }

  it('lets a higher score pick first within a tier, overriding row order', () => {
    const picks = phase1Picks(
      ['lowWhale', 'highWhale', 'dolphin'],
      { lowWhale: 'whale', highWhale: 'whale', dolphin: 'dolphin' },
      { lowWhale: 100, highWhale: 500, dolphin: 900 },
    );
    expect(picks).toEqual({ highWhale: 'loc1', lowWhale: 'loc2', dolphin: 'loc3' });
  });

  it('keeps whales ahead of dolphins regardless of score', () => {
    const picks = phase1Picks(
      ['dolphin', 'whale'],
      { whale: 'whale', dolphin: 'dolphin' },
      { whale: 1, dolphin: 9999 },
    );
    expect(picks).toEqual({ whale: 'loc1', dolphin: 'loc2' });
  });

  it('puts unscored players after scored ones, and keeps row order on ties', () => {
    const picks = phase1Picks(
      ['unscored', 'tieA', 'tieB', 'scored'],
      { unscored: 'whale', tieA: 'whale', tieB: 'whale', scored: 'whale' },
      { tieA: 300, tieB: 300, scored: 400 },
    );
    expect(picks).toEqual({ scored: 'loc1', tieA: 'loc2', tieB: 'loc3', unscored: 'loc4' });
  });

  it('lets the strongest whale take all their spots before the next whale', () => {
    const r = service.generate({
      allianceId: 'a', legion: 1,
      rows: [{ taskId: TASK.id, playerId: 'weak', count: 1 }, { taskId: TASK.id, playerId: 'strong', count: 3 }],
      tasks: [TASK], playerName: id => id,
      playerTier: () => 'whale', labyrinthScore: id => (id === 'strong' ? 900 : 100),
    });
    const p1 = r.proposed.filter(a => a.phase === 1);
    expect(p1.filter(a => a.playerId === 'strong').map(a => a.locationId)).toEqual(['loc1', 'loc2', 'loc3']);
    expect(p1.filter(a => a.playerId === 'weak').map(a => a.locationId)).toEqual(['loc4']);
  });

  it('ignores score for players without a tier', () => {
    const picks = phase1Picks(
      ['first', 'second'],
      {},
      { first: 1, second: 9999 },
    );
    expect(picks).toEqual({ first: 'loc1', second: 'loc2' });
  });

  it('uses only row order on tasks without "strongest players first"', () => {
    const picks = phase1Picks(
      ['dolphin', 'lowWhale', 'highWhale'],
      { lowWhale: 'whale', highWhale: 'whale', dolphin: 'dolphin' },
      { lowWhale: 100, highWhale: 500, dolphin: 900 },
      { ...TASK, rankByStrength: false },
    );
    expect(picks).toEqual({ dolphin: 'loc1', lowWhale: 'loc2', highWhale: 'loc3' });
  });
});

describe('AutoPlanService spreading and locality', () => {
  let service: AutoPlanService;
  // A west cluster (w1, w2 close together) and a far east building (e1).
  const MAP: MapLocation[] = [
    { id: 'w1', name: 'W1', x: 10, y: 50, type: 'outer', phases: [1, 2] },
    { id: 'e1', name: 'E1', x: 90, y: 50, type: 'outer', phases: [1, 2] },
    { id: 'w2', name: 'W2', x: 20, y: 50, type: 'outer', phases: [1, 2] },
  ];
  const JOIN: TaskTemplate = {
    id: 'join', allianceId: 'a', name: 'Joiner', order: 0,
    maxPlayersPerLocation: 1, priorityLocationIds: MAP.map(l => l.id),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PlanService, useValue: { MAP_LOCATIONS: MAP } }],
    });
    service = TestBed.inject(AutoPlanService);
  });

  function run(rows: AutoPlanRow[], tier: Record<string, 'whale' | 'dolphin'> = {}, task = JOIN) {
    const r = service.generate({
      allianceId: 'a', legion: 1, rows, tasks: [task],
      playerName: id => id, playerTier: id => tier[id],
    });
    const p1 = r.proposed.filter(a => a.phase === 1);
    const locs = (id: string) => p1.filter(a => a.playerId === id).map(a => a.locationId).sort();
    return { locs, notPlaced: r.notPlaced.filter(n => n.phase === 1) };
  }

  it('on strength-ranked tasks, lets whales take all their spots before dolphins', () => {
    const { locs } = run(
      [{ taskId: 'join', playerId: 'dolphin', count: 1 }, { taskId: 'join', playerId: 'whale', count: 3 }],
      { whale: 'whale', dolphin: 'dolphin' },
      { ...JOIN, rankByStrength: true },
    );
    expect(locs('whale')).toEqual(['e1', 'w1', 'w2']);
    expect(locs('dolphin')).toEqual([]);
  });

  it('on strength-ranked tasks, takes the top building, then the closest ones', () => {
    const { locs } = run(
      [{ taskId: 'join', playerId: 'whale', count: 2 }, { taskId: 'join', playerId: 'dolphin', count: 1 }],
      { whale: 'whale', dolphin: 'dolphin' },
      { ...JOIN, rankByStrength: true },
    );
    // w1 is top priority; w2 is next to it, e1 (2nd priority) is across the map.
    expect(locs('whale')).toEqual(['w1', 'w2']);
    expect(locs('dolphin')).toEqual(['e1']);
  });

  it('on grouped tasks, shares the work before anyone gets an extra spot', () => {
    const { locs } = run(
      [{ taskId: 'join', playerId: 'a', count: 3 }, { taskId: 'join', playerId: 'b', count: 3 },
       { taskId: 'join', playerId: 'c', count: 1 }],
      {}, { ...JOIN, maxPlayersPerLocation: 1 },
    );
    // 3 slots for 3 players: one each, a and b don't take c's spot.
    expect([locs('a'), locs('b'), locs('c')].map(l => l.length)).toEqual([1, 1, 1]);
  });

  it('never gives one player locations at opposite ends of the map', () => {
    const { locs, notPlaced } = run([{ taskId: 'join', playerId: 'p', count: 3 }]);
    expect(locs('p')).toEqual(['w1', 'w2']);
    expect(notPlaced.map(n => n.reason)).toEqual(["No free location near this player's other locations"]);
  });

  it('puts a player left without any spot in as an extra joiner, past the max', () => {
    const CAP: TaskTemplate = { ...JOIN, id: 'cap', name: 'Captain', order: 0, rankByStrength: true,
                                priorityLocationIds: ['w1'] };
    const join: TaskTemplate = { ...JOIN, order: 1 };
    const r = service.generate({
      allianceId: 'a', legion: 1, tasks: [CAP, join], playerName: id => id,
      rows: [{ taskId: 'cap', playerId: 'c1', count: 1 }, { taskId: 'cap', playerId: 'c2', count: 1 },
             { taskId: 'join', playerId: 'j1', count: 1 }, { taskId: 'join', playerId: 'j2', count: 1 },
             { taskId: 'join', playerId: 'j3', count: 1 }],
    });
    const p1 = r.proposed.filter(a => a.phase === 1);
    // c2 has no captain building left; all 3 joiner spots are taken, so c2
    // still joins, at the least-full building.
    expect(p1.filter(a => a.playerId === 'c2').map(a => [a.taskId, a.locationId])).toEqual([['join', 'w1']]);
    expect(new Set(p1.map(a => a.playerId)).size).toBe(5);
  });

  it('gives a "player at location" grouped task one location per player', () => {
    const { locs } = run([{ taskId: 'join', playerId: 'g', count: 3 }], {}, { ...JOIN, playerAtLocation: true });
    expect(locs('g')).toEqual(['w1']);
  });
});

