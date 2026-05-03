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
}

/**
 * Stateless auto-plan algorithm. Runs both phases for one legion. Honours:
 *
 *  - per-task `priorityLocationIds` (order = priority, missing locs are excluded)
 *  - per-task `maxPlayersPerLocation`
 *  - phase availability of locations (phase-2-only buildings)
 *  - phase 2 carryover: keep the same (player, task) location from phase 1
 *    unless a strictly higher priority empty slot exists
 *  - row priority: first row of a task gets highest-priority location
 *  - clustering: subsequent locations for a player gravitate toward their
 *    existing locations (centroid-nearest)
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
    /** Spending tier per player. Whales pick before dolphins before none.
     *  Within a tier, the row order from the modal still applies. */
    playerTier?: (id: string) => 'whale' | 'dolphin' | undefined;
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

      // Freeze each player's anchor at task entry. The anchor = centroid of
      // their locations from previous tasks this phase, OR null if this is
      // the first task to place them. Frozen so it doesn't drift as we add
      // locations within this task — drift caused later picks to look
      // closer to recently-added locs than to the player's "home base".
      const playerAnchor = new Map<string, Point | null>();
      for (const row of taskRows) {
        if (playerAnchor.has(row.playerId)) continue;
        const locs = playerLocs.get(row.playerId);
        playerAnchor.set(row.playerId, locs ? this.centroidOf(locs, ctx.locations) : null);
      }

      // Tier groups have absolute priority: whales first, then dolphins,
      // then everyone else. Within each tier we still round-robin across
      // that tier's rows so capacity is spread evenly between equal players.
      const tierGroups = new Map<number, AutoPlanRow[]>();
      for (const r of taskRows) {
        const rank = ctx.tierRank(r.playerId);
        const arr = tierGroups.get(rank) ?? [];
        arr.push(r);
        tierGroups.set(rank, arr);
      }
      const sortedRanks = Array.from(tierGroups.keys()).sort((a, b) => a - b);

      for (const rank of sortedRanks) {
        const groupRows = tierGroups.get(rank)!;
        const maxCount = groupRows.reduce((m, r) => Math.max(m, r.count), 0);
        for (let round = 0; round < maxCount; round++) {
          for (const row of groupRows) {
            if (round >= row.count) continue;
            const anchor = playerAnchor.get(row.playerId) ?? null;
            const picked = this.pickLocation(
              task, row.playerId, allowed, limit,
              taskLocLoad, playerTaskLocs,
              phase, phase1Hints, anchor,
            );
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
            // Seed anchor from the very first pick if this player had no
            // pre-task locations — subsequent picks for this player in this
            // task will then cluster around that first pick (frozen).
            if (anchor === null) {
              playerAnchor.set(row.playerId, { x: picked.x, y: picked.y });
            }
          }
        }
      }
    }

    return out;
  }

  // Score a candidate using priority + α·distance. Lower score wins.
  // Priority is the *primary* signal (one priority slot ≈ PRIORITY_DISTANCE
  // map units of distance). Distance is the tiebreaker — and breaks ties
  // strongly enough that, e.g., repair_4 vs repair_3 (1 priority apart)
  // can flip if repair_4 is meaningfully closer to the anchor.
  //
  // PRIORITY_DISTANCE chosen so that ~5% of map width = 1 priority slot.
  // Tuned against the hoc/L1 whale case so that a 14-unit distance gap can
  // overcome a 3-priority-slot gap (e.g. repair_1 wins over proto_2 because
  // it's that much closer to boiler) while small distance gaps still defer
  // to priority.
  private static readonly PRIORITY_DISTANCE = 5;

  // Phase-2 carryover bonus: hint locations (where this player was placed in
  // phase 1) get this much shaved off their score so they're preferred over
  // equally-ranked non-hints. Worth ~1 priority slot — enough to break a
  // close tie toward "stay where you were", but not enough to override a
  // clearly-higher-priority empty location.
  private static readonly HINT_BONUS = 1;

  // Choose the best location for one slot.
  //
  // Score = priorityIndex + dist(loc, anchor) / PRIORITY_DISTANCE
  //         - HINT_BONUS · (loc is a phase-1 hint for this player+task)
  //
  // anchor = centroid of player's pre-task locations (frozen at task entry,
  // so the score doesn't drift as picks accumulate within the task). If no
  // pre-task locations exist, the FIRST pick is by priority alone (anchor is
  // null) and runPhase seeds the anchor from that first pick.
  //
  // Phase-2 carryover behaves as a soft preference: hints get a one-priority-
  // slot discount, so equally-good non-hints lose to a previously-held loc,
  // but a meaningfully-better non-hint can still win.
  private pickLocation(
    task: TaskTemplate,
    playerId: string,
    allowed: MapLocation[],
    limit: number,
    taskLocLoad: Map<string, number>,
    playerTaskLocs: Map<string, Set<string>>,
    phase: 1 | 2,
    phase1Hints: Map<string, string[]>,
    anchor: Point | null,
  ): MapLocation | null {
    const playerTaskKey = `${playerId}|${task.id}`;
    const usedByPlayerForTask = playerTaskLocs.get(playerTaskKey) ?? new Set<string>();

    const isAvailable = (loc: MapLocation) => {
      if (usedByPlayerForTask.has(loc.id)) return false;
      const load = taskLocLoad.get(`${task.id}|${loc.id}`) ?? 0;
      return load < limit;
    };

    const candidates = allowed.filter(isAvailable);
    if (candidates.length === 0) return null;

    // Priority + distance + hint score. allowed is in priority order; we use
    // that index as priority rank (smaller = higher priority).
    const priorityIndex = new Map(allowed.map((l, i) => [l.id, i]));
    const ALPHA = 1 / AutoPlanService.PRIORITY_DISTANCE;
    const hintIds = new Set(phase === 2 ? (phase1Hints.get(playerTaskKey) ?? []) : []);

    let best: MapLocation | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const pIdx = priorityIndex.get(c.id) ?? 0;
      let dist = 0;
      if (anchor) {
        const dx = c.x - anchor.x;
        const dy = c.y - anchor.y;
        dist = Math.sqrt(dx * dx + dy * dy);
      }
      const hintBonus = hintIds.has(c.id) ? AutoPlanService.HINT_BONUS : 0;
      const score = pIdx + ALPHA * dist - hintBonus;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

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
