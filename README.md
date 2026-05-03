# Foundry Planner

Web app for organizing **Whiteout Survival** alliance strategies during **Foundry Battle** events. Alliance members sign up with their availability, and admins assign roles and battle plans on an interactive map.

Live: **https://foundry-planner.web.app**
Part of the [plannet-wos](https://github.com/plannet-wos) suite.

## Setup

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. To run multiple apps side-by-side, override the port with `npm start -- --port 4XXX`.

## Firebase config

The Firebase web API key in `src/environments/environment.ts` is intentionally checked in. Firebase web API keys are [designed to be public](https://firebase.google.com/docs/projects/api-keys) — security is enforced by Firestore/Auth rules, not the key.

The repo also ships `firestore.rules` and `firestore.indexes.json` for the Firestore configuration (deployed via `firebase deploy --only firestore`).

## Contributing

Fork the repo, create a branch, open a PR. No write access needed.

<details>
<summary>Angular CLI commands</summary>

```bash
ng generate component component-name   # scaffold a component
ng build                                # production build into dist/
ng test                                 # run Vitest unit tests
```

For more, see the [Angular CLI reference](https://angular.dev/tools/cli).

</details>
