import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AutoPlanModal, AutoPlanModalData } from './auto-plan-modal';
import { PlanService } from '../../../core/services/plan.service';
import { Player } from '../../../core/models/player.model';

function player(id: string, tier?: 'whale' | 'dolphin', labyrinthScore?: number): Player {
  return {
    id, inGameName: id, allianceId: 'a', tier, labyrinthScore,
    availability: { time_2: false, time_7: false, time_12: true, time_14: true, time_19: true },
  };
}

describe('AutoPlanModal one-click rows', () => {
  let modal: AutoPlanModal;

  beforeEach(() => {
    const data: AutoPlanModalData = {
      allianceId: 'a', legion: 1,
      tasks: [{ id: 'cap', allianceId: 'a', name: 'Garrison Captain' }],
      players: [
        player('lowDolphin', 'dolphin', 100),
        player('joinerB'),
        player('highDolphin', 'dolphin', 900),
        player('whale', 'whale', 50),
        player('joinerA', undefined, 10),
      ],
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlanService, useValue: { MAP_LOCATIONS: [] } },
        { provide: MatDialogRef, useValue: { disableClose: false, close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    modal = TestBed.createComponent(AutoPlanModal).componentInstance;
    modal.rowsByTask.set('cap', []);
  });

  const ids = () => modal.rowsFor('cap').map(r => r.playerId);

  it('adds whales, then dolphins by labyrinth score', () => {
    modal.addGroup('cap', 'tiered');
    expect(ids()).toEqual(['whale', 'highDolphin', 'lowDolphin']);
    expect(modal.rowsFor('cap').every(r => r.count === 1)).toBe(true);
  });

  it('adds everyone without a tier, and skips players already in the task', () => {
    modal.addGroup('cap', 'untiered');
    modal.addGroup('cap', 'untiered');
    expect(ids()).toEqual(['joinerA', 'joinerB']);
  });

  it('clears a task', () => {
    modal.addGroup('cap', 'tiered');
    modal.clearRows('cap');
    expect(ids()).toEqual([]);
  });
});
