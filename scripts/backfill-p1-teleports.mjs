// One-off: for hoc / Legion 1, give every player who has phase-1 assignments
// but no phase-1 Teleport Location a teleport pin set to the Arsenal Supplies
// nearest to the centroid of their existing phase-1 locations.
// Skips players who already have a phase-1 teleport (e.g. Garrison Leads).
//
// Run: `node scripts/backfill-p1-teleports.mjs --dry` to preview, then drop
// `--dry` to actually write.

const PROJECT_ID  = 'tal-coordinator';
const API_KEY     = 'AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes';
const ALLIANCE_ID = 'hoc';
const LEGION      = 1;
const PHASE       = 1;
const DRY         = process.argv.includes('--dry');

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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

function unwrap(v) {
  if (!v) return v;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values ?? []).map(unwrap);
  if ('mapValue'     in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) o[k] = unwrap(val);
    return o;
  }
  return v;
}
function unwrapDoc(doc) {
  const o = { _id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields ?? {})) o[k] = unwrap(v);
  return o;
}

async function query(coll, filters) {
  const fieldFilters = filters.map(f => ({
    fieldFilter: {
      field: { fieldPath: f.field }, op: 'EQUAL',
      value: typeof f.value === 'number'
        ? { integerValue: f.value }
        : { stringValue: f.value },
    },
  }));
  const where = fieldFilters.length === 1
    ? fieldFilters[0]
    : { compositeFilter: { op: 'AND', filters: fieldFilters } };
  const res = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where } }),
  });
  const data = await res.json();
  return data.filter(r => r.document).map(r => unwrapDoc(r.document));
}

async function patchAssignment(id, body) {
  const url = `${BASE}/assignments/${id}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${id} failed: ${res.status} ${await res.text()}`);
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const players  = await query('players', [{ field: 'allianceId', value: ALLIANCE_ID }]);
const tasks    = await query('tasks',   [{ field: 'allianceId', value: ALLIANCE_ID }]);
const allP1    = await query('assignments',
  [{ field: 'allianceId', value: ALLIANCE_ID }, { field: 'phase', value: PHASE }]);

const teleId    = tasks.find(t => t.isTeleport)?._id;
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
  if (rows.length === 0) continue;                          // no phase 1 work
  if (rows.some(r => r.taskId === teleId)) continue;        // already has tele

  // Centroid of their phase-1 locations
  const pts = rows.map(r => LOCS[r.locationId]).filter(Boolean);
  if (pts.length === 0) continue;
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;

  // Nearest arsenal
  let bestArs = ARSENALS[0], bestD = Infinity;
  for (const a of ARSENALS) {
    const d = dist({ x: cx, y: cy }, LOCS[a]);
    if (d < bestD) { bestD = d; bestArs = a; }
  }

  const assignId = `assign_${ALLIANCE_ID}_l${LEGION}_${p._id}_p${PHASE}_${bestArs}_${teleId}`;
  writes.push({
    player: p.inGameName, playerId: p._id, arsenal: bestArs, assignId,
    body: {
      fields: {
        id:          { stringValue:  assignId },
        allianceId:  { stringValue:  ALLIANCE_ID },
        legion:      { integerValue: LEGION },
        playerId:    { stringValue:  p._id },
        locationId:  { stringValue:  bestArs },
        taskId:      { stringValue:  teleId },
        phase:       { integerValue: PHASE },
      },
    },
  });
}

console.log(`${DRY ? 'DRY RUN' : 'WRITING'} — ${writes.length} teleport assignments`);
for (const w of writes) console.log(`  ${w.player.padEnd(28)} -> ${w.arsenal}`);

if (!DRY) {
  for (const w of writes) {
    await patchAssignment(w.assignId, w.body);
    console.log(`  ✓ ${w.player}`);
  }
  console.log('Done.');
}
