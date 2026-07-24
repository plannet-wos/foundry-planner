// Shared Firestore client for diagnostic / one-off scripts.
//
// Auth: uses a service-account JSON. Resolved in this order:
//   1. $GOOGLE_APPLICATION_CREDENTIALS env var (path to JSON)
//   2. scripts/.service-account.json (gitignored)
//
// One-time setup (per machine):
//   1. Firebase console → ⚙ Project Settings → Service accounts →
//      "Generate new private key" → download JSON
//   2. Save it as `scripts/.service-account.json` (already gitignored)
//
// All script-side errors throw — no more silent "0 documents" on 403.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_KEY = resolve(__dirname, '.service-account.json');

function loadCredentials() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath && existsSync(envPath)) {
    return JSON.parse(readFileSync(envPath, 'utf8'));
  }
  if (existsSync(LOCAL_KEY)) {
    return JSON.parse(readFileSync(LOCAL_KEY, 'utf8'));
  }
  throw new Error(
    'No Firebase credentials found.\n' +
    '  Expected either $GOOGLE_APPLICATION_CREDENTIALS to point at a service-\n' +
    '  account JSON, or the file scripts/.service-account.json to exist.\n' +
    '  Generate one at:\n' +
    '    https://console.firebase.google.com/project/tal-coordinator/settings/serviceaccounts/adminsdk\n' +
    '  → "Generate new private key" → save to scripts/.service-account.json'
  );
}

export function getDb() {
  if (getApps().length === 0) {
    const creds = loadCredentials();
    initializeApp({ credential: cert(creds), projectId: creds.project_id });
  }
  return getFirestore();
}

// Convenience: fetch all docs of a collection matching one or more equality
// filters. Throws on auth / network failure — never silently returns [].
export async function queryColl(coll, filters = []) {
  let q = getDb().collection(coll);
  for (const f of filters) q = q.where(f.field, '==', f.value);
  const snap = await q.get();
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

export async function getDocById(coll, id) {
  const snap = await getDb().collection(coll).doc(id).get();
  return snap.exists ? { _id: snap.id, ...snap.data() } : null;
}
