# Scripts

Diagnostic / one-off scripts that read or write live Firestore. Since the
Firestore security rules now reject unauthenticated REST reads, every script
that touches live data goes through `_firestore.mjs`, which uses the Firebase
Admin SDK and a service-account key.

## One-time setup

1. Open the Firebase service-accounts page:
   https://console.firebase.google.com/project/tal-coordinator/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → confirm. A JSON file downloads.
3. Save the file as `scripts/.service-account.json`. It's already in
   `.gitignore` — do not commit it.

That's it. Every script below will then "just work".

If you'd rather keep the key elsewhere, point `$GOOGLE_APPLICATION_CREDENTIALS`
at the full path instead.

## Scripts that use the Admin SDK

- `debug-autoplan.mjs` — dump the autoPlanConfig + tasks for hoc/L1 to console.
  Pure read.
- `backfill-p1-teleports.mjs` — backfill phase-1 teleport assignments for
  hoc/L1 players who don't have one yet. Supports `--dry` for preview.

## Scripts that don't need the SDK

- `sim-blizz.mjs` — self-contained simulation of the auto-plan scoring; no
  network calls.

## Older scripts

The seed/clear/set-roles/show-tasks scripts in this folder predate the
locked-down rules and still hit the REST API with an API key. They will
fail with `PERMISSION_DENIED` until migrated to `_firestore.mjs` — port
them when you next need to run one.
