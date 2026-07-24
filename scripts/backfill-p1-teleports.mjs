// One-off: for hoc / Legion 1, give every player who has phase-1 assignments
// but no phase-1 Teleport Location a teleport pin set to the Arsenal Supplies
// nearest to the centroid of their existing phase-1 locations.
// Skips players who already have a phase-1 teleport (e.g. Garrison Leads).
//
// Run: `node scripts/backfill-p1-teleports.mjs --dry` to preview, then drop
// `--dry` to actually write. Uses scripts/_firestore.mjs for auth.

import { getDb, queryColl } from './_firestore.mjs';

const ALLIANCE_ID = 'hoc';
const LEGION      = 1;
const PHASE       = 1;
const DRY         = process.argv.includes('--dry');

// Same coords as src/app/core/services/plan.service.ts MAP_LOCATIONS.
const LOCS = {
  loc_forge:     { x: 50,   y: 50   },
  loc_mercenary: { x: 49.5, y: 27.5 },
  loc_munitions: { x: 49.5, y: 68.5 },
  loc_boiler:    { x: 34,   y: 13.7 },
  loc_repair_4:  { x: 65.4, y: 13.7 },
  loc_proto_1:   { x: 17,   y: 40   },
  loc_repair_1:  { x:  9,   y: 51.7 },
  loc_repair_2:  { x: 90,   y: 44   },
  loc_proto_2:   { x: 82,   y: 58   },
  loc_repair_3:  { x: 33.1, y: 81.7 },
  loc_transit:   { x: 65.5, y: 81.7 },
  loc_arsenal_1: { x: 29,   y: 32   },
  loc_arsenal_2: { x: 69,   y: 37   },
  loc_arsenal_3: { x: 26,   y: 64   },
  loc_arsenal_4: { x: 68,   y: 66   },
};
const ARSENALS = ['loc_arsenal_1', 'loc_arsenal_2', 'loc_arsenal_3', 'loc_arsenal_4'];

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const players = await queryColl('players', [{ field: 'allianceId', value: ALLIANCE_ID }]);
const tasks   = await queryColl('tasks',   [{ field: 'allianceId', value: ALLIANCE_ID }]);
const allP1   = await queryColl('assignments', [
  { field: 'allianceId', value: ALLIANCE_ID },
  { field: 'phase',      value: PHASE },
]);

const teleId = tasks.find(t => t.isTeleport)?._id;
if (!teleId) throw new Error('No teleport task found');

const l1Players = players.filter(p => String(p.legion) === String(LEGION));
const l1P1      = allP1.filter(a => String(a.legion) === String(LEGION));

const byPlayer = new Map();
for (const a of l1P1) {
  const arr = byPlayer.get(a.playerId) ?? [];
  arr.push(a);
  byPlayer.set(a.playerId, arr);
}

const writes = [];
for (const p of l1Players) {
  const rows = byPlayer.get(p._id) ?? [];
  if (rows.length === 0) continue;
  if (rows.some(r => r.taskId === teleId)) continue;

  const pts = rows.map(r => LOCS[r.locationId]).filter(Boolean);
  if (pts.length === 0) continue;
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;

  let bestArs = ARSENALS[0], bestD = Infinity;
  for (const a of ARSENALS) {
    const d = dist({ x: cx, y: cy }, LOCS[a]);
    if (d < bestD) { bestD = d; bestArs = a; }
  }

  const assignId = `assign_${ALLIANCE_ID}_l${LEGION}_${p._id}_p${PHASE}_${bestArs}_${teleId}`;
  writes.push({
    player: p.inGameName, arsenal: bestArs, assignId,
    body: {
      id:         assignId,
      allianceId: ALLIANCE_ID,
      legion:     LEGION,
      playerId:   p._id,
      locationId: bestArs,
      taskId:     teleId,
      phase:      PHASE,
    },
  });
}

console.log(`${DRY ? 'DRY RUN' : 'WRITING'} — ${writes.length} teleport assignments`);
for (const w of writes) console.log(`  ${w.player.padEnd(28)} -> ${w.arsenal}`);

if (!DRY) {
  const db = getDb();
  for (const w of writes) {
    await db.collection('assignments').doc(w.assignId).set(w.body, { merge: true });
    console.log(`  ✓ ${w.player}`);
  }
  console.log('Done.');
}
