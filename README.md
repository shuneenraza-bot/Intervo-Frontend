# Intervo Frontend

React + Vite frontend for Intervo, an AI interview coaching platform with three portals: candidate, employer and admin.

## Run it

```powershell
npm install
Copy-Item .env.example .env
npm run dev          # http://localhost:5173
```

Other scripts: `npm run build` (production build into `dist/`), `npm run preview`, `npm run lint`.

## Connecting the backend

The app can run fully in the browser (data in `localStorage`) or send some modules to the FastAPI backend in `../Intervo-Backend`. Two settings in `.env` control this. Restart `npm run dev` after changing them.

```
VITE_BACKEND_MODULES=auth,employer
VITE_API_URL=http://localhost:8000/api
```

| Setting | Meaning |
|---|---|
| `VITE_BACKEND_MODULES` | Comma-separated list of modules served by the backend. Empty = everything stays in the browser and no server is needed. |
| `VITE_API_URL` | Base URL of the backend, including `/api`, no trailing slash. |

| Module | What goes to the backend |
|---|---|
| `auth` | Account lookup, sign up, sign in (password or Face ID), Face ID enrol/delete, current user. The JWT is stored in the browser; a `401` signs the user out. |
| `employer` | Configuration (`GET /api/config`), job postings (list, create, edit, close/reopen), apply/withdraw, application status, candidate ranking. Needs `auth`. |

Everything else (CV analysis, interviews, sessions, progress, admin configuration) runs in the browser for now.

How the two sides fit together:

- After a backend sign-in or sign-up, the returned user is copied into the local store under the same id, so the candidate pages that still read the local store keep working. The demo accounts have the same ids in `src/data.js` and in the backend seed.
- With `employer` on, the candidate's **Job Matches** page lists jobs from the backend and applies/withdraws through it, so employers see real applicants.
- The employer's suitability score is calculated by the backend from what is in its database. A candidate's CV analysis and practice sessions are still local, so a newly registered candidate appears to the employer with no CV or interview evidence yet. The seeded demo candidates have evidence.
- If the backend is not running, the app shows "Can't reach the server — is the backend running?" instead of failing.

Start the backend first (see its README): `uvicorn app.main:app --reload --port 8000`. API docs are at http://localhost:8000/docs and the contract is in [API.md](API.md).

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Candidate | ayesha@intervo.demo | Demo@1234 |
| Employer | hr@northstar.demo | Demo@1234 |
| Admin | admin@intervo.demo | Admin@1234 |

## Project layout

```
src/
  api.js        Service layer: routes each call to the backend or the local store, per module
  store.jsx     App-wide store backed by localStorage (also the cache for backend data)
  data.js       Demo seed and admin configuration
  lib.js        Scoring, matching and suitability logic used by the local modules
  Auth.jsx      Sign in / sign up, Face ID
  CandidateApp.jsx, EmployerApp.jsx, AdminApp.jsx   The three portals
```
