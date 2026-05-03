import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BattlePlanBuilder } from './battle-plan-builder';

describe('BattlePlanBuilder', () => {
  let component: BattlePlanBuilder;
  let fixture: ComponentFixture<BattlePlanBuilder>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattlePlanBuilder],
    }).compileComponents();

    fixture = TestBed.createComponent(BattlePlanBuilder);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
