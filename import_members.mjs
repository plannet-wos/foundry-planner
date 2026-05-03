import { readFileSync } from 'fs';

const PROJECT_ID = 'tal-coordinator';
const API_KEY = 'AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes';
const ALLIANCE_ID = 'hoc';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/players`;

const members = JSON.parse(readFileSync('./members.json', 'utf8'));

function cleanName(name) {
  return name
    .replace(/^\[HOC[\])]?/i, '')  // remove [HOC] or [HOC) prefix
    .replace(/^\[HOC/i, '')
    .trim();
}

async function docExists(id) {
  const res = await fetch(`${BASE}/${id}?key=${API_KEY}`);
  return res.status === 200;
}

async function upsertPlayer(id, name) {
  const body = {
    fields: {
      id:           { stringValue: id },
      inGameName:   { stringValue: name },
      allianceId:   { stringValue: ALLIANCE_ID },
      availability: { mapValue: { fields: {
        time_2:  { booleanValue: false },
        time_7:  { booleanValue: false },
        time_12: { booleanValue: false },
        time_14: { booleanValue: false },
        time_19: { booleanValue: false },
      }}},
      legion:    { stringValue: 'unassigned' },
      createdAt: { integerValue: String(Date.now()) },
    }
  };
  // PATCH with updateMask only sets these fields, leaving existing ones intact
  const fields = Object.keys(body.fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const res = await fetch(`${BASE}/${id}?key=${API_KEY}&${fields}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function countAll() {
  // List all docs (max 300 for an alliance this size)
  const res = await fetch(`${BASE}?key=${API_KEY}&pageSize=300`);
  const data = await res.json();
  return (data.documents || []).length;
}

let imported = 0, skipped = 0, errors = 0;

for (const [id, player] of Object.entries(members)) {
  const name = cleanName(player.inGameName || '');
  if (!name || name === 'unknown' || /^[^a-zA-Z0-9]/.test(name) && name.length <= 2) {
    console.log(`  SKIP (bad name): ${id} -> "${player.inGameName}"`);
    skipped++;
    continue;
  }

  const exists = await docExists(id);
  if (exists) {
    console.log(`  SKIP (exists):   ${id} ${name}`);
    skipped++;
    continue;
  }

  try {
    await upsertPlayer(id, name);
    console.log(`  IMPORTED:        ${id} ${name}`);
    imported++;
  } catch (e) {
    console.log(`  ERROR:           ${id} ${name} - ${e.message}`);
    errors++;
  }
}

const total = await countAll();
console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
console.log(`Total players now in DB: ${total}`);
