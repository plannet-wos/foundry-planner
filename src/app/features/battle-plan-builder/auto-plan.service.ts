import { Injectable, inject } from '@angular/core';
import {
  Assignment,
  AutoPlanRow,
  MapLocation,
  TaskTemplate,
} from '../../core/models/plan.model';
import { PlanService } from '../../core/services/plan.service';

/**
 * Result of an auto-plan run, kept fully in memory until the admin accepts.
 *
 * `proposed` is the candidate assignment list (regular tasks + teleport
 * pseudo-task). `notPlaced` describes input slots that could not be
 * satisfied (out of capacity, no allowed location, etc.) so the admin
 * can see them in the preview summary.
 */
export interface AutoPlanResult {
  legion: 1 | 2;
  proposed: Assignment[];
  notPlaced: NotPlaced[];
}

interface Point { x: number; y: number; }

export interface NotPlaced {
  taskId: string;
  taskName: string;
  playerId: string;
  playerName: string;
  phase: 1 | 2;
  reason: string;
}

interface AlgoContext {
  allianceId: string;
  legion: 1 | 2;
  tasks: TaskTemplate[];                // editable tasks, library order, no teleport
  teleportTask: TaskTemplate | null;    // null → don't generate teleport markers
  locations: MapLocation[];             // all map locations (incl. global)
  playerName: (id: string) => string;
  /** Lower rank = higher priority. whale=0, dolphin=1, none=2. */
  tierRank: (id: string) => number;
  /** Labyrinth score per player; undefined = no score entered. */
  labyrinthScore: (id: string) => number | undefined;
}

/**
 * Stateless auto-plan algorithm. Runs both phases for one legion. Honours:
 *
 *  - per-task `priorityLocationIds` (order = priority, missing locs are excluded)
 *  - per-task `maxPlayersPerLocation`
 *  - phase availability of locations (phase-2-only buildings)
 *  - `rankByStrength` tasks (captains): strongest player takes all their
 *    spots on the top-priority buildings first, then the next (whales,
 *    dolphins by labyrinth score, rest) — see fillByStrength
 *  - everyone in the inputs gets at least one spot per phase (extra joiner
 *    if their own task can't place them) — see the end of runPhase
 *  - other tasks (joiners): grouped fill — each player's spots stay within
 *    MAX_SPREAD of each other, the work is shared, and phase 1 locations are
 *    preferred again in phase 2; slots still empty are then filled from
 *    FILL_SPREAD, or by swapping a nearby joiner over — see fillGrouped
 *  - teleport pseudo-task: highest-priority `playerAtLocation` slot per
 *    player, else nearest workshop to the player's centroid
 */
@Injectable({ providedIn: 'root' })
export class AutoPlanService {
  private planService = inject(PlanService);

