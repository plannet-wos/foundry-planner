# Foundry Planner - Project Documentation

## Project Overview
Foundry Planner is a web application built to help alliances in the mobile game **Whiteout Survival** organize, plan, and share strategies for **Foundry Battle** events.

## Current State & Implemented Features
The application is fully functional and connected to Firebase Firestore. 

### 1. Player Signup (`/signup`)
- Players register using their **In-Game Name** and **In-Game ID**.
- Players vote on their availability across the 5 standard event time slots (02:00, 07:00, 12:00, 14:00, 19:00 UTC).
- **Data Model:** Records are saved to the `players` Firestore collection using the In-Game ID as the document ID to prevent duplicates.

### 2. Admin Dashboard (`/admin`)
- Displays a real-time Angular Material data table of all registered players and their availability.
- Admin can select the final battle time.
- Admin can assign a roster role to each player: **Main**, **Sub**, or **Unassigned**.

### 3. Battle Plan Builder (`/admin/plan-builder`)
- **Task Library:** Admin can create and save reusable task templates (e.g., "Garrison Leader") to the `tasks` collection.
- **Map & Assignments:** 
  - Admin can select a phase (Phase 1 or 2), a player, a map location, and a task.
  - The assignment is saved to the `assignments` collection.
  - Includes an interactive map preview showing the layout of the Foundry buildings with colored pins (Blue = Outer, Red = Central) overlaying the `battlemap.webp` background.

### 4. Player Views (`/player`)
- **My Personal Plan:** A player enters their In-Game ID to fetch their specific assignments sorted by Phase.
- **Global Map View:** A read-only visual map showing the locations of the buildings on the `battlemap.webp` background.

## Environment & Deployment
- The project is configured to use Firebase. The live configuration is stored in `src/environments/environment.ts`.
- Deployment target: Standard static web hosting (e.g., Firebase Hosting, GitHub Pages, or any standard web server), as all backend logic is handled securely via Firestore.
