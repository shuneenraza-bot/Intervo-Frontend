# Intervo REST API

The endpoints the FastAPI backend must provide for the frontend. The frontend calls them from [src/api.js](src/api.js) for each module listed in `VITE_BACKEND_MODULES` (`auth`, `employer`, `candidate`; see the README and the backend's `/docs` for the `candidate` endpoints). The other functions run locally in the browser. Those local versions are the reference behaviour: if anything here is unclear, the matching function in `src/lib.js` or `src/cvParser.js` shows exactly what to return.

## Conventions

- **Base URL**: `VITE_API_URL` (default `http://localhost:8000/api`). Paths below are relative to it. Enable CORS for the frontend origin (`http://localhost:5173` in dev).
- **Auth**: `/auth/login` and `/auth/signup` return a JWT (`/auth/lookup` doesn't). Every other request sends `Authorization: Bearer <token>`. Return `401` when the token is missing or expired, and the frontend signs the user out.
- **JSON**: request and response bodies are JSON, except `POST /cv/analyze`, which takes `multipart/form-data`.
- **Field names are camelCase** (`createdAt`, `candidateId`), as written below. In Pydantic, use `alias_generator=to_camel` with `populate_by_name=True`.
- **IDs** are strings. **Timestamps** are Unix epoch **milliseconds** (integers).
- **Errors**: send a non-2xx status with `{"detail": "Message shown to the user"}`. The frontend displays `detail` as-is, so write it for end users. FastAPI's default validation errors (422) are handled too.

## Endpoints

| Function in `api.js` | Method | Path | Who |
|---|---|---|---|
| `lookupAccount` | POST | `/auth/lookup` | public |
| `login` | POST | `/auth/login` | public |
| `signup` | POST | `/auth/signup` | public |
| `restoreSession` | GET | `/auth/me` | signed in |
| `enrolFace` | PUT | `/auth/face` | signed in |
| `deleteFace` | DELETE | `/auth/face` | signed in |
| `getConfig` | GET | `/config` | signed in |
| `analyzeCV` | POST | `/cv/analyze` | candidate |
| `parseJD` | POST | `/jd/parse` | candidate |
| `evaluateAnswer` | POST | `/interview/evaluate` | candidate |
| `getSessions` | GET | `/sessions?userId=…` | candidate (own) |
| `saveSession` | POST | `/sessions` | candidate |
| `syncProfile` | PUT | `/profile` | candidate |
| `getJobs` | GET | `/jobs` | any signed-in user |
| `saveJob` (new) | POST | `/jobs` | employer |
| `saveJob` (edit) | PUT | `/jobs/{jobId}` | employer (owner) |
| `applyToJob` | POST | `/jobs/{jobId}/apply` | candidate |
| `withdrawApplication` | DELETE | `/jobs/{jobId}/apply` | candidate |
| `setJobStatus` | PATCH | `/jobs/{jobId}/status` | employer (owner) |
| `getCandidates` | GET | `/jobs/{jobId}/candidates` | employer (owner) |
| `setApplicationStatus` | PATCH | `/applications/{applicationId}` | employer (owner) |

---

### POST `/auth/lookup`
Sign-in step 1. Checks that an account exists for this email **and** role tab, and tells the UI whether to offer Face ID.

Request: `{ "email": "ayesha@intervo.demo", "role": "candidate" }`

Response `200`: `{ "faceEnabled": true }`. `true` only when `face.template` is a current landmark template (`v: 2`). Older pixel templates count as `false`, so those users re-enrol in Profile & Privacy.

Errors (`404`):
- Email not registered: `"No account found with this email."`
- Email registered under a different role: `"No candidate account found with this email."` (use the requested role). **Never reveal the account's real role.**

### POST `/auth/login`
Sign-in step 2. The user signs in with **one** method. Password and Face ID are alternatives, and either one is enough. The body holds either `password` or `faceTemplate`, never both.

Password:
```json
{ "email": "ayesha@intervo.demo", "role": "candidate", "password": "Demo@1234" }
```
Face ID:
```json
{ "email": "ayesha@intervo.demo", "role": "candidate", "faceTemplate": { "v": 2, "method": "landmarks", "features": [1.02, 0.47, …] } }
```
`faceTemplate` is the live landmark geometry from the browser. It is captured only after the blink liveness check passes. Compare it with the stored `face.template.features` the way `compareGeometry` in `src/faceCues.js` does: `similarity = max(0, 1 − mean(|a − b|) / 0.12)`. Accept the template when `similarity ≥ config.rules.faceThreshold`. Reference implementation: `login` in `src/api.js`.

On success, set `user.lastLogin = { at: now, method: "password" | "face" }`.

Response `200`: `{ "token": "<jwt>", "user": User }`

Errors:
- `404`: same messages as `/auth/lookup`.
- `401`: `"Incorrect password."` or `"Face didn't match this account."`
- `400`: `"Face ID isn't set up for this account."` (a `faceTemplate` was sent but the account has no landmark template).
- `429`: too many attempts. Send a `Retry-After` header in seconds. The UI shows a countdown.

**Attempt limits.** The frontend applies these too, but the server must enforce them:
- 5 wrong passwords for an email → block **all** sign-in for that email for 60 seconds (`429`, `Retry-After: 60`).
- 3 failed Face ID attempts → reject `faceTemplate` logins for that email until a successful password sign-in (`429` or `401`). The frontend locks Face ID for the browser session and switches to the password tab.
- A successful sign-in resets both counters.

### POST `/auth/signup`
Creates a candidate or employer account. Admin accounts can't sign up. For a candidate, also create an empty profile (`skills: []`, `shareWithEmployers: false`, `consentAt: now`).

Request:
```json
{
  "role": "candidate",            // "candidate" | "employer"
  "name": "Ayesha Khan",
  "email": "ayesha@intervo.demo",
  "company": "Northstar Digital", // employers only
  "password": "Demo@1234",
  "dataConsent": true,            // candidates must consent
  "face": { "template": { "v": 2, "method": "landmarks", "features": [1.02, 0.47, …] } }  // 276 landmark ratios, or null if skipped; older accounts may hold a 576-number array (pixel fallback)
}
```
Response `201`: `{ "token": "<jwt>", "user": User }`

Errors: `409` email already registered · `422` invalid input.

### GET `/auth/me` · PUT `/auth/face` · DELETE `/auth/face`
All three return the signed-in `User`. `GET /auth/me` is called once on page load to check a remembered sign-in. `PUT /auth/face` takes `{ "template": { "v": 2, "method": "landmarks", "features": [...] } }` and enrols or replaces Face ID; `DELETE` removes it.

### GET `/config`
The admin configuration in the shape of `config` in `src/data.js` (`domains`, `skills`, `roles`, `questions`, `criteria`, `rules`). The employer pages use it for role templates, the skill library and the suitability weights.

### POST `/cv/analyze`
Extracts text from a CV and parses it into sections. **Also saves the result on the caller's profile** (`cv` and `skills`), because employers' suitability scores read it.

Request: `multipart/form-data` containing **either** `file` (PDF/DOCX/TXT, max 5 MB) **or** `text` (pasted CV).

Response `200`:
```json
{ "cv": ParsedCV, "text": "full extracted plain text" }
```
Errors: `422` with a helpful `detail`, e.g. `"This PDF has almost no selectable text — it is probably a scanned image…"`.

### POST `/jd/parse`
Pulls requirements out of a job description. The CV page calls this as the user types (debounced to 400 ms), so it should be fast. `roleSkills` gives default weights for skills the JD doesn't stress.

Request: `{ "text": "…job description…", "roleSkills": [{ "name": "React", "weight": 3 }] }`

Response `200`:
```json
{
  "title": "Junior Frontend Developer",
  "skills": [{ "name": "React", "weight": 3 }],  // weight 3 = must-have, 2 = normal, 1 = nice-to-have
  "minYears": 1,
  "education": "Bachelor's in Computer Science",
  "fresherFriendly": true
}
```

### POST `/interview/evaluate`
Scores one answer using the admin-configured criteria and weights. Rubric reference: `evaluateAnswer` in `src/lib.js`. This is where the Gemini evaluator plugs in.

Request: `{ "answer": "When I was building…", "question": Question }`

Response `200`:
```json
{
  "score": 72,                                   // 0–100, weighted over applicable criteria
  "criteria": { "technical": 70, "relevance": 78, "completeness": 66, "clarity": 80, "communication": 74 },
  "words": 96,
  "starParts": ["situation", "action"],          // subset of situation | task | action | result
  "keyHits": ["state", "props"],                 // question keywords found in the answer
  "tips": ["Add a concrete example from a project and say what the outcome was."],
  "needsFollowUp": false                         // true → UI offers question.followUp
}
```
`criteria` must contain only the criteria that apply to the question's type (`technical` or `behavioral`). The UI shows exactly those.

### GET `/sessions?userId={userId}`
A candidate's practice sessions. Candidates may only read their own: return `403` for any other `userId`.

Response `200`: `Session[]`

### POST `/sessions`
Stores a finished session. The body is a `Session` **without `id`**. Set `userId` from the token, not from the body.

Response `201`: the stored `Session` (with `id`).

**Built as a score sync.** With the `employer` module on (and `interview` off), the browser still scores and stores sessions itself, and sends a copy of each finished one here so the employer's ranking has real data:

```ts
{ id: string; roleId: string; mode: "text" | "voice" | "video"; date: number; score: number;
  answers: { questionId, question, skill, type, score, criteria, indicators, reason }[] }
```
- No answer text or follow-up is sent; the server stores `answer: ""`.
- `id` is the browser's session id. Sending an id the candidate already saved returns the stored session with `200` and changes nothing, so re-sending is safe. An id that belongs to someone else is `409`.
- Skills, roles and questions the server doesn't know are stored without the link (`skill: ""`, `roleId: null`, `questionId: null`).

### PUT `/profile`
Candidate only. Replaces what the suitability score reads from the profile:

```ts
{ skills: string[];
  cv: { education: { degree, institution }[]; experienceYears: number; projects: { name }[] } | null;
  shareWithEmployers: boolean }
```
Response `200`: the same object as stored. CV text and contact details are not sent, and are ignored if present.

The frontend calls it after a CV analysis or edit is saved (`syncProfileSoon`, in the background), when the sharing switch changes (`syncProfile`, the switch only moves if the server accepted it), and once, together with every local session, just before `applyToJob`.

### GET `/jobs`
Response `200`:
```json
{ "jobs": Job[], "applications": Application[] }
```
- `jobs`: every job. Candidates only see `status: "open"` jobs in the UI, but returning all of them is fine.
- `applications`: the ones the caller may see. A **candidate** gets their own. An **employer** gets all applications on their own jobs (used for applicant counts).

### POST `/jobs` · PUT `/jobs/{jobId}`
Create or update a posting. On create, the server sets `id`, `employerId`, `company` (from the employer's account) and `createdAt`. On update, only the owner may edit. The body is the whole `Job`. Closing or reopening a job is `PATCH /jobs/{jobId}/status` with `{ "status": "open" | "closed" }`, which returns the stored `Job`.

Response `201` / `200`: the stored `Job`.

### POST `/jobs/{jobId}/apply`
Request: `{ "consent": true }`. Consent means "share my CV match and interview results with this employer". If `consent` is true, also set the candidate's `profile.shareWithEmployers = true`.

Response `201`: `Application`. Errors: `409` already applied · `404` job missing or closed.

### DELETE `/jobs/{jobId}/apply`
Withdraws the caller's application. Response `204`.

### GET `/jobs/{jobId}/candidates`
Ranks the applicants for one job with an explainable suitability score. Reference: `suitability` in `src/lib.js` and `getCandidatesSync` in `src/api.js`.

**Privacy rule:** return evidence only for applicants where `application.consent` is true **and** `profile.shareWithEmployers` is not false. Count the rest in `hidden`, with no details.

Response `200`:
```json
{
  "job": Job,
  "hidden": 1,
  "candidates": [
    {
      "application": Application,
      "candidate": { "id": "cand-1", "name": "Ayesha Khan", "email": "ayesha@intervo.demo" },
      "profile": Profile,
      "sessions": Session[],
      "fit": Suitability
    }
  ]
}
```

### PATCH `/applications/{applicationId}`
Request: `{ "status": "shortlisted" }`. Allowed values: `"new"`, `"shortlisted"`, `"declined"`. Response `200`: `Application`.

---

## Shared models

```ts
User {
  id: string; role: "candidate" | "employer" | "admin";
  name: string; email: string; company?: string;      // company: employers only
  createdAt: number;
  face: { template: { v: 2; method: "landmarks"; features: number[] } | number[]; enrolledAt: number } | null;
  lastLogin?: { at: number; method: "password" | "face" | "signup" };
  // never return the password hash
}

Profile {            // candidate only
  skills: string[];                 // skill names from the admin skill library
  shareWithEmployers: boolean;
  roleId?: string; cv?: ParsedCV; fileName?: string;
  result?: object;                  // last skill-gap analysis, stored by the frontend
}

ParsedCV {
  contact: { name, email, phone, linkedin, github, location: string };
  summary: string;
  skills: string[];                 // recognised library skills
  otherSkills: string[];            // listed on the CV but not in the library
  education:  { degree, institution, dates, score: string }[];
  experience: { title, company, dates, details: string; months?: number }[];
  projects:   { name, details: string; tech: string[] }[];
  certifications: string[];
  experienceYears: number;          // e.g. 1.5
  sectionsFound: string[];          // e.g. ["education", "skills"]
  warnings: string[];               // shown to the user, e.g. "No skills were recognised…"
}

Question {           // from the admin question bank
  id: string; skill: string; type: "technical" | "behavioral";
  text: string; keywords: string[]; followUp: string;
  reason?: "weakness" | "gap" | "role" | "general";
}

Session {
  id: string; userId: string; roleId: string; roleTitle: string;
  mode: "text" | "voice" | "video"; date: number; score: number;
  answers: {
    questionId: string; question: string; skill: string; type: string;
    score: number; criteria: Record<string, number>; answer: string;
    reason?: string;
    followUp: { question: string; answer: string; before: number } | null;
    indicators: object | null;      // video-mode presentation cues
  }[];
}

Job {
  id: string; employerId: string | null; company: string;
  title: string; roleId: string; description: string;
  location: string; mode: "On-site" | "Hybrid" | "Remote";
  level: string; type: string;      // e.g. "Entry level", "Full-time"
  status: "open" | "closed"; createdAt: number;
  skills: { name: string; weight: 1 | 2 | 3 }[];
  success: { minScore: number; minMatch: number; notes: string };
}

Application {
  id: string; jobId: string; candidateId: string;
  date: number; consent: boolean;
  status?: "new" | "shortlisted" | "declined";
}

Suitability {
  total: number;                    // 0–100
  factors: { key: "cv" | "interview" | "consistency"; label: string; value: number; weight: number; detail: string }[];
  cv: { matched: Skill[]; partial: (Skill & { via: string })[]; missing: Skill[]; percentage: number };
  evidence: (Skill & { perf?: { skill: string; avg: number; scores: number[]; sessions: number; latest: number; trend: number; weak: boolean } })[];
  avgScore: number;
  meetsCriteria: boolean;
  weak: string[];                   // persistent weak skills
}
// Skill = { name: string; weight: number }
```

## Not covered yet

These still run only in the browser, whatever `VITE_BACKEND_MODULES` says. Add endpoints when the backend is ready for them (the `candidate` module now covers CV, JD and interviews on the backend; `/interview/evaluate` and `GET /sessions` above are only used in local mode):

- Admin configuration: domains, roles, skills, questions, criteria, rules (`AdminApp.jsx`). The local evaluator and parsers read these.
- Profile edits: name, per-application consent, saved jobs, account and data deletion (`ProfilePage.jsx`, `JobsPage.jsx`).
- Recording `lastLogin` after face verification (`Auth.jsx`).
- Fetching a user's profile from the server. The candidate's own profile currently comes from the local cache, filled by `analyzeCV`.
