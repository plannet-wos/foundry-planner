import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AllianceService } from '../../core/services/alliance.service';
import { PlayerService } from '../../core/services/player.service';
import { AuthService } from '../../core/services/auth.service';
import { Alliance, allianceId } from '../../core/models/alliance.model';
import { Player, TIME_KEYS, TIME_LABEL, TimeKey } from '../../core/models/player.model';
import {
  PLAYERS_PER_TIME, ROSTER_SIZE, comparePriority, computeSelection, coverageOf, shortfallsOf,
} from '../../core/utils/state-selection';

const BATTLE_TIME_COUNT = 3;

/**
 * State Admin page for one state alliance: pick its 3 battle times, compute the 60-player
 * roster (see core/utils/state-selection.ts), adjust it by hand, and save it on the alliance
 * doc. The candidate pool is every player of every real alliance in the state, minus anyone
 * already saved in another state alliance of the same state (a player can only be in one
 * alliance in game).
 */
@Component({
  selector: 'app-state-selection',
  standalone: true,
  imports: [
    DecimalPipe, NgTemplateOutlet, FormsModule, RouterModule,
    MatCardModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
    MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './state-selection.html',
  styleUrl: './state-selection.scss',
})
export class StateSelectionPage implements OnInit {
  private allianceService = inject(AllianceService);
  private playerService = inject(PlayerService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  readonly TIME_KEYS = TIME_KEYS;
  readonly TIME_LABEL = TIME_LABEL;
  readonly ROSTER_SIZE = ROSTER_SIZE;
  readonly PLAYERS_PER_TIME = PLAYERS_PER_TIME;
  readonly BATTLE_TIME_COUNT = BATTLE_TIME_COUNT;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly alliance = signal<Alliance | null>(null);
  readonly players = signal<Player[]>([]);
  readonly allianceNames = signal<Map<string, string>>(new Map());
  /** playerId → name of the other state alliance that already selected them. */
  readonly takenElsewhere = signal<Map<string, string>>(new Map());

  readonly battleTimes = signal<TimeKey[]>([]);
  readonly selectedIds = signal<string[]>([]);
  readonly pinnedIds = signal<Set<string>>(new Set());
  readonly poolFilter = signal('');

  private id = '';

  readonly timesReady = computed(() => this.battleTimes().length === BATTLE_TIME_COUNT);

  readonly selected = computed(() => {
    const ids = new Set(this.selectedIds());
    return this.players().filter((p) => ids.has(p.id)).sort(comparePriority(this.battleTimes()));
  });

  /** Everyone who could still be added: available at a battle time, not selected, not taken elsewhere. */
  readonly pool = computed(() => {
    const times = this.battleTimes();
    const ids = new Set(this.selectedIds());
    const taken = this.takenElsewhere();
    return this.players()
      .filter((p) => !ids.has(p.id) && !taken.has(p.id) && times.some((t) => p.availability?.[t]))
      .sort(comparePriority(times));
  });

  readonly filteredPool = computed(() => {
    const q = this.poolFilter().trim().toLowerCase();
    if (!q) return this.pool();
    return this.pool().filter((p) =>
      p.inGameName.toLowerCase().includes(q) || p.id.includes(q)
      || (this.allianceNames().get(p.allianceId) ?? '').toLowerCase().includes(q));
  });

  readonly coverage = computed(() => coverageOf(this.selected(), this.battleTimes()));
  readonly shortfalls = computed(() => shortfallsOf(this.coverage(), this.battleTimes()));
  readonly missingScores = computed(() =>
    [...this.selected(), ...this.pool()].filter((p) => p.labyrinthScore == null).length);
  readonly full = computed(() => this.selected().length >= ROSTER_SIZE);

  async ngOnInit() {
    const stateId = this.route.snapshot.paramMap.get('stateId')!;
    this.id = allianceId(stateId, this.route.snapshot.paramMap.get('allianceSlug')!);
    try {
      const [alliance, stateAlliances, players] = await Promise.all([
        this.allianceService.getAlliance(this.id),
        firstValueFrom(this.allianceService.listForState$(stateId)),
        this.playerService.getPlayersForStateEvent(stateId, this.id),
      ]);
      this.alliance.set(alliance);
      this.players.set(players);
      this.allianceNames.set(new Map(stateAlliances.map((a) => [a.id, a.name])));

      const taken = new Map<string, string>();
      for (const other of stateAlliances) {
        if (other.id === this.id || other.type !== 'state_event') continue;
        for (const pid of other.selection?.playerIds ?? []) taken.set(pid, other.name);
      }
      this.takenElsewhere.set(taken);

      this.battleTimes.set(alliance?.battleTimes ?? []);
      this.selectedIds.set(alliance?.selection?.playerIds ?? []);
      this.pinnedIds.set(new Set(alliance?.selection?.pinnedIds ?? []));
    } catch (e) {
      console.error('Failed to load state alliance selection', e);
      this.snackBar.open('Failed to load players', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  isTimeChosen(t: TimeKey) {
    return this.battleTimes().includes(t);
  }

  toggleTime(t: TimeKey, checked: boolean) {
    const times = this.battleTimes().filter((x) => x !== t);
    if (checked) times.push(t);
    this.battleTimes.set(TIME_KEYS.filter((k) => times.includes(k)));
    this.dirty.set(true);
  }

  compute() {
    const taken = this.takenElsewhere();
    const candidates = this.players().filter((p) => !taken.has(p.id));
    const result = computeSelection(candidates, this.battleTimes(), [...this.pinnedIds()]);
    this.selectedIds.set(result.playerIds);
    this.dirty.set(true);
  }

  add(p: Player) {
    if (this.full()) return;
    this.selectedIds.update((ids) => [...ids, p.id]);
    this.dirty.set(true);
  }

  remove(p: Player) {
    this.selectedIds.update((ids) => ids.filter((id) => id !== p.id));
    this.pinnedIds.update((s) => { const n = new Set(s); n.delete(p.id); return n; });
    this.dirty.set(true);
  }

  togglePin(p: Player) {
    this.pinnedIds.update((s) => {
      const n = new Set(s);
      if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
      return n;
    });
    this.dirty.set(true);
  }

  isPinned(p: Player) {
    return this.pinnedIds().has(p.id);
  }

  allianceName(p: Player) {
    return this.allianceNames().get(p.allianceId) ?? p.allianceId;
  }

  async save() {
    this.saving.set(true);
    try {
      // Drop ids of players who no longer exist, so the saved roster matches what's shown.
      const playerIds = this.selected().map((p) => p.id);
      const kept = new Set(playerIds);
      await this.allianceService.saveStateSelection(this.id, this.battleTimes(), {
        playerIds,
        pinnedIds: [...this.pinnedIds()].filter((id) => kept.has(id)),
        updatedAt: Date.now(),
        updatedBy: this.auth.account()?.uid ?? '',
      });
      this.dirty.set(false);
      this.snackBar.open('Selection saved', 'Close', { duration: 2000 });
    } catch (e) {
      console.error('Failed to save selection', e);
      this.snackBar.open('Failed to save selection', 'Close', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }
}
