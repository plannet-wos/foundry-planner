// Debug script — fetch autoPlanConfig + tasks + players for hoc/L1 so we can
// see exactly what row inputs the algorithm gets. Read-only via the public
// REST API; rules are open per firestore.rules.

const PROJECT_ID = 'tal-coordinator';
const API_KEY = 'AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes';
const ALLIANCE_ID = 'hoc';
const LEGION = 1;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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

async function getDoc(path) {
  const res = await fetch(`${BASE}/${path}?key=${API_KEY}`);
  if (!res.ok) return null;
  return unwrapDoc(await res.json());
}

async function listCollection(name, where = null) {
  // Use structured queries when filtering, plain list otherwise.
  if (!where) {
    const res = await fetch(`${BASE}/${name}?key=${API_KEY}&pageSize=300`);
    const data = await res.json();
    return (data.documents ?? []).map(unwrapDoc);
  }
  const body = {
    structuredQuery: {
      from: [{ collectionId: name }],
      where: {
        fieldFilter: {
          field: { fieldPath: where.field },
          op: 'EQUAL',
          value: { stringValue: where.value },
        },
      },
    },
  };
  const res = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.filter(r => r.document).map(r => unwrapDoc(r.document));
}

const cfgId = `${ALLIANCE_ID}_l${LEGION}`;
const cfg = await getDoc(`autoPlanConfigs/${cfgId}`);
const tasks = await listCollection('tasks', { field: 'allianceId', value: ALLIANCE_ID });
const players = await listCollection('players', { field: 'allianceId', value: ALLIANCE_ID });

const playersById = new Map(players.map(p => [p._id, p]));
const tasksById   = new Map(tasks.map(t => [t._id, t]));

console.log('\n=== AUTO-PLAN CONFIG ===');
console.log('id:', cfgId, 'rows:', cfg?.rows?.length ?? 0);

// Group by player so we can see each player's rows clearly.
const byPlayer = new Map();
for (const r of (cfg?.rows ?? [])) {
  const arr = byPlayer.get(r.playerId) ?? [];
  arr.push(r);
  byPlayer.set(r.playerId, arr);
}

// Print whales and dolphins first
const playersInLegion = players.filter(p => String(p.legion) === String(LEGION));
playersInLegion.sort((a, b) => {
  const rank = (p) => p.tier === 'whale' ? 0 : p.tier === 'dolphin' ? 1 : 2;
  return rank(a) - rank(b) || a.inGameName.localeCompare(b.inGameName);
});

for (const p of playersInLegion) {
  const rows = byPlayer.get(p._id) ?? [];
  if (rows.length === 0 && !p.tier) continue;
  const tag = p.tier === 'whale' ? '🐋' : p.tier === 'dolphin' ? '🐬' : '  ';
  console.log(`\n${tag} ${p.inGameName} (${p._id})  legion=${p.legion}  tier=${p.tier ?? 'none'}`);
  for (const r of rows) {
    const t = tasksById.get(r.taskId);
    const prio = (t?.priorityLocationIds ?? []).join(' > ');
    console.log(`    ${t?.name ?? r.taskId}  count=${r.count}   priority: ${prio}`);
  }
}

console.log('\n=== TASKS ===');
for (const t of tasks.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))) {
  if (t.isTeleport) continue;
  console.log(`  ${t.name}   max/loc=${t.maxPlayersPerLocation ?? '∞'}  atLoc=${!!t.playerAtLocation}  prio=[${(t.priorityLocationIds ?? []).join(', ')}]`);
}
