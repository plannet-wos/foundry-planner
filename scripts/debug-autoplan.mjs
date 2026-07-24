// Debug script — fetch autoPlanConfig + tasks + players for hoc/L1 so we can
// see exactly what row inputs the algorithm gets. Uses the Admin SDK via
// scripts/_firestore.mjs (see that file for one-time auth setup).

import { queryColl, getDocById } from './_firestore.mjs';

const ALLIANCE_ID = 'hoc';
const LEGION = 1;

const cfgId   = `${ALLIANCE_ID}_l${LEGION}`;
const cfg     = await getDocById('autoPlanConfigs', cfgId);
const tasks   = await queryColl('tasks',   [{ field: 'allianceId', value: ALLIANCE_ID }]);
const players = await queryColl('players', [{ field: 'allianceId', value: ALLIANCE_ID }]);

const tasksById = new Map(tasks.map(t => [t._id, t]));

console.log('\n=== AUTO-PLAN CONFIG ===');
console.log('id:', cfgId, 'rows:', cfg?.rows?.length ?? 0);

const byPlayer = new Map();
for (const r of (cfg?.rows ?? [])) {
  const arr = byPlayer.get(r.playerId) ?? [];
  arr.push(r);
  byPlayer.set(r.playerId, arr);
}

const playersInLegion = players.filter(p => String(p.legion) === String(LEGION));
playersInLegion.sort((a, b) => {
  const rank = p => p.tier === 'whale' ? 0 : p.tier === 'dolphin' ? 1 : 2;
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