  generate(args: {
    allianceId: string;
    legion: 1 | 2;
    rows: AutoPlanRow[];                          // input rows in priority order
    tasks: TaskTemplate[];                        // alliance tasks (any order ok; we sort)
    playerName: (id: string) => string;
    /** Spending tier per player. On `rankByStrength` tasks whales take all
     *  their spots before dolphins before none; elsewhere it is ignored. */
    playerTier?: (id: string) => 'whale' | 'dolphin' | undefined;
    /** Labyrinth score per player. On `rankByStrength` tasks, within the
     *  whale and dolphin tiers a higher score picks first; row order only
     *  breaks ties, and players without a score come after scored ones. */
    labyrinthScore?: (id: string) => number | undefined;
  }): AutoPlanResult {
    const tierRank = (id: string) => {
      const t = args.playerTier?.(id);
      return t === 'whale' ? 0 : t === 'dolphin' ? 1 : 2;
    };
    // Editable tasks in library order; teleport task pulled out separately.
    const teleportTask = args.tasks.find(t => t.isTeleport) ?? null;
    const editableTasks = args.tasks
      .filter(t => !t.isTeleport)
      .sort((a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        || a.name.localeCompare(b.name)
      );

    const ctx: AlgoContext = {
      allianceId: args.allianceId,
      legion: args.legion,
      tasks: editableTasks,
      teleportTask,
      locations: this.planService.MAP_LOCATIONS,
      playerName: args.playerName,
      tierRank,
      labyrinthScore: id => args.labyrinthScore?.(id),
    };

    const notPlaced: NotPlaced[] = [];
    const allProposed: Assignment[] = [];

    // Run phase 1 first; then phase 2 with phase-1 carryover hints.
    const phase1 = this.runPhase(ctx, 1, args.rows, notPlaced, []);
    allProposed.push(...phase1);

    const phase2 = this.runPhase(ctx, 2, args.rows, notPlaced, phase1);
    allProposed.push(...phase2);

    // Teleport pseudo-task — one per (player, phase) for any player with
    // assignments in that phase.
    if (teleportTask) {
      allProposed.push(...this.computeTeleports(ctx, 1, phase1));
      allProposed.push(...this.computeTeleports(ctx, 2, phase2));
    }

    return { legion: args.legion, proposed: allProposed, notPlaced };
  }

  // ── Phase pass ─────────────────────────────────────────────────────────

  private runPhase(
    ctx: AlgoContext,
    phase: 1 | 2,
    rows: AutoPlanRow[],
    notPlaced: NotPlaced[],
    phase1Assignments: Assignment[],
  ): Assignment[] {
    const locById = new Map(ctx.locations.map(l => [l.id, l]));

    // Mutable state for this phase pass.
    const out: Assignment[] = [];
    // Per-location load per task (key = `${taskId}|${locId}`).
    const taskLocLoad = new Map<string, number>();
    // Per-player set of locationIds they got *anywhere this phase* (for clustering).
    const playerLocs = new Map<string, Set<string>>();
    // Per (player, task) set of locationIds — prevents double-assigning the
    // same player to the same task at the same location.
    const playerTaskLocs = new Map<string, Set<string>>();

    // Prep phase-1 hints lookup: (playerId|taskId) → locationIds[] from phase 1.
    const phase1Hints = new Map<string, string[]>();
    for (const a of phase1Assignments) {
      const k = `${a.playerId}|${a.taskId}`;
      const arr = phase1Hints.get(k) ?? [];
      arr.push(a.locationId);
      phase1Hints.set(k, arr);
    }

    // Group rows by task, preserving per-task input order (= row priority).
    const rowsByTask = new Map<string, AutoPlanRow[]>();
    for (const r of rows) {
      const arr = rowsByTask.get(r.taskId) ?? [];
      arr.push(r);
      rowsByTask.set(r.taskId, arr);
    }

    // Iterate tasks in library order so high-priority tasks claim slots first.
    for (const task of ctx.tasks) {
      const taskRows = rowsByTask.get(task.id) ?? [];
      if (taskRows.length === 0) continue;

      const allowed = (task.priorityLocationIds ?? [])
        .map(id => locById.get(id))
        .filter((l): l is MapLocation => !!l)
        .filter(l => l.phases.includes(phase));

      if (allowed.length === 0) {
        // Task has no valid locations in this phase — record every requested slot.
        for (const r of taskRows) {
          for (let i = 0; i < r.count; i++) {
            notPlaced.push({
              taskId: task.id, taskName: task.name,
              playerId: r.playerId, playerName: ctx.playerName(r.playerId),
              phase, reason: 'No allowed location for this task in this phase',
            });
          }
        }
        continue;
      }

      const limit = task.maxPlayersPerLocation ?? Number.MAX_SAFE_INTEGER;

      if (task.rankByStrength) {
        this.fillByStrength(ctx, task, taskRows, allowed, limit, phase, notPlaced,
          out, taskLocLoad, playerLocs, playerTaskLocs);
      } else {
        this.fillGrouped(ctx, task, taskRows, allowed, limit, phase, notPlaced,
          out, taskLocLoad, playerLocs, playerTaskLocs, phase1Hints, locById);
      }
    }

    // Nobody in the inputs sits a phase out: only ~30 of the roster can be in
    // the battle at once and some won't show, so over-assigning is fine. A
    // player left without any spot this phase (their task is full, or has no
    // building this phase) joins the grouped task with the most buildings this
    // phase (e.g. Garrison Joiner) at its least-full building — past the
    // task's max if needed.
    const fallback = ctx.tasks
      .filter(t => !t.rankByStrength)
      .map(t => ({ t, locs: (t.priorityLocationIds ?? [])
        .map(id => locById.get(id))
        .filter((l): l is MapLocation => !!l && l.phases.includes(phase) && l.type !== 'global') }))
      .filter(x => x.locs.length > 0)
      .sort((a, b) => b.locs.length - a.locs.length)[0];
    if (fallback) {
      const max = fallback.t.maxPlayersPerLocation ?? Number.MAX_SAFE_INTEGER;
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.playerId) || r.count < 1) continue;
        seen.add(r.playerId);
        if (playerLocs.get(r.playerId)?.size) continue;
        let best = fallback.locs[0];
        let bestFill = Infinity;
        for (const l of fallback.locs) {
          const fill = (taskLocLoad.get(`${fallback.t.id}|${l.id}`) ?? 0) / max;
          if (fill < bestFill) { bestFill = fill; best = l; }
        }
        this.recordPick(out, ctx, fallback.t, r.playerId, best, phase,
                        taskLocLoad, playerLocs, playerTaskLocs);
      }
    }

    return out;
  }

  // ── Strength-ranked tasks (e.g. Garrison Captain) ──────────────────────
  //
  // Strongest first, one player at a time: whales, then dolphins, then
  // everyone else; within whales and dolphins higher labyrinth score first
  // (row order breaks ties, unscored last). Each player takes ALL their spots
  // (count) before the next player gets any, so the strongest whale holds the
  // top-priority buildings: their 1st spot is the most important free
  // building, every further spot the free building closest to the spots they
  // already hold in this task (priority breaks ties). No locality limit.
  private fillByStrength(
    ctx: AlgoContext, task: TaskTemplate, taskRows: AutoPlanRow[],
    allowed: MapLocation[], limit: number, phase: 1 | 2, notPlaced: NotPlaced[],
    out: Assignment[], taskLocLoad: Map<string, number>,
    playerLocs: Map<string, Set<string>>, playerTaskLocs: Map<string, Set<string>>,
  ) {
    const score = (r: AutoPlanRow) => ctx.tierRank(r.playerId) < 2
      ? (ctx.labyrinthScore(r.playerId) ?? -Infinity) : 0;
    const ordered = [...taskRows].sort((a, b) => {
      const t = ctx.tierRank(a.playerId) - ctx.tierRank(b.playerId);
      if (t !== 0) return t;
      const sa = score(a), sb = score(b);
      return sa === sb ? 0 : sb > sa ? 1 : -1;
    });

    for (const row of ordered) {
      for (let i = 0; i < row.count; i++) {
        const mine = playerTaskLocs.get(`${row.playerId}|${task.id}`);
        const free = allowed.filter(l =>
          !mine?.has(l.id) && (taskLocLoad.get(`${task.id}|${l.id}`) ?? 0) < limit);
        // 1st spot: highest priority. Later spots: closest to the player's
        // spots in this task (free is in priority order, so ties keep it).
        const c = mine?.size ? this.centroidOf(mine, ctx.locations) : null;
        let picked = free[0];
        if (c) {
          let best = Infinity;
          for (const l of free) {
            const d = Math.hypot(l.x - c.x, l.y - c.y);
            if (d < best) { best = d; picked = l; }
          }
        }
        if (!picked) {
          notPlaced.push({
            taskId: task.id, taskName: task.name,
            playerId: row.playerId, playerName: ctx.playerName(row.playerId),
            phase, reason: 'All allowed locations are at capacity',
          });
          continue;
        }
        this.recordPick(out, ctx, task, row.playerId, picked, phase,
                        taskLocLoad, playerLocs, playerTaskLocs);
      }
    }
  }

  // ── Grouped tasks (e.g. Garrison Joiner) ───────────────────────────────
  //
  // Strength is irrelevant here; what matters is that each player's spots
  // are close together and that the work is shared. We fill level by level
  // (each location's 1st slot, then each location's 2nd, …), locations in
  // priority order. For each free slot the candidate is chosen by, in order:
  //   1. eligible at all: has count left, not already at this location for
  //      this task, and within MAX_SPREAD of every location they already
  //      hold this phase (any task) — a joiner can't cover both map ends
  //   2. below the fair share (`target`) before above it — so nobody gets a
  //      3rd spot while someone else could still get a 1st/2nd
  //   3. players who already hold a nearby spot before fresh players — so a
  //      joiner covers neighbouring buildings (Boiler + Repair IV) instead of
  //      new players piling into the top buildings and leaving no
  //      neighbours for anyone
  //   4. held this location in phase 1 (carryover), then nearest to the
  //      player's current spots, then row order
  // `target` is the smallest per-player cap that still fills every slot
  // (water-filling over the rows' counts); `count` remains the hard max.
  private fillGrouped(
    ctx: AlgoContext, task: TaskTemplate, taskRows: AutoPlanRow[],
    allowed: MapLocation[], limit: number, phase: 1 | 2, notPlaced: NotPlaced[],
    out: Assignment[], taskLocLoad: Map<string, number>,
    playerLocs: Map<string, Set<string>>, playerTaskLocs: Map<string, Set<string>>,
    phase1Hints: Map<string, string[]>, locById: Map<string, MapLocation>,
  ) {
    // Merge duplicate rows for the same player (counts add up).
    const want = new Map<string, number>();
    const rowIndex = new Map<string, number>();
    // "Player at location" (e.g. Gatherer): the player physically sits there,
    // so one location per phase, whatever the count.
    const cap = task.playerAtLocation ? 1 : Number.MAX_SAFE_INTEGER;
    taskRows.forEach((r, i) => {
      want.set(r.playerId, Math.min(cap, (want.get(r.playerId) ?? 0) + r.count));
      if (!rowIndex.has(r.playerId)) rowIndex.set(r.playerId, i);
    });
    const players = Array.from(want.keys());
    const got = new Map<string, number>(players.map(p => [p, 0]));

    const totalSlots = limit === Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : allowed.length * limit;
    const maxWant = Math.max(...players.map(p => want.get(p)!));
    let target = maxWant;
    for (let t = 1; t < maxWant; t++) {
      const fill = players.reduce((s, p) => s + Math.min(want.get(p)!, t), 0);
      if (fill >= totalSlots) { target = t; break; }
    }

    let max2 = AutoPlanService.MAX_SPREAD ** 2;
    const spotsOf = (p: string) => Array.from(playerLocs.get(p) ?? [])
      .map(id => locById.get(id))
      .filter((l): l is MapLocation => !!l && l.type !== 'global');
    const isNear = (loc: MapLocation, p: string) => loc.type === 'global'
      || spotsOf(p).every(m => (loc.x - m.x) ** 2 + (loc.y - m.y) ** 2 <= max2);
    const distTo = (loc: MapLocation, p: string) => {
      const c = this.centroidOf(new Set(spotsOf(p).map(l => l.id)), ctx.locations);
      return c ? Math.hypot(loc.x - c.x, loc.y - c.y) : 0;
    };

    // Level by level: every location gets its 1st player before any gets a
    // 2nd, and so on up to the task's max — so when there are fewer players
    // than slots they're spread evenly instead of filling the top buildings
    // and leaving the rest empty. (No max → a single pass, unlimited.)
    // Each level is filled in three steps, so a building reaches it before
    // any other building goes past it:
    //   1. players within MAX_SPREAD of their other spots
    //   2. slots still empty: players within FILL_SPREAD
    //   3. still short (e.g. Repair I when every player with count left
    //      already holds it): move a joiner from a building next to the short
    //      one over, and give their old slot to a player with count left who
    //      fits there
    const levels = limit === Number.MAX_SAFE_INTEGER ? 1 : limit;
    for (let lv = 1; lv <= levels; lv++) {
      const level = limit === Number.MAX_SAFE_INTEGER ? limit : lv;
      for (const spread of [AutoPlanService.MAX_SPREAD, AutoPlanService.FILL_SPREAD]) {
        max2 = spread ** 2;
        for (const loc of allowed) {
          const loadKey = `${task.id}|${loc.id}`;
          while ((taskLocLoad.get(loadKey) ?? 0) < level) {
            const eligible = players.filter(p =>
              got.get(p)! < want.get(p)!
              && !(playerTaskLocs.get(`${p}|${task.id}`)?.has(loc.id))
              && isNear(loc, p));
            if (eligible.length === 0) break;
            const key = (p: string): number[] => [
              got.get(p)! >= target ? 1 : 0,
              spotsOf(p).length > 0 ? 0 : 1,
              phase === 2 && (phase1Hints.get(`${p}|${task.id}`) ?? []).includes(loc.id) ? 0 : 1,
              distTo(loc, p),
              rowIndex.get(p)!,
            ];
            let best = eligible[0];
            let bestKey = key(best);
            for (const p of eligible.slice(1)) {
              const k = key(p);
              const i = k.findIndex((v, j) => v !== bestKey[j]);
              if (i >= 0 && k[i] < bestKey[i]) { best = p; bestKey = k; }
            }
            this.recordPick(out, ctx, task, best, loc, phase,
                            taskLocLoad, playerLocs, playerTaskLocs);
            got.set(best, got.get(best)! + 1);
          }
        }
      }
      for (const loc of allowed) {
        const loadKey = `${task.id}|${loc.id}`;
        while ((taskLocLoad.get(loadKey) ?? 0) < level) {
          const swap = this.findSwap(task, loc, allowed, players, got, want,
                                     out, phase, playerLocs, playerTaskLocs, locById, max2);
          if (!swap) break;
          const { mover, from, filler } = swap;
          const i = out.findIndex(a => a.phase === phase && a.taskId === task.id
            && a.playerId === mover && a.locationId === from.id);
          out.splice(i, 1);
          taskLocLoad.set(`${task.id}|${from.id}`, taskLocLoad.get(`${task.id}|${from.id}`)! - 1);
          playerTaskLocs.get(`${mover}|${task.id}`)!.delete(from.id);
          if (!out.some(a => a.phase === phase && a.playerId === mover && a.locationId === from.id)) {
            playerLocs.get(mover)!.delete(from.id);
          }
          this.recordPick(out, ctx, task, mover, loc, phase, taskLocLoad, playerLocs, playerTaskLocs);
          this.recordPick(out, ctx, task, filler, from, phase, taskLocLoad, playerLocs, playerTaskLocs);
          got.set(filler, got.get(filler)! + 1);
        }
      }
    }

    const anyFree = allowed.some(l => (taskLocLoad.get(`${task.id}|${l.id}`) ?? 0) < limit);
    for (const p of players) {
      for (let i = got.get(p)!; i < want.get(p)!; i++) {
        notPlaced.push({
          taskId: task.id, taskName: task.name,
          playerId: p, playerName: ctx.playerName(p),
          phase,
          reason: anyFree
            ? "No free location near this player's other locations"
            : 'All allowed locations are at capacity',
        });
      }
    }
  }

  // A swap that fills `loc`: `mover` holds `from` (same task) and could sit
  // at `loc` instead, and `filler` has count left and fits at `from`. All
  // within `max2` (squared spread) of the player's other spots this phase.
  private findSwap(
    task: TaskTemplate, loc: MapLocation, allowed: MapLocation[],
    players: string[], got: Map<string, number>, want: Map<string, number>,
    out: Assignment[], phase: 1 | 2,
    playerLocs: Map<string, Set<string>>, playerTaskLocs: Map<string, Set<string>>,
    locById: Map<string, MapLocation>, max2: number,
  ): { mover: string; from: MapLocation; filler: string } | null {
    const fits = (l: MapLocation, p: string, without?: string) => l.type === 'global'
      || Array.from(playerLocs.get(p) ?? [])
        .filter(id => id !== without || out.some(a => a.phase === phase
          && a.playerId === p && a.locationId === id && a.taskId !== task.id))
        .map(id => locById.get(id))
        .every(m => !m || m.type === 'global' || (l.x - m.x) ** 2 + (l.y - m.y) ** 2 <= max2);
    const holds = (p: string, l: MapLocation) => !!playerTaskLocs.get(`${p}|${task.id}`)?.has(l.id);
    const fillers = players.filter(p => got.get(p)! < want.get(p)! && !holds(p, loc));
    for (const from of allowed) {
      if (from.id === loc.id) continue;
      const filler = fillers.find(p => !holds(p, from) && fits(from, p));
      if (!filler) continue;
      const mover = players.find(p => p !== filler && holds(p, from) && !holds(p, loc)
        && fits(loc, p, from.id));
      if (mover) return { mover, from, filler };
    }
    return null;
  }

  // Locality: max map distance between any two of a player's locations in
  // one phase. ~One building over: Boiler ↔ Repair IV (31) or Transit ↔
  // Repair III (32) fit; Boiler ↔ Transit (74) or Repair I ↔ Repair III (38)
  // don't. Global has no position and is exempt.
  private static readonly MAX_SPREAD = 35;
  // Fill-up range for slots the MAX_SPREAD pass left empty. Also lets Repair I
  // ↔ Repair III (38), Forge ↔ any outer building (35–41) or Repair II ↔
  // Repair IV (39) share a player; still not Boiler ↔ Transit (74).
  private static readonly FILL_SPREAD = 45;

  private centroidOf(ids: Set<string>, pool: MapLocation[]): Point | null {
    const locs = pool.filter(l => ids.has(l.id));
    if (locs.length === 0) return null;
    const x = locs.reduce((s, l) => s + l.x, 0) / locs.length;
    const y = locs.reduce((s, l) => s + l.y, 0) / locs.length;
    return { x, y };
  }

  private recordPick(
    out: Assignment[],
    ctx: AlgoContext,
    task: TaskTemplate,
    playerId: string,
    loc: MapLocation,
    phase: 1 | 2,
    taskLocLoad: Map<string, number>,
    playerLocs: Map<string, Set<string>>,
    playerTaskLocs: Map<string, Set<string>>,
  ) {
    out.push({
      id: `assign_${ctx.allianceId}_l${ctx.legion}_${playerId}_p${phase}_${loc.id}_${task.id}`,
      allianceId: ctx.allianceId,
      legion: ctx.legion,
      playerId,
      locationId: loc.id,
      taskId: task.id,
      phase,
    });
    const k = `${task.id}|${loc.id}`;
    taskLocLoad.set(k, (taskLocLoad.get(k) ?? 0) + 1);

    const pSet = playerLocs.get(playerId) ?? new Set<string>();
    pSet.add(loc.id);
    playerLocs.set(playerId, pSet);

    const ptKey = `${playerId}|${task.id}`;
    const ptSet = playerTaskLocs.get(ptKey) ?? new Set<string>();
    ptSet.add(loc.id);
    playerTaskLocs.set(ptKey, ptSet);
  }

  // ── Teleport pseudo-task ───────────────────────────────────────────────

  private computeTeleports(
    ctx: AlgoContext,
    phase: 1 | 2,
    phaseAssignments: Assignment[],
  ): Assignment[] {
    if (!ctx.teleportTask) return [];
    const taskById = new Map(ctx.tasks.map(t => [t.id, t]));
    const locById = new Map(ctx.locations.map(l => [l.id, l]));

    // Group assignments by player.
    const byPlayer = new Map<string, Assignment[]>();
    for (const a of phaseAssignments) {
      const arr = byPlayer.get(a.playerId) ?? [];
      arr.push(a);
      byPlayer.set(a.playerId, arr);
    }

    const workshops = ctx.locations.filter(l =>
      l.type === 'workshop' && l.phases.includes(phase)
    );

    const out: Assignment[] = [];
    for (const [playerId, assigns] of byPlayer) {
      const teleLocId = this.pickTeleportLocation(
        assigns, taskById, locById, workshops
      );
      if (!teleLocId) continue;
      out.push({
        id: `assign_${ctx.allianceId}_l${ctx.legion}_${playerId}_p${phase}_${teleLocId}_${ctx.teleportTask.id}`,
        allianceId: ctx.allianceId,
        legion: ctx.legion,
        playerId,
        locationId: teleLocId,
        taskId: ctx.teleportTask.id,
        phase,
      });
    }
    return out;
  }

  private pickTeleportLocation(
    assigns: Assignment[],
    taskById: Map<string, TaskTemplate>,
    locById: Map<string, MapLocation>,
    workshops: MapLocation[],
  ): string | null {
    // Among all `playerAtLocation` assignments, pick the highest-priority
    // (per that task's priorityLocationIds order).
    let best: { locId: string; rank: number } | null = null;
    for (const a of assigns) {
      const t = taskById.get(a.taskId);
      if (!t?.playerAtLocation) continue;
      const order = t.priorityLocationIds ?? [];
      const rank = order.indexOf(a.locationId);
      if (rank < 0) continue;
      if (!best || rank < best.rank) best = { locId: a.locationId, rank };
    }
    if (best) return best.locId;

    // Otherwise: nearest workshop to the player's centroid (skip workshop
    // pins themselves to avoid teleporting "to" gathering pins they already
    // sit on — though in practice the centroid math handles it cleanly).
    if (workshops.length === 0) return null;
    const myLocs = assigns
      .map(a => locById.get(a.locationId))
      .filter((l): l is MapLocation => !!l && l.type !== 'global');
    if (myLocs.length === 0) return workshops[0].id;
    const cx = myLocs.reduce((s, l) => s + l.x, 0) / myLocs.length;
    const cy = myLocs.reduce((s, l) => s + l.y, 0) / myLocs.length;
    let bestW: { id: string; d: number } | null = null;
    for (const w of workshops) {
      const d = (w.x - cx) ** 2 + (w.y - cy) ** 2;
      if (!bestW || d < bestW.d) bestW = { id: w.id, d };
    }
    return bestW?.id ?? null;
  }
}
