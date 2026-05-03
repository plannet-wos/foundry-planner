# Foundry Planner - Architecture & Technical Details

## Tech Stack
- **Frontend Framework:** Angular v21
- **Component Architecture:** Standalone Components (No NgModule)
- **UI Library:** Angular Material (`@angular/material`), Angular CDk
- **Database/Backend:** Firebase Firestore (Serverless NoSQL)
- **Package Manager:** npm

## Database Schema (Firestore)

### Collection: `players`
- **Document ID:** `inGameId` (e.g., '12345678')
- **Fields:**
  - `id`: string (same as document ID)
  - `inGameName`: string
  - `availability`: Map `{ time_2: boolean, time_7: boolean, time_12: boolean, time_14: boolean, time_19: boolean }`
  - `role`: string (`'main' | 'sub' | 'unassigned'`)
  - `createdAt`: number (timestamp)

### Collection: `tasks`
- **Document ID:** generated (e.g., `task_1712165039201`)
- **Fields:**
  - `id`: string
  - `name`: string
  - `description`: string (optional)

### Collection: `assignments`
- **Document ID:** compound string (`assign_${playerId}_${phase}_${locationId}`)
- **Fields:**
  - `id`: string
  - `playerId`: string
  - `locationId`: string
  - `taskId`: string
  - `phase`: number (`1 | 2`)

## Application Routes & Structure
- **`/signup`** (`Signup` component): Registration form handling `players` creation/updates.
- **`/admin`** (`AdminDashboard` component): Table view of all `players`, admin sets `role` here.
- **`/admin/plan-builder`** (`BattlePlanBuilder` component): Two-tab layout. Handles `tasks` creation and links `assignments` between `players`, `locations`, and `tasks`. Includes interactive map preview.
- **`/player`** (`PlayerView` component): Two-tab layout. Handles searching `assignments` by player ID and displays the global interactive map.

## Map & Locations
The locations are hardcoded in `src/app/core/services/plan.service.ts` (`MAP_LOCATIONS`) using X/Y percentages to position interactive pins accurately on top of `battlemap.webp` (stored in `src/public/`). Locations are categorized by `type` (`'central' | 'outer' | 'workshop'`) to determine their pin color.