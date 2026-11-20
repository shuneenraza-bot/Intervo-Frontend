# Intervo: 7-minute demo script (30% evaluation)

A step-by-step walkthrough with what to click and what to say. Timings add up to 7 minutes. Practise it twice with a timer; steps 5 and 6 are the ones that overrun.

## Before the examiners arrive

Do all of this ahead of time. None of it should happen during the 7 minutes.

**Start everything**

```powershell
# Window 1: backend
cd C:\Users\UsEr\Intervo-Backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8000

# Window 2: frontend
cd C:\Users\UsEr\Intervo-Frontend
npm run dev
```

**Open these tabs in Chrome or Edge, in this order**

1. http://localhost:5173 (the app, signed out, on the landing page)
2. http://localhost:8000/docs (Swagger)
3. pgAdmin, connected, with a Query Tool open on the `intervo` database and the queries from [the SQL section](#sql-for-pgadmin) pasted in

**Checklist**

- [ ] http://localhost:8000/api/health shows `{"status":"ok","database":"ok"}`
- [ ] Camera and microphone are already allowed for `localhost:5173` (do one Face ID test run so the browser does not ask during the demo)
- [ ] Your face is evenly lit, with no bright window behind you
- [ ] A CV file (PDF with selectable text) is on the Desktop
- [ ] A short job description is copied to the clipboard, for example: `We need a Junior Frontend Developer with strong React and JavaScript, good CSS, Git, unit testing and REST APIs. TypeScript is a plus.`
- [ ] You have a **new email address** ready for the sign-up (one not used before, for example `demo.candidate1@gmail.com`). An email that is already registered gives an error.
- [ ] Browser zoom at 110 to 125% so the back of the room can read it
- [ ] Laptop on charger, notifications off

**If something fails:** Face not matching → try again in better light (three wrong faces block that login for five minutes); if it keeps failing, reset the face from the admin **Users** page and enrol again. Microphone not transcribing → type the answer in the transcript box. Backend down → the app shows "Can't reach the server"; restart `uvicorn`.

## The demo

| # | Time | Step |
|---|---|---|
| 1 | 0:00 – 0:25 | Landing page |
| 2 | 0:25 – 1:10 | Sign up with face verification |
| 3 | 1:10 – 1:35 | Two-factor sign-in |
| 4 | 1:35 – 1:55 | Attempt limits and admin face reset |
| 5 | 1:55 – 2:45 | CV upload and job description analysis |
| 6 | 2:45 – 4:05 | Video mock interview with a follow-up |
| 7 | 4:05 – 4:30 | Apply with consent |
| 8 | 4:30 – 5:30 | Employer posts a job and views explainable scores |
| 9 | 5:30 – 5:55 | Swagger `/docs` |
| 10 | 5:55 – 6:35 | The same data in pgAdmin |
| 11 | 6:35 – 7:00 | Admin changes the weakness threshold |

### 1. Landing page (0:00 – 0:25)

**Do:** Show the landing page. Scroll once through the sections, then scroll back up.

**Say:** "This is Intervo, our final year project. Fresh graduates often fail interviews because they don't know where they are weak. Intervo reads a candidate's CV, finds the skill gap for a target job, runs mock interviews and tracks weak skills over time. Employers get an explainable suitability score, but only for candidates who agree to share. There are three roles: candidate, employer and admin."

### 2. Sign up with face verification (0:25 – 1:10)

**Do:**
1. Click **Get started**.
2. Choose **Candidate**, click **Continue**.
3. Enter a name, the new email and a password (twice), and tick the terms and consent boxes. Click **Continue to face verification**.
4. On **Set up face verification**, centre your face in the oval and wait for the capture to finish. There is no skip.
5. You land on the candidate dashboard.

**Say:** "Sign-up is a real request to our FastAPI backend. The password is hashed with argon2 before it is stored in PostgreSQL. Face verification is required: the account can't be used until a face is enrolled. We use Google's MediaPipe in the browser to find face landmarks, and we store only measurements between those landmarks, never a photo."

### 3. Two-factor sign-in: password, then face (1:10 – 1:35)

**Do:**
1. Click the **Sign out** icon (top right).
2. Click **Sign in**. Keep the **Candidate** tab, enter the same email and the password, click **Continue to face verification**.
3. Look at the camera and **blink** when asked.

**Say:** "Sign-in has two required steps. The password alone only returns a five-minute face-pending token, which opens nothing but the face step. Then the user must blink within four seconds. That is a liveness check, so a printed photo fails. The live measurements go to the server, which compares them with the stored template and returns the full JWT if they are similar enough."

### 4. Limits and admin reset (1:35 – 1:55)

**Do:**
1. **Sign out**, sign in again, and at the face step cover the camera or look away until it fails.
2. Optional: sign in as the admin, open **Users** and click **Reset face** next to the account.

**Say:** "The server limits attempts: five wrong passwords pause sign-in for sixty seconds, and three wrong faces block that login for five minutes. If someone's camera breaks or their face stops matching, an admin resets their face and they enrol a new one at the next sign-in."

### 5. CV upload and job description analysis (1:55 – 2:45)

**Do:**
1. Open **CV & Skill Gap** in the sidebar.
2. Drop the CV file from the Desktop. Wait for the extracted skills, education, experience and projects.
3. In **Target role**, choose Domain **Technology** and Role **Frontend Developer**.
4. Paste the job description into **Job description**. Point at the skills it detected.
5. Click **Analyse skill gap**. Point at the percentage, then **Matched**, **Partially matched** and **Missing**.

**Say:** "The CV is read in the browser with pdf.js, so the file itself is never uploaded. We extract the skills and compare them with the job description. The match is weighted: skills the job stresses count more, and a related skill counts as a partial match. For example, JavaScript partly covers TypeScript. At this stage the parser uses fixed rules. Gemini-assisted extraction on the server is planned."

### 6. Video mock interview with a follow-up (2:45 – 4:05)

**Do:**
1. Click **Practise these gaps** (or open **Mock Interview**).
2. Choose mode **Video** and **3** questions. Point at **Your session plan**: each question shows why it was picked (Weak skill, CV gap, Role skill).
3. Click **Begin interview**.
4. Question 1: press the record button and give a **deliberately short answer**, one sentence. Click **Submit answer**.
5. The feedback shows scores per criterion and "Your answer looks incomplete." Click **Answer follow-up**, give a fuller answer with an example, click **Submit follow-up**. Point at the score going up.
6. Point at the presentation cues (eye contact, expressiveness).
7. Answer the remaining two questions quickly (type a few words if you are short of time), then click **Finish session** and show the summary.

**Say:** "The interview is adaptive. Questions come from the candidate's weak skills, the gaps in their CV, and the key skills of the role. I'm speaking, and the browser turns speech into text. I'll give a weak answer on purpose." *(after the feedback)* "Each answer is scored against a rubric the admin controls: relevance, completeness, clarity, technical accuracy. Because the answer was incomplete, the system asks a follow-up question, like a real interviewer, and re-scores the combined answer. In video mode MediaPipe also reports eye contact and expressiveness. These are observable cues for the candidate only. We do not claim to measure confidence or personality. The scoring is rule-based for now and will be replaced by Gemini."

### 7. Apply with consent (4:05 – 4:30)

**Do:**
1. Open **Job Matches**. Point at the match percentage on each job.
2. On **Junior Frontend Developer** (Northstar Digital), click **Apply**.
3. Read out the three things that will be shared, tick **I agree to share this evidence**, click **Submit application**.

**Say:** "These jobs come from the database. Before applying, the candidate sees exactly what the employer will receive: skills, per-skill scores, and the number of sessions. Raw answers and video are never shared. Without consent the employer only sees that someone applied."

### 8. Employer posts a job and views explainable scores (4:30 – 5:30)

**Do:**
1. **Sign out**. Click **Sign in**, choose the **Employer** tab, and use the **Demo account** box to fill in `hr@northstar.demo` / `Demo@1234`. Sign in with the password.
2. Open **Job Postings** → **New job**. Title: `Graduate React Developer`. Keep the role template, change one skill weight, set **Minimum interview score** and **Minimum CV skill match**, click **Publish job**.
3. Open **Candidates**. In **Job**, choose **Junior Frontend Developer**.
4. Point at the ranked list, then click the candidate you just created to expand it.
5. Point at **How the score is built**: three lines, each "value × weight", and the total. Point at **Skill evidence**.
6. Set **Your decision** to **Shortlisted**.

**Say:** "Now I'm an employer. A job has required skills with weights, and success criteria. Here are the applicants for the job I applied to a moment ago, ranked by suitability, and my new candidate is in the list. The score is not a black box. It is CV skill match times 40%, plus interview evidence times 45%, plus practice consistency times 15%, and the employer sees every part and the evidence per skill. This ranking is calculated by the backend from PostgreSQL, and candidates who did not consent are hidden."

### 9. Swagger `/docs` (5:30 – 5:55)

**Do:**
1. Switch to the http://localhost:8000/docs tab. Scroll the endpoint list: auth, jobs, applications, profile, sessions.
2. Open **GET /api/health** → **Try it out** → **Execute**. Show the `200` response.
3. Open **GET /api/jobs/{id}/candidates** and show the lock icon.

**Say:** "This is the REST API, built with FastAPI. The documentation is generated from the code. There are eighteen endpoints. Protected ones need a JWT, and the server checks the role, so a candidate cannot call an employer endpoint. We have 46 automated tests covering sign-in, lockout, jobs and the privacy rules."

### 10. The same data in pgAdmin (5:55 – 6:35)

**Do:** Switch to pgAdmin and run these from [the SQL section](#sql-for-pgadmin), one at a time:
1. **Query 1** (users): point at the account you created minutes ago, its Face ID flag and `last_login_method`.
2. **Query 2** (password hash): point at `$argon2id$…`.
3. **Query 3** (jobs): point at `Graduate React Developer`.
4. **Query 4** (applications): point at your application, `consent = true`, `status = shortlisted`.

**Say:** "Everything I just did is in PostgreSQL. Here is the account I created, with an argon2 hash instead of a password. Here is the job I posted as the employer. Here is my application with consent recorded, and the shortlisted status I set a moment ago. The schema has fourteen tables, managed with Alembic migrations, and the ERD is in our repository."

### 11. Admin changes the weakness threshold (6:35 – 7:00)

**Do:**
1. Back in the app: **Sign out** → **Sign in** → **Admin** tab → `admin@intervo.demo` / `Admin@1234`.
2. Open **Criteria & Rules**. Change **Weakness threshold** from 60% to 70%.
3. If there is time: sign in as `ayesha@intervo.demo` (Candidate) and open **Progress**. One more skill is now marked **Weakness**.

**Say:** "Finally, the admin. Nothing is hard-coded: domains, roles, skills, questions, the rubric weights and the rules are all configuration. If I raise the weakness threshold from 60 to 70, more skills are flagged as weak and the next interview focuses on them. To be exact about our progress: at 30% this admin change is saved in the browser. Saving it to the database through the API is part of the next milestone."

**Close with:** "So at 30% we have authentication and the employer module on a real backend and database, and the CV analyzer, interviews and dashboards working in the browser. Next we move evaluation to the server with Gemini and add Whisper for speech. Thank you."

## What is real and what is not

Say these plainly if asked. Examiners respect a clear answer more than an overclaim.

| Part | Today | Planned |
|---|---|---|
| Sign up, sign in, Face ID matching | Backend + PostgreSQL | Stronger face model |
| Jobs, applications, candidate ranking | Backend + PostgreSQL | |
| Candidate skills and interview scores | Copied to PostgreSQL for the ranking | Full sessions served from the server |
| CV parsing, job description parsing | In the browser, fixed rules | Server, Gemini-assisted |
| Answer scoring | In the browser, rule-based | Server, Gemini |
| Speech to text | Browser Web Speech API | Whisper |
| Admin configuration changes | Saved in the browser | Saved through the API |

## Likely examiner questions

**Where is the AI? Are you using Gemini right now?**
Not yet. Answer scoring is rule-based at this stage: it checks expected keywords, length, structure and STAR elements against the admin's rubric. We built it this way first so the whole pipeline (question, answer, score, follow-up, history) works end to end and gives the same result every time. Gemini replaces the scoring function on the server next, behind the same interface, with the rule-based scorer kept as a fallback when the model's output fails validation. The AI that is running today is MediaPipe's face landmark model.

**How does the answer scoring work?**
Each question template has expected keywords. We score technical accuracy (how many expected keywords appear), relevance (terms from the question and the skill), completeness (length and whether there is a concrete example), clarity (sentence length), communication (vocabulary variety and filler words), and STAR structure for behavioral questions. The admin sets the weight of each criterion and the total is the weighted average. If completeness is below the follow-up threshold (55), the system asks the follow-up question and re-scores the combined answer.

**How does Face ID work? Is it secure?**
MediaPipe finds face landmarks in the browser. We compute 276 ratios between landmarks, so the template describes the shape of the face and not the image. On sign-in the server compares live and stored ratios: similarity = 1 − (mean absolute difference ÷ 0.12), and accepts at 0.55 or higher. The blink check stops photos. It is a prototype: it is not a trained face-recognition model, and we have not measured its false-accept rate. That is why the password is always available, Face ID locks after three failures, and a stronger embedding model is in the plan.

**Do you store the user's photo or video?**
No. Only the landmark ratios are stored, as numbers. Interview video is analysed live in the browser and is never recorded or uploaded.

**How is the suitability score calculated? Could it be biased?**
Suitability = CV skill match × 40% + interview evidence × 45% + practice consistency × 15%. The weights are admin settings. It uses only skills and scores: no name, gender, age, photo or university goes into the formula. The employer sees every factor, so a decision can be questioned. It is a decision aid; the employer makes the final decision.

**What does the employer see about a candidate?**
Only for candidates who ticked consent and have sharing switched on: name, email, skills, top degree, years of experience, project count and per-skill scores. Never the answer text, the video cues, the face template or the CV's contact details. Others are only counted as "hidden". This rule is enforced on the server and covered by tests.

**Why is part of the system in the browser? Isn't that a prototype?**
We built the complete user experience first, then moved modules to the server one at a time. The frontend has one service layer (`src/api.js`) that sends each module either to the backend or to local code, controlled by a setting. Authentication and the employer module have moved. CV, interview and admin are next, and the API contract for them is already written in `API.md`.

**The admin changed the threshold. Is that in the database?**
Not yet. The `scoring_rules` table exists and the employer ranking already reads it, but the admin screen saves to the browser for now. Admin write endpoints are in the next milestone.

**How are passwords and sessions protected?**
Passwords are hashed with argon2id. Sessions use a signed JWT that expires after 24 hours. Five wrong passwords lock sign-in for 60 seconds. The sign-in error never reveals which role an email is registered under. Secrets are in a `.env` file that is not committed.

**Why FastAPI and PostgreSQL?**
FastAPI validates every request with Pydantic and generates the Swagger documentation from the code. It is Python, which is where the Gemini and Whisper SDKs are. PostgreSQL gives us foreign keys and check constraints for the relational data, and JSONB for flexible data such as the parsed CV and per-criterion scores.

**How did you test it?**
46 automated API tests with pytest, run against a separate test database: sign up, both sign-in methods, lockout, job ownership, consent and privacy rules, and the ranking. The suitability score on the server is a port of the frontend's, and the tests check the numbers. The frontend is tested manually at this stage.

**How does the CV parser handle different CV formats?**
It reads PDF (pdf.js), DOCX and plain text, finds section headings, and matches skills using the alias list in the skill library. It does not read scanned PDFs, and unusual layouts can be missed, so the candidate can correct the extracted skills by hand. Gemini-assisted extraction is planned for that reason.

**What is left for the remaining 70%?**
Gemini answer evaluation, server-side CV parsing, Whisper transcription, sessions and admin configuration served from the database, account deletion on the server, a stronger face model, deployment, and user testing with students.

**What happens if the Gemini API is down or returns nonsense?**
The plan is to validate the model's JSON against a schema and fall back to the rule-based scorer when validation fails or the API is unavailable, so an interview never breaks.

## SQL for pgAdmin

Paste these into the Query Tool on the `intervo` database before the demo. Select one query and press **F5** to run only that one. All of them only read data.

```sql
-- 1. Accounts, newest first (the account created in the demo is at the top)
SELECT id, role, name, email, company,
       (face_enrolled_at IS NOT NULL) AS face_id_enrolled,
       last_login_method, last_login_at, created_at
FROM users
ORDER BY created_at DESC;

-- 2. Passwords are argon2 hashes; Face ID is numbers, not a photo
SELECT email,
       left(password_hash, 34) || '...' AS password_hash,
       face_enrolled_at,
       CASE WHEN jsonb_typeof(face_template) = 'object'
            THEN jsonb_array_length(face_template -> 'features') END AS face_numbers_stored
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- 3. Job postings with their weighted skills (the job posted in the demo is at the top)
SELECT j.id, j.title, j.company, j.status, j.min_score, j.min_match,
       string_agg(s.name || ' (x' || js.weight || ')', ', ' ORDER BY js.weight DESC, s.name) AS required_skills,
       j.created_at
FROM jobs j
LEFT JOIN job_skills js ON js.job_id = j.id
LEFT JOIN skills s ON s.id = js.skill_id
GROUP BY j.id
ORDER BY j.created_at DESC;

-- 4. Applications with consent and the employer's decision
SELECT a.id, u.name AS candidate, j.title AS job, j.company,
       a.consent, a.status, a.created_at AS applied_at
FROM applications a
JOIN users u ON u.id = a.candidate_id
JOIN jobs j ON j.id = a.job_id
ORDER BY a.created_at DESC;
```

Extra queries, if an examiner asks to see more:

```sql
-- 5. Candidate profiles: skills from the CV analysis and the sharing switch
SELECT u.name, p.skills, p.share_with_employers,
       p.cv -> 'education' -> 0 ->> 'degree' AS top_degree,
       p.cv ->> 'experienceYears' AS experience_years,
       jsonb_array_length(p.cv -> 'projects') AS projects,
       p.updated_at
FROM candidate_profiles p
JOIN users u ON u.id = p.user_id
ORDER BY p.updated_at DESC;

-- 6. Interview sessions (the video session from the demo is at the top)
SELECT u.name AS candidate, s.id AS session, s.mode, s.score, s.date,
       count(a.id) AS answers
FROM interview_sessions s
JOIN users u ON u.id = s.candidate_id
LEFT JOIN session_answers a ON a.session_id = s.id
GROUP BY u.name, s.id
ORDER BY s.date DESC;

-- 7. Answers of the latest session: per-criterion scores and video cues, no answer text
SELECT a.position + 1 AS q, sk.name AS skill, a.type, a.score,
       a.criteria, a.indicators, (a.answer = '') AS answer_text_not_stored
FROM session_answers a
LEFT JOIN skills sk ON sk.id = a.skill_id
WHERE a.session_id = (SELECT id FROM interview_sessions ORDER BY date DESC LIMIT 1)
ORDER BY a.position;

-- 8. Per-skill averages and persistent weaknesses, using the rules row
SELECT u.name AS candidate, sk.name AS skill,
       count(DISTINCT s.id) AS sessions, round(avg(a.score)) AS avg_score,
       (count(DISTINCT s.id) >= (r.data ->> 'weakMinSessions')::int
        AND avg(a.score) < (r.data ->> 'weakThreshold')::int) AS persistent_weakness
FROM session_answers a
JOIN interview_sessions s ON s.id = a.session_id
JOIN users u ON u.id = s.candidate_id
JOIN skills sk ON sk.id = a.skill_id
CROSS JOIN scoring_rules r
GROUP BY u.name, sk.name, r.data
ORDER BY u.name, avg_score;

-- 9. Scoring rules: thresholds and suitability weights (40 / 45 / 15)
SELECT jsonb_pretty(data) AS scoring_rules, updated_at FROM scoring_rules;

-- 10. Row counts
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'candidate_profiles', count(*) FROM candidate_profiles
UNION ALL SELECT 'jobs', count(*) FROM jobs
UNION ALL SELECT 'job_skills', count(*) FROM job_skills
UNION ALL SELECT 'applications', count(*) FROM applications
UNION ALL SELECT 'interview_sessions', count(*) FROM interview_sessions
UNION ALL SELECT 'session_answers', count(*) FROM session_answers
UNION ALL SELECT 'skills', count(*) FROM skills
UNION ALL SELECT 'job_roles', count(*) FROM job_roles
UNION ALL SELECT 'question_templates', count(*) FROM question_templates;
```

Note on query 9: this row holds the server's rules. The admin change in step 11 is saved in the browser at this stage, so this row still shows `weakThreshold: 60` afterwards.
