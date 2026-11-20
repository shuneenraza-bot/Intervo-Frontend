# Intervo REST API

The endpoints the FastAPI backend must provide for the frontend. The frontend calls them from [src/api.js](src/api.js) for each module listed in `VITE_BACKEND_MODULES` (`auth`, `employer`, `candidate`, `admin`; see the README and the backend's `/docs` for the `candidate` and `admin` endpoints). The other functions run locally in the browser. Those local versions are the reference behaviour: if anything here is unclear, the matching function in `src/lib.js` or `src/cvParser.js` shows exactly what to return.

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
| `setApplicationStatus` | PATCH | `/applications/{applicationId}/status` | employer (owner) |
| `getMyApplications` | GET | `/applications/mine` | candidate |
| `getApplicationCV` | GET | `/applications/{applicationId}/cv` | employer (owner) |
| `downloadApplicationCV` | GET | `/applications/{applicationId}/cv-file` | employer (owner), after the candidate accepts |
| (account deletion) | DELETE | `/auth/me` | candidate |
| `respondToApplication` | POST | `/applications/{applicationId}/respond` | candidate (own) |
| `getNotifications` | GET | `/notifications` | any signed-in user |
| `getUnreadCount` | GET | `/notifications/unread-count` | any signed-in user |
| `markNotificationRead` | POST | `/notifications/{id}/read` | any signed-in user (own) |
| `markAllNotificationsRead` | POST | `/notifications/read-all` | any signed-in user |
| `loadAdminData`, `addDomain`, `saveRole`, `saveSkill`, `saveQuestion`, `setCriterion`, `setRules` … | GET / POST / PUT / DELETE | `/admin/*` (see [Admin endpoints](#admin-endpoints)) | admin |

---

### Sign in and sign up are two-factor: password, then face

Every role, at sign-up and at sign-in, needs **both** steps. A password alone never gives access.

1. `POST /auth/login` (or `POST /auth/signup`) returns a **face-pending token**: a JWT with `scope: "face_pending"` that lives 5 minutes.
2. `POST /auth/face/verify` (face already enrolled) or `POST /auth/face/enroll` (not enrolled) takes that token and returns the **full token**.

Only full tokens open any other endpoint. A face-pending token gets `401` everywhere except the two face endpoints, and a full token gets `401` on those two. An account with no face enrolled gets `401` on every endpoint except the face step. There is no face-only login, no "password or face" choice, no skip, and no delete.

### POST `/auth/login`
Step 1. Checks the account (email **and** role tab) and the password.

Request: `{ "email": "ayesha@intervo.demo", "role": "candidate", "password": "Demo@1234" }`

Response `200`: `{ "pendingToken": "<jwt, scope face_pending>", "faceEnrolled": true, "expiresIn": 300 }`. `faceEnrolled` is `true` only for a current landmark template (`v: 2`). Older pixel templates count as `false`, so those users enrol again. The response never holds a full `token` or a `user`.

Errors:
- `404`: `"No account found with this email."`, or for a different role tab `"No candidate account found with this email."` (use the requested role). **Never reveal the account's real role.**
- `401`: `"Incorrect password."`
- `429`: blocked. A `Retry-After` header gives the seconds; the UI shows a countdown.

### POST `/auth/face/verify`
Step 2 for an enrolled account. Header: `Authorization: Bearer <pendingToken>`.

```json
{
  "template": { "v": 2, "method": "landmarks", "features": [1.02, 0.47, …] },
  "liveness": { "blink": true }
}
```
`template` is the live landmark geometry from the browser. It is captured only after the blink liveness check passes, and `liveness.blink` must be `true`. Compare it with the stored `face.template.features` the way `compareGeometry` in `src/faceCues.js` does: `similarity = max(0, 1 − mean(|a − b|) / 0.12)`. Accept it when `similarity ≥ config.rules.faceThreshold`. Reference implementation: `completeFace` in `src/api.js`. The blink is detected in the browser; a server can't re-check a blink from a template.

Response `200`: `{ "token": "<full jwt>", "user": User }`, and `user.lastLogin = { at, method: "face" }` (this means password + face).

Errors:
- `401`: `"Face didn't match this account. 2 attempts left."`; or the pending token is missing, expired or already spent (`"Too many failed face attempts. Enter your password again to continue."`). The frontend sends the user back to the password step.
- `400`: no face enrolled, or `liveness.blink` is `false`.
- `429`: blocked (see below).

### POST `/auth/face/enroll`
Step 2 for an account with no face yet (every new sign-up, and any user an admin reset). Header: `Authorization: Bearer <pendingToken>`.

Request: `{ "template": { "v": 2, "method": "landmarks", "features": [...] } }`. Response `200`: `{ "token": "<full jwt>", "user": User }`. `409` if a face is already enrolled (verify it instead).

**Attempt limits.** The frontend mirrors these, but the server enforces them:
- 5 wrong passwords for an email → block sign-in for that email for 60 seconds (`429`, `Retry-After: 60`).
- 3 failed face attempts → block that login for 5 minutes (`429`, `Retry-After: 300`). The pending token is spent, so the user needs a new password step after the block.
- A successful password step resets both counters.

### POST `/auth/signup`
Creates a candidate or employer account. Admin accounts can't sign up. For a candidate, also create an empty profile (`skills: []`, `shareWithEmployers: false`, `consentAt: now`). The account has **no face**: it must enrol one through `/auth/face/enroll` before there is a full token.

Request:
```json
{
  "role": "candidate",            // "candidate" | "employer"
  "name": "Ayesha Khan",
  "email": "ayesha@intervo.demo",
  "company": "Northstar Digital", // employers only
  "password": "Demo@1234",
  "dataConsent": true             // candidates must consent
}
```
Response `201`: `{ "pendingToken": "<jwt>", "faceEnrolled": false, "expiresIn": 300 }`

Errors: `409` email already registered · `422` invalid input.

### GET `/auth/me` · PUT `/auth/face`
Full token only. `GET /auth/me` returns the signed-in `User` and is called once on page load to check a remembered sign-in. `PUT /auth/face` takes `{ "template": { "v": 2, "method": "landmarks", "features": [...] } }` and **re-enrols** (replaces) the face from Profile & Privacy. A face can't be deleted.

### GET `/config`
The admin configuration in the shape of `config` in `src/data.js` (`domains`, `skills`, `roles`, `questions`, `criteria`, `rules`). The employer pages use it for role templates and the skill library; the candidate and interview code read the rules.

### POST `/cv/analyze`
Extracts text from a CV and parses it into sections. **Also saves the result on the caller's profile** (`cv` and `skills`), because the employer's CV match reads it.

Request: `multipart/form-data` containing **either** `file` (PDF/DOCX/TXT, max 5 MB) **or** `text` (pasted CV).

The server **also keeps the original file** under `storage/cvs/` with a random name (pasted text is stored as `pasted-cv.txt`). The file name, type, size and upload date are saved in the database. Only the latest upload is the candidate's current CV; an older file is deleted once no application needs it.

Response `200`:
```json
{
  "cv": ParsedCV,
  "text": "full extracted plain text",
  "file": { "name": "ayesha_cv.pdf", "size": 48213, "contentType": "application/pdf", "uploadedAt": 1795174727547 }
}
```
`file` is `null` for a CV uploaded before files were kept. `GET /cv` returns the same shape.
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
Candidate only. Replaces what the employer's CV match reads from the profile:

```ts
{ skills: string[];
  cv: { education: { degree, institution }[]; experienceYears: number; projects: { name }[] } | null;
  shareWithEmployers: boolean }
```
Response `200`: the same object as stored. CV text and contact details are not sent, and are ignored if present.

The frontend calls it after a CV analysis or edit is saved (`syncProfileSoon`, in the background), when the sharing switch changes (`syncProfile`, the switch only moves if the server accepted it), and once just before `applyToJob`. Interview sessions are not sent to the employer-side backend.

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
Request: `{ "consent": true }`. Consent means "share my CV skill match with this employer". Interview results are never shared with employers. If `consent` is true, also set the candidate's `profile.shareWithEmployers = true`.

**A CV is required.** A candidate without an uploaded CV gets `400` with `detail: "Upload your CV before applying"`. On apply, the server copies the candidate's current parsed CV and a reference to the current CV file into the application (a snapshot). Later uploads or edits never change what that employer received, and the CV match for that application is computed from the snapshot.

Response `201`: `Application`. Errors: `400` no CV · `409` already applied · `404` job missing or closed.

### DELETE `/jobs/{jobId}/apply`
Withdraws the caller's application. Response `204`. The CV file kept for that application is deleted, unless it is the candidate's current CV or another application still uses it. (`DELETE /auth/me` deletes a candidate account with all its applications and stored CV files.)

### GET `/jobs/{jobId}/candidates`
Ranks the applicants for one job by **CV skill match only**. Employers never see interview data: no sessions, interview or practice scores, weak skills, session counts, trends or answer text anywhere in this response. Reference: `cvFit` in `src/lib.js`, `getCandidatesSync` in `src/api.js` and `cv_fit` in the backend's `app/services/matching.py`.

**Privacy rule:** return details only for applicants where `application.consent` is true **and** `profile.shareWithEmployers` is not false. Count the rest in `hidden`, with no details.

**Ranking:** `match.percentage`, highest first; ties keep the order the candidates applied in. `meetsCriteria` is true when `percentage >= job.success.minMatch`. The `checks` come from the job description: "3+ years" adds an experience check and "Bachelor's…" an education check (the same reading the candidate's job-description match uses), compared with the CV's years of experience and degrees. A job whose description states neither has no checks.

Response `200`:
```json
{
  "job": Job,
  "hidden": 1,
  "candidates": [
    {
      "application": Application,
      "candidate": { "id": "cand-1", "name": "Ayesha Khan", "email": "ayesha@intervo.demo" },
      "cvSummary": { "topDegree": "BS Computer Science", "experienceYears": 1.5, "projectCount": 2 },
      "match": CVMatch
    }
  ]
}
```
`cvSummary` and `match` come from the CV snapshot taken when the candidate applied. `cvSummary` is `null` when that CV had no summary. Nothing else is returned: no profile or CV text. `candidate` is only `{ id, name }`. When `application.status` is `"accepted"` the entry also has `contact: { name, email, phone }` (`phone` comes from the candidate's CV and is `null` without one); before that there is no `contact` key and no email or phone anywhere.

### GET `/applications/{applicationId}/cv`
Employer (job owner). The CV the candidate applied with (the snapshot), only for applicants where `application.consent` is true **and** `profile.shareWithEmployers` is not false. Never contains interview data.
```ts
ApplicationCV {
  applicationId: string; status: string;
  cv: { summary: string; skills: string[]; otherSkills: string[]; education: Education[]; experience: Experience[];
        projects: Project[]; certifications: string[]; experienceYears: number };   // no name, email, phone, LinkedIn or GitHub
  file: { name: string; size: number; contentType: string; uploadedAt: number } | null;   // only once status is "accepted"
  contact: { name: string; email: string; phone: string | null } | null;                   // only once status is "accepted"
}
```
Errors: `403` not the job owner, or the candidate didn't consent · `404` unknown application.

### GET `/applications/{applicationId}/cv-file`
Employer (job owner). The **original CV file** as uploaded, with its own `Content-Type`. PDFs are sent `inline`, DOCX and TXT as `attachment`. Allowed only when the application is `accepted`, the caller owns the job and the candidate consented; every other case is `403` (`404` for an unknown application, or when no file was stored). The frontend downloads it with the bearer token and saves or opens the blob.

### Shortlist flow

`applied → shortlisted → accepted | declined_by_candidate`. The employer can also set `not_progressing`. Every change is stored with its time, the employer's `employerMessage` and the candidate's `candidateNote`.

### PATCH `/applications/{applicationId}/status`
Employer (job owner). Request: `{ "status": "shortlisted" | "not_progressing", "message"?: string }` (`message` up to 500 characters, else `422`). Response `200`: `Application`. The candidate gets a notification. Errors: `403` not the job owner · `404` unknown application · `409` the candidate has already answered, or the application already has that status.

### GET `/applications/mine`
Candidate. Their own applications, newest first:
```ts
MyApplication {
  id: string; jobId: string; jobTitle: string; company: string;
  status: "applied" | "shortlisted" | "accepted" | "declined_by_candidate" | "not_progressing";
  employerMessage: string | null; candidateNote: string | null;
  appliedAt: number; updatedAt: number;
  history: { status: string; at: number; employerMessage?: string; candidateNote?: string }[];
  employer: { name: string; company: string | null; email: string } | null;   // only once status is "accepted"
}
```

### POST `/applications/{applicationId}/respond`
Candidate (own application). Request: `{ "decision": "accept" | "decline", "note"?: string }` (`note` up to 500 characters). Response `200`: `MyApplication`. Errors: `403` not their application · `409` not shortlisted, or already answered (an answer can't be changed) · `422` bad decision or long note. The employer gets a notification. Accepting shares contact details both ways; declining shares nothing.

### Notifications
Each user sees only their own. `Notification { id, type: "shortlisted" | "not_progressing" | "accepted" | "declined", title, body, link, createdAt, readAt: number | null, read: boolean }`. `link` is an in-app route: `/applications` for candidates, `/candidates?job={jobId}` for employers.

| Method | Path | Response |
|---|---|---|
| GET | `/notifications?limit=50` | `Notification[]`, newest first (limit 1 to 100) |
| GET | `/notifications/unread-count` | `{ "count": number }` (the bell polls this every 30 s) |
| POST | `/notifications/{id}/read` | `Notification`; `404` for an unknown or someone else's id |
| POST | `/notifications/read-all` | `{ "count": 0 }` |

---

## Admin endpoints

Every route needs an admin account (`403` otherwise, `401` without a token). Bodies are validated with Pydantic (`422` with a readable `detail`). Unknown ids are `404`, duplicate names `409`, and deleting something that is in use is `409` with a message such as `Skill is used by a role ("Frontend Developer"). Remove it from the role first.` The frontend shows these messages as they are.

Changes apply immediately: the interview engine, CV matching, evaluation and the employer list read the configuration from the database on every request, and nothing is cached. `GET /config` always returns the current values.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET · POST | `/admin/domains` | `{ name }` | `409` duplicate name |
| PUT · DELETE | `/admin/domains/{id}` | `{ name }` | delete: `409` while a role uses it |
| GET · POST | `/admin/roles` | `{ title, domainId, skills: [{ name, weight 1-3 }] }` | at least one skill; `422` unknown skill or domain |
| PUT · DELETE | `/admin/roles/{id}` | same | delete: `409` while a job uses it |
| GET · POST | `/admin/skills` | `{ name, aliases[], related[], tip }` | `related` are skill names; aliases are stored lowercase |
| PUT · DELETE | `/admin/skills/{id}` | same | renaming updates other skills' `related`; delete: `409` while a role or job uses it, removes its question templates |
| GET · POST | `/admin/questions?skill=` | `{ skill, type: "technical" \| "behavioral", text, keywords[], followUp }` | `409` if the skill already has that text |
| PUT · DELETE | `/admin/questions/{id}` | same | |
| GET · PUT | `/admin/criteria` | `{ criteria: [{ key, weight 1-3, enabled }] }` | `404` unknown key; at least one must stay enabled |
| GET · PUT | `/admin/rules` | any of `weakThreshold` 30-90, `weakMinSessions` 1-5, `followUpBelow` 30-80, `defaultQuestions` 3-6, `faceThreshold` 0.3-0.9 | omitted fields keep their value; returns all five |
| GET | `/admin/users?role=` | | `{ id, name, email, role, company, faceEnrolled, createdAt, sessions, jobs }`; never a password hash or face template |
| POST | `/admin/users/{id}/reset-face` | | Clears the user's face template and returns the same row with `faceEnrolled: false`. `404` unknown id. Their open sessions get `401` and they enrol a new face at the next sign-in |
| GET | `/admin/stats` | | counts for the overview: `candidates, employers, admins, sessions, jobs, openJobs, applications, domains, roles, skills, questions, criteriaEnabled` |

Responses use the shapes of `config` in `src/data.js` (a skill also carries its `id`). POST returns `201` with the stored item; DELETE returns `204`.

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
  success: { minMatch: number; notes: string };   // minimum CV skill match (0-100); there is no interview score
}

Application {
  id: string; jobId: string; candidateId: string;
  date: number; consent: boolean;
  status: "applied" | "shortlisted" | "accepted" | "declined_by_candidate" | "not_progressing";
  employerMessage?: string | null; candidateNote?: string | null; updatedAt?: number;
}

CVMatch {                           // the only per-candidate result employers get
  percentage: number;               // 0-100, weighted by skill weight; a related skill counts half
  matched: Skill[]; partial: (Skill & { via: string })[]; missing: Skill[];
  checks: { key: "experience" | "education"; label: string; required: string; actual: string; met: boolean }[];
  meetsCriteria: boolean;           // percentage >= job.success.minMatch
}
// Skill = { name: string; weight: number }
```

## Not covered yet

These still run only in the browser, whatever `VITE_BACKEND_MODULES` says. Add endpoints when the backend is ready for them (the `candidate` module covers CV, JD and interviews and the `admin` module the admin console on the backend; `/interview/evaluate` and `GET /sessions` above are only used in local mode):

- Profile edits: name, per-application consent, saved jobs, account and data deletion (`ProfilePage.jsx`, `JobsPage.jsx`).
- Recording `lastLogin` after face verification (`completeFace` in `api.js`).
- Fetching a user's profile from the server. The candidate's own profile currently comes from the local cache, filled by `analyzeCV`.
