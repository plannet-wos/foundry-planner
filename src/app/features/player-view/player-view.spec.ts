import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerView } from './player-view';

describe('PlayerView', () => {
  let component: PlayerView;
  let fixture: ComponentFixture<PlayerView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerView],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerView);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
