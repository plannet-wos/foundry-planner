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
  ): Record<string, string> {
    const r = service.generate({
      allianceId: 'a', legion: 1,
      rows: rows.map((playerId): AutoPlanRow => ({ taskId: TASK.id, playerId, count: 1 })),
      tasks: [TASK],
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

  it('ignores score for players without a tier', () => {
    const picks = phase1Picks(
      ['first', 'second'],
      {},
      { first: 1, second: 9999 },
    );
    expect(picks).toEqual({ first: 'loc1', second: 'loc2' });
  });
});
