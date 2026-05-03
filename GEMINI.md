# Foundry Planner - Gemini AI Context

This file serves as foundational context for Gemini AI in future development sessions for the `Foundry Planner` project.

## Core Rules & Mandates
1. **Framework & UI:** Use Angular (v21+, Standalone Components) and Angular Material.
2. **Database:** Use Firebase Firestore using `@angular/fire`. Do not attempt to mock or setup an SQL database.
3. **Player Identity:** The system relies on `inGameId` as the primary key and document ID for players. Any updates to a player should merge with their existing document.
4. **Map Image:** The interactive map relies on `battlemap.webp` located in the root/public directory. Map styles use relative percentages (`%`) for responsive pinpointing.
5. **No Auth Implementation:** Currently, the system operates on "alliance trust". Do not implement user authentication (Firebase Auth/passwords) unless explicitly requested by the user.

## Project Structure
- `src/app/core/models/`: TypeScript interfaces for `Player`, `TaskTemplate`, `Assignment`, and `MapLocation`.
- `src/app/core/services/`: Firebase interaction logic (`PlayerService`, `PlanService`).
- `src/app/features/`: Contains the four main route components (`signup`, `admin-dashboard`, `battle-plan-builder`, `player-view`).
- `docs/`: Contains detailed `PROJECT_DETAILS.md` and `ARCHITECTURE.md` for extended reading on the current system state.
