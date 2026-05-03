# Foundry Planner - Claude AI Context

This file is the authoritative instruction set for Claude in all future sessions on this project.

## What This App Is
Foundry Planner is a web app for organizing alliance strategies in the mobile game **Whiteout Survival**, specifically for **Foundry Battle** events. It is used by alliance members to sign up, and by admins to assign roles and battle plans.

---

## Non-Negotiable Rules

1. **Framework:** Angular 21, Standalone Components only. No NgModule.
2. **UI:** Angular Material + Angular CDK. No other UI libraries.
3. **Backend:** Firebase Firestore via `@angular/fire`. No SQL, no local mocks, no alternative backends.
4. **Change Detection:** Use `provideZonelessChangeDetection()` — zoneless is the correct setup for this project. Do NOT re-introduce `zone.js` or `provideZoneChangeDetection`.
5. **Player identity:** `inGameId` is the Firestore document ID for all player documents. Always use `{ merge: true }` when writing player documents to avoid overwriting existing fields.
6. **No authentication:** The app runs on alliance trust. Do not add Firebase Auth, login flows, or password handling unless explicitly requested.
7. **Map positions:** Always use relative `%` values (x/y) for map pin placement on `battlemap.webp`. Never use fixed pixel values.

---

## Project Structure

```
src/
  app/
    app.config.ts              # provideZonelessChangeDetection, Firebase providers
    app.routes.ts              # Route definitions
    core/
      models/
        player.model.ts        # Player, PlayerAvailability interfaces
        plan.model.ts          # TaskTemplate, MapLocation, Assignment interfaces
      services/
        player.service.ts      # Firestore CRUD for `players` collection
        plan.service.ts        # Firestore CRUD for `tasks` and `assignments`; MAP_LOCATIONS hardcoded here
    features/
      signup/                  # /signup — player registration + availability voting
      admin-dashboard/         # /admin — player table, role assignment, battle time selection
      battle-plan-builder/     # /admin/plan-builder — task library + map assignment builder
      player-view/             # /player — personal plan lookup + global map view
  environments/
    environment.ts             # Firebase config (live — do not overwrite or mock)
public/
  battlemap.webp               # The interactive map background image
docs/
  PROJECT_DETAILS.md
  ARCHITECTURE.md
```

---

## Firestore Schema

### `players` collection
- **Document ID:** `inGameId` (e.g. `'12345678'`)
- `id`: string (same as doc ID)
- `inGameName`: string
- `availability`: `{ time_2, time_7, time_12, time_14, time_19 }` — all booleans
- `role`: `'main' | 'sub' | 'unassigned'`
- `createdAt`: number (Unix timestamp)

### `tasks` collection
- **Document ID:** generated string (e.g. `task_1712165039201`)
- `id`: string
- `name`: string
- `description?`: string

### `assignments` collection
- **Document ID:** `assign_${playerId}_${phase}_${locationId}`
- `id`: string
- `playerId`: string
- `locationId`: string
- `taskId`: string
- `phase`: `1 | 2`

---

## Map Locations
Hardcoded in `plan.service.ts` as `MAP_LOCATIONS: MapLocation[]`. Do not move these to Firestore unless asked. Location types determine pin color:
- `'central'` → Red pins
- `'outer'` → Blue pins
- `'workshop'` → (reserved)

---

## Service Patterns
- Always use `setDoc(..., { merge: true })` when saving — never plain `setDoc` without merge (would overwrite documents).
- Use `collectionData(..., { idField: 'id' })` for real-time observables.
- Services use `inject()` — not constructor injection.

---

## What to Avoid
- Do not add NgModules.
- Do not mock Firestore or use in-memory data for development.
- Do not add authentication flows.
- Do not use pixel values for map pin positions.
- Do not re-introduce `zone.js`.
- Do not add extra abstractions or helpers not required by the task at hand.
