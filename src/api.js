/*
 * API service layer. Pages call api.* for every data operation; this file
 * decides, per module, where the work happens:
 *
 *   VITE_BACKEND_MODULES = ""              → everything runs in the browser against the
 *                                            localStorage store (lib.js / cvParser.js).
 *   VITE_BACKEND_MODULES = "auth,employer,candidate,admin" → the listed modules call the FastAPI
 *                                            backend at API_URL with a JWT bearer token; the rest stay local.
 *
 *   auth      two-factor sign in: signup / login (password) → face enrol or verify → full token; me, re-enrol face
 *   employer  config, jobs, apply/withdraw, application status, candidate ranking,
 *             plus the candidate sync (profile and finished sessions) that the ranking reads
 *   candidate CV analysis and editing, JD parsing and skill-gap match, the mock interview
 *             (questions, Gemini/rules evaluation, voice transcription, follow-ups, finish),
 *             progress and session history. Replaces the profile/session sync below.
 *   admin     the admin console: domains, roles, skills, question templates, criteria, scoring
 *             rules, user list and overview counts. Changes apply to everyone immediately.
 *
 * Backend responses are written back into the store, which then acts as a client-side
 * cache, so the pages render the same way whichever side did the work.
 *
 * Every function returns a Promise and throws ApiError with a user-facing message.
 * The endpoint contract is documented in API.md.
 */
import { cvFit, evaluateAnswer as evaluateLocal, hashPassword, isLandmarkTemplate, uid } from "./lib";
import { educationLevel, extractText, parseCV, parseJD as parseJDLocal } from "./cvParser";
import { readCVFile, removeCVFile, saveCVFile } from "./cvFiles";
import { isPlainObject, readJSON, readRaw } from "./storage";

const MODULES = new Set(
  (import.meta.env.VITE_BACKEND_MODULES || "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)
);
/** True when `module` ("auth" | "employer" | "candidate" | "admin") is served by the backend. */
export const uses = (module) => MODULES.has(module);
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");

if (uses("employer") && !uses("candidate")) {
  console.warn("VITE_BACKEND_MODULES: with the employer module on, applying needs a CV stored on the server, so the candidate module should be on too.");
}
if ((uses("employer") || uses("candidate") || uses("admin")) && !uses("auth")) {
  console.warn("VITE_BACKEND_MODULES: the employer, candidate and admin modules need the auth module too (their requests need a JWT).");
}

const TOKEN_KEY = "intervo.token";

export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = null, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable; // offline or timed out: the same request may well work on a second try
    this.retryAfter = retryAfter; // seconds, from a 429's Retry-After header
  }
}

/* ---------- Store binding ----------
 * StoreProvider calls connectStore({ db, update, user, logout, notify }) on every render so
 * local code reads the latest db and backend code can cache into it. */
let store = null;
export function connectStore(s) {
  store = s;
}
const getDb = () => {
  if (!store) throw new Error("api used before <StoreProvider> mounted");
  return store.db;
};
const write = (fn) => store.update(fn);

/* ---------- JWT token ---------- */
function getToken() {
  const t = readRaw(TOKEN_KEY) || readRaw(TOKEN_KEY, "session") || "";
  return typeof t === "string" ? t : "";
}
function setToken(token, remember) {
  try {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------- HTTP ---------- */
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, ""); // FastAPI validation error
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item could not be found.";
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  return "The server couldn't complete the request. Please try again.";
}

const OFFLINE = "Can't reach the server — is the backend running?";
const TIMEOUT = "The AI is taking longer than usual. Please try again.";
const AI_TIMEOUT = 30000; // ms: one Gemini evaluation, with its own retry on the server
const SLOW_TIMEOUT = 45000; // ms: CV analysis, question planning and audio (upload + Whisper + evaluation)
// A 401 on these is a wrong password / wrong face / expired pending token, not an expired session.
const PUBLIC_PATHS = ["/auth/login", "/auth/signup", "/auth/face/verify", "/auth/face/enroll"];

async function request(method, path, body, { timeout = 0, token = getToken() } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body; // browser sets the multipart boundary
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;
  let res;
  let data;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: controller.signal });
    data = res.status === 204 ? null : await res.json().catch(() => null);
  } catch (e) {
    throw e?.name === "AbortError" ? new ApiError(TIMEOUT, 0, null, true) : new ApiError(OFFLINE, 0, null, true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 401 && !PUBLIC_PATHS.includes(path)) {
      // Missing or expired token: sign out so the user can sign in again.
      const wasSignedIn = !!store?.user;
      store?.logout(); // also clears the token
      if (wasSignedIn) store?.notify("Your session has expired. Please sign in again.", "bad");
    }
    const retryAfter = res.status === 429 ? Number(res.headers.get("Retry-After")) || 60 : null;
    throw new ApiError(errorMessage(data, res.status), res.status, retryAfter);
  }
  return data;
}

/* ---------- Cache helpers (backend mode) ---------- */
function upsert(list, item, key = "id") {
  const i = list.findIndex((x) => x[key] === item[key]);
  if (i >= 0) list[i] = { ...list[i], ...item };
  else list.push(item);
}
/**
 * Copies a backend user into the local store under the same id, so the pages that still
 * read the store (the whole candidate side) work for an account that lives on the server.
 */
function cacheUser(user) {
  write((d) => {
    upsert(d.users, user);
    if (user.role === "candidate") d.profiles[user.id] ??= { skills: [], shareWithEmployers: false, consentAt: Date.now() };
  });
}

/* =========================================================
   Auth
   ========================================================= */

const NO_ACCOUNT = "No account found with this email.";
const noRoleAccount = (role) => `No ${role} account found with this email.`; // never reveals the account's real role

/** Local-mode account for an email + role tab, or throws the same 404s the backend sends. */
function findAccount(email, role) {
  const found = getDb().users.find((u) => u.email === email);
  if (!found) throw new ApiError(NO_ACCOUNT, 404);
  if (found.role !== role) throw new ApiError(noRoleAccount(role), 404);
  return found;
}

/* Two-factor sign in. Step 1 (startLogin / startSignup) proves the password and leaves a
 * "face pending" session here, in memory only. Step 2 (completeFace) enrols or verifies the face
 * and only then returns a user and stores the full token. Nothing is signed in before that. */
let pending = null; // { token (backend) | userId (local), faceEnrolled, expiresAt }
const PENDING_MS = 5 * 60 * 1000;
const PENDING_EXPIRED = "Your sign-in timed out. Enter your password again.";

/** Local-mode counterpart of the server's attempt limits: password 5 → 60 s, face 3 → 5 min. */
const LOCAL_GUARD_KEY = "intervo.localGuard";
function localGuard(userId) {
  const g = readJSON(LOCAL_GUARD_KEY, isPlainObject, {})[userId];
  return isPlainObject(g) ? { pw: 0, face: 0, until: 0, ...g } : { pw: 0, face: 0, until: 0 };
}
function setLocalGuard(userId, g) {
  try {
    const all = readJSON(LOCAL_GUARD_KEY, isPlainObject, {});
    all[userId] = g;
    localStorage.setItem(LOCAL_GUARD_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked */
  }
}
function localBlocked(g) {
  const left = Math.ceil((g.until - Date.now()) / 1000);
  if (left > 0) throw new ApiError(`Too many attempts. Try again in ${left} seconds.`, 429, left);
}

/** True when a face-step error means "go back to the password step" (expired, spent or blocked). */
export const needsPassword = (err) => err?.status === 429 || (err?.status === 401 && !/didn't match/i.test(err.message));

/**
 * Sign-in step 1: email + role + password. Resolves with { faceEnrolled }; the face step
 * (completeFace) must follow. Throws 401 (wrong password), 404 (no account) or 429 (blocked).
 */
export async function startLogin({ email, role, password }) {
  const normalised = email.trim().toLowerCase();
  if (uses("auth")) {
    const res = await request("POST", "/auth/login", { email: normalised, role, password });
    pending = { token: res.pendingToken, faceEnrolled: res.faceEnrolled, expiresAt: Date.now() + res.expiresIn * 1000 };
    return { faceEnrolled: res.faceEnrolled };
  }
  const found = findAccount(normalised, role);
  const g = localGuard(found.id);
  localBlocked(g);
  if ((await hashPassword(found.id, password)) !== found.passwordHash) {
    const pw = g.pw + 1;
    if (pw >= 5) {
      setLocalGuard(found.id, { ...g, pw: 0, until: Date.now() + 60_000 });
      throw new ApiError("Too many attempts. Try again in 60 seconds.", 429, 60);
    }
    setLocalGuard(found.id, { ...g, pw });
    throw new ApiError("Incorrect password.", 401);
  }
  setLocalGuard(found.id, { pw: 0, face: 0, until: 0 });
  const faceEnrolled = isLandmarkTemplate(found.face?.template);
  pending = { userId: found.id, faceEnrolled, expiresAt: Date.now() + PENDING_MS };
  return { faceEnrolled };
}

/**
 * Creates a candidate or employer account WITHOUT a face and opens the face step (enrolment).
 * The account can't be used until completeFace has enrolled a face.
 */
export async function startSignup({ role, name, email, company, password, dataConsent = false }) {
  const body = {
    role, name: name.trim(), email: email.trim().toLowerCase(),
    company: role === "employer" ? company.trim() : undefined,
    password, dataConsent,
  };
  if (uses("auth")) {
    const res = await request("POST", "/auth/signup", body);
    pending = { token: res.pendingToken, faceEnrolled: false, expiresAt: Date.now() + res.expiresIn * 1000 };
    return { faceEnrolled: false };
  }
  if (getDb().users.some((u) => u.email === body.email)) throw new ApiError("An account with this email already exists.", 409);
  const id = uid(role === "employer" ? "emp" : "cand");
  const user = {
    id, role, name: body.name, email: body.email, company: body.company,
    passwordHash: await hashPassword(id, password), createdAt: Date.now(), face: null, lastLogin: null,
  };
  write((d) => {
    d.users.push(user);
    if (role === "candidate") d.profiles[id] = { skills: [], shareWithEmployers: false, consentAt: Date.now() };
  });
  pending = { userId: id, faceEnrolled: false, expiresAt: Date.now() + PENDING_MS };
  return { faceEnrolled: false };
}

/**
 * Step 2 of sign in and sign up: `template` is the live landmark template from FaceCapture.
 * Enrols it when the account has no face, otherwise verifies it (the blink check has already
 * passed in FaceCapture, whose per-frame blink scores arrive as `liveness` and are re-checked by the server). Resolves with the signed-in user. Errors: 401 face mismatch (message
 * says how many attempts are left), or 401/429 when the user must start again with the
 * password (see needsPassword).
 */
export async function completeFace({ template, liveness, remember = true }) {
  if (!pending || pending.expiresAt < Date.now()) {
    pending = null;
    throw new ApiError(PENDING_EXPIRED, 401);
  }
  const enrol = !pending.faceEnrolled;
  if (uses("auth")) {
    const path = enrol ? "/auth/face/enroll" : "/auth/face/verify";
    const body = enrol ? { template } : { template, liveness };
    const { token, user } = await request("POST", path, body, { token: pending.token });
    pending = null;
    setToken(token, remember);
    cacheUser(user);
    return user;
  }

  const found = getDb().users.find((u) => u.id === pending.userId);
  const now = Date.now();
  let lastLogin;
  if (enrol) {
    lastLogin = { at: now, method: found.lastLogin ? "face" : "signup" };
    write((d) => {
      const u = d.users.find((x) => x.id === found.id);
      u.face = { template, enrolledAt: now };
      u.lastLogin = lastLogin;
    });
  } else {
    const g = localGuard(found.id);
    localBlocked(g);
    const { compareGeometry } = await import("./faceCues"); // already loaded by the face step
    const threshold = getDb().config.rules.faceThreshold;
    const sim = compareGeometry(template.features, found.face.template.features);
    if (sim < threshold) {
      const face = g.face + 1;
      if (face >= 3) {
        setLocalGuard(found.id, { pw: 0, face: 0, until: now + 5 * 60_000 });
        pending = null;
        throw new ApiError("Too many attempts. Try again in 300 seconds.", 429, 300);
      }
      setLocalGuard(found.id, { ...g, face });
      const left = 3 - face;
      throw new ApiError(`Face didn't match this account. ${left} ${left === 1 ? "attempt" : "attempts"} left.`, 401);
    }
    setLocalGuard(found.id, { pw: 0, face: 0, until: 0 });
    lastLogin = { at: now, method: "face" };
    write((d) => { d.users.find((x) => x.id === found.id).lastLogin = lastLogin; });
  }
  pending = null;
  return { ...found, lastLogin, face: enrol ? { template, enrolledAt: now } : found.face };
}

/**
 * Checks a remembered sign-in against the backend on page load and refreshes the cached
 * user. A missing or expired token signs the user out; an offline server leaves them be.
 */
export async function restoreSession() {
  if (!uses("auth")) return null;
  if (!getToken()) {
    store.logout();
    return null;
  }
  const user = await request("GET", "/auth/me");
  cacheUser(user);
  return user;
}

/** Re-enrols: replaces the signed-in user's face template. A face can be replaced, never deleted. */
export async function enrolFace(userId, template) {
  if (uses("auth")) return cacheUser(await request("PUT", "/auth/face", { template }));
  write((d) => { d.users.find((u) => u.id === userId).face = { template, enrolledAt: Date.now() }; });
}

/* =========================================================
   CV & job description
   ========================================================= */

/**
 * Reads and parses a CV. Pass `{ file }` (PDF/DOCX/TXT) or `{ text }` (pasted).
 * `onStep` receives "read" | "extract" | "parse" for the progress UI.
 * Resolves with the full CV record the CV page stores on the profile.
 */
export async function analyzeCV({ file, text }, onStep = () => {}) {
  const meta = file
    ? { fileName: file.name, fileType: file.name.split(".").pop().toUpperCase(), fileSize: file.size }
    : { fileName: "", fileType: "TEXT" };

  if (uses("candidate")) {
    // One upload does the reading, extraction and parsing server-side; the three steps pace the progress UI.
    const form = new FormData();
    form.append("file", file || new File([text], "pasted-cv.txt", { type: "text/plain" }));
    const timers = [setTimeout(() => onStep("extract"), 700), setTimeout(() => onStep("parse"), 1800)];
    onStep("read");
    try {
      return serverCV(await request("POST", "/cv", form, { timeout: SLOW_TIMEOUT }), meta);
    } finally {
      timers.forEach(clearTimeout);
    }
  }

  const source = file ? await extractText(file, onStep) : text;
  onStep("parse");
  const parsed = parseCV(source, getDb().config.skills);
  // Local mode keeps the original file too (in IndexedDB); the previous one goes unless an application holds it.
  const previous = getDb().profiles[store?.user?.id]?.cv?.cvFile?.id;
  const cvFile = await saveCVFile(file || new Blob([text], { type: "text/plain" }), file?.name || "pasted-cv.txt");
  if (previous && previous !== cvFile.id) await dropFileIfUnused(previous, getDb().applications, getDb().profiles, store?.user?.id);
  return { ...parsed, ...meta, cvFile, parsedAt: Date.now(), text: source.slice(0, 20000) };
}

/** Deletes a local CV file when no application snapshot holds it and it isn't another user's current CV. */
async function dropFileIfUnused(fileId, applications, profiles, replacingUserId = null) {
  if (!fileId) return;
  const held = applications.some((a) => a.cvSnapshot?.cvFile?.id === fileId);
  const current = Object.entries(profiles).some(([userId, p]) => userId !== replacingUserId && p?.cv?.cvFile?.id === fileId);
  if (!held && !current) await removeCVFile(fileId);
}

/** A backend CVResponse as the CV page's record. `provider` is "gemini" or "rules". */
function serverCV(res, meta) {
  return { ...res.cv, ...meta, cvFile: res.file || null, provider: res.provider, parsedAt: Date.now(), text: (res.text || "").slice(0, 20000) };
}

/**
 * Loads the candidate's saved CV from the backend into the profile cache (no-op without a
 * saved CV, or in local mode). Resolves with the cached CV or null.
 */
export async function loadSavedCV() {
  if (!uses("candidate") || !store?.user) return null;
  let res;
  try {
    res = await request("GET", "/cv");
  } catch (e) {
    if (e.status === 404) return null; // nothing uploaded yet
    throw e;
  }
  const id = store.user.id;
  const before = getDb().profiles[id]?.cv;
  const fileName = res.fileName || "";
  const cv = serverCV(res, { fileName, fileType: fileName ? fileName.split(".").pop().toUpperCase() : "TEXT" });
  if (before?.fileName === fileName && before.parsedAt) cv.parsedAt = before.parsedAt;
  write((d) => { d.profiles[id] = { ...d.profiles[id], cv, skills: cv.skills, fileName }; });
  return cv;
}

const CV_FIELDS = ["contact", "summary", "skills", "otherSkills", "education", "experience", "projects", "certifications", "experienceYears", "sectionsFound", "warnings"];
let cvSaves = Promise.resolve();

/** Saves the user's edits to their CV (PUT /cv). Saves run one after another so the last edit wins. */
export function saveCVEdits(cv) {
  if (!uses("candidate")) return Promise.resolve();
  const body = Object.fromEntries(CV_FIELDS.filter((k) => cv[k] !== undefined).map((k) => [k, cv[k]]));
  const run = () => request("PUT", "/cv", body, { timeout: AI_TIMEOUT });
  const saved = cvSaves.then(run, run);
  cvSaves = saved.catch(() => {});
  return saved;
}

/** Extracts title, weighted skills, years and education from a job description. */
export async function parseJD(text, roleSkills = []) {
  if (uses("candidate")) {
    const skills = roleSkills.map(({ name, weight }) => ({ name, weight }));
    return request("POST", "/jd/parse", { text, roleSkills: skills }, { timeout: AI_TIMEOUT }); // includes `provider`
  }
  return parseJDSync(text, roleSkills);
}

/** Local parseJD without the Promise, so live previews render in the same frame. Null when the backend parses. */
export function parseJDSync(text, roleSkills = []) {
  return uses("candidate") ? null : parseJDLocal(text, getDb().config.skills, roleSkills);
}

/**
 * Skill gap of the saved CV against a role (`roleId`) or a parsed job description (`jd`).
 * Resolves with { matched, partial, missing, percentage, checks } in the shape the CV page renders.
 */
export async function matchSkillGap({ roleId, jd }) {
  const body = jd
    ? { jd: { title: jd.title || "", skills: jd.skills.map(({ name, weight }) => ({ name, weight })), minYears: jd.minYears || 0, education: jd.education || "", fresherFriendly: !!jd.fresherFriendly } }
    : { roleId };
  const res = await request("POST", "/cv/match", body, { timeout: AI_TIMEOUT });
  const checks = res.checks.map((c) => ({
    label: `${c.label}: ${c.required}`,
    ok: c.met,
    detail: c.key === "education"
      ? (c.actual === "Not found" ? "No degree found in your CV" : `Your highest: ${c.actual}`)
      : `Your CV shows about ${c.actual}`,
  }));
  return { ...res, checks };
}

/* =========================================================
   Interview
   ========================================================= */

/** Scores one answer against the admin-configured rubric (local mode; the backend scores inside submitAnswer). */
export async function evaluateAnswer(answer, question) {
  return evaluateLocal(answer, question, getDb().config);
}

/** A candidate's completed sessions, newest first. In backend mode this also refreshes the cache. */
export async function getSessions(userId) {
  if (uses("candidate")) {
    const list = await request("GET", "/interviews");
    const sessions = list
      .filter((s) => s.status === "completed")
      .map((s) => ({
        id: s.id, userId, roleId: s.roleId, roleTitle: s.roleTitle, mode: s.mode, date: s.date, score: s.score,
        answerCount: s.answeredCount, answers: [], // answers are fetched with getSession when a row is opened
      }));
    write((d) => { d.sessions = [...d.sessions.filter((s) => s.userId !== userId), ...sessions]; });
    return sessions.sort((a, b) => b.date - a.date);
  }
  return getDb().sessions.filter((s) => s.userId === userId).sort((a, b) => b.date - a.date);
}

/** One completed session with its answers (backend mode). */
export async function getSession(id) {
  return sessionFromServer(await request("GET", `/interviews/${encodeURIComponent(id)}`, undefined, { timeout: AI_TIMEOUT }));
}

/** Skill history, weaknesses and score trend from the backend, or null in local mode. */
export async function getProgress() {
  return uses("candidate") ? request("GET", "/progress") : null;
}

/** Saves a finished session (without id). Local mode only: backend sessions are saved by finishInterview. */
export async function saveSession(session) {
  const saved = { ...session, id: session.id || uid("s") };
  write((d) => upsert(d.sessions, saved));
  return saved;
}

/* ---------- Interview, backend mode ---------- */

const cleanIndicators = (ind) => {
  const kept = Object.entries(ind || {}).filter(([, v]) => typeof v === "number" && v >= 0 && v <= 100);
  return kept.length ? Object.fromEntries(kept) : undefined; // unavailable cues (null) are left out
};

/** Opens a session. The server picks the questions (and why) from weaknesses, CV gaps and the role. */
export async function startInterview({ roleId, mode, count }) {
  const res = await request("POST", "/interviews", { roleId, mode, count }, { timeout: SLOW_TIMEOUT });
  return {
    id: res.id,
    questions: res.questions.map((q) => ({ id: q.id, text: q.question, skill: q.skill, type: q.type, reason: q.reason, origin: q.questionOrigin, keywords: [], followUp: null })),
  };
}

/** The server's evaluation as the interview page's result record. */
function answerResult(res, extra = {}) {
  return {
    answerId: res.answerId, score: res.score, criteria: res.criteria || {}, tips: res.tips || [], provider: res.provider,
    needsFollowUp: !!res.needsFollowUp, followUpQuestion: res.followUp?.question || null, source: res.answerSource, ...extra,
  };
}

/** A question the server already evaluated (e.g. the first request timed out here but finished there). */
async function recoverAnswer(interviewId, questionId, { followUp = false } = {}) {
  const detail = await request("GET", `/interviews/${encodeURIComponent(interviewId)}`, undefined, { timeout: AI_TIMEOUT });
  const q = detail.questions.find((x) => x.id === questionId);
  if (!q?.answered || (followUp && !q.followUp)) return null;
  return answerResult(
    { answerId: q.id, score: q.score, criteria: q.criteria, tips: q.tips, provider: q.provider, needsFollowUp: q.needsFollowUp, followUp: q.followUpQuestion ? { question: q.followUpQuestion } : null, answerSource: q.answerSource },
    { answer: q.answer, transcript: q.answerSource === "text" ? undefined : q.answer, ...(followUp ? { followUp: q.followUp } : {}) }
  );
}

/**
 * Sends one answer. With `audio` ({ blob, ext }) it goes as multipart so the server transcribes it with
 * Whisper (result.transcript is what was heard); if speech-to-text is unavailable (503) the browser
 * transcript in `answer` is sent as text instead. Resolves with the evaluation.
 */
export async function submitAnswer({ interviewId, questionId, answer, indicators, mode, audio }) {
  const path = `/interviews/${encodeURIComponent(interviewId)}/answers`;
  const clean = cleanIndicators(indicators);
  try {
    if (audio) {
      try {
        const form = new FormData();
        form.append("questionId", questionId);
        form.append("audio", audio.blob, `answer.${audio.ext}`);
        if (clean) form.append("indicators", JSON.stringify(clean));
        const res = await request("POST", path, form, { timeout: SLOW_TIMEOUT });
        return answerResult(res, { answer: res.transcript, transcript: res.transcript, indicators: clean });
      } catch (e) {
        if (e.status !== 503) throw e;
        if (!answer.trim()) throw new ApiError("Speech-to-text isn't available right now. Type your answer instead.", 503);
      }
    }
    const res = await request("POST", path, { questionId, answer, indicators: clean, source: mode }, { timeout: AI_TIMEOUT });
    return answerResult(res, { answer, indicators: clean });
  } catch (e) {
    if (e.status === 409) {
      const done = await recoverAnswer(interviewId, questionId).catch(() => null);
      if (done) return { ...done, indicators: clean };
    }
    throw e;
  }
}

/** Sends the follow-up answer; the server re-evaluates the original answer together with it. */
export async function submitFollowUp({ interviewId, questionId, answerId, answer, indicators, audio }) {
  const base = `/interviews/${encodeURIComponent(interviewId)}`;
  const clean = cleanIndicators(indicators);
  try {
    let text = answer;
    if (audio) {
      const form = new FormData();
      form.append("audio", audio.blob, `answer.${audio.ext}`);
      try {
        text = (await request("POST", `${base}/transcribe`, form, { timeout: SLOW_TIMEOUT })).transcript;
      } catch (e) {
        if (e.status !== 503) throw e;
        if (!answer.trim()) throw new ApiError("Speech-to-text isn't available right now. Type your answer instead.", 503);
      }
    }
    const res = await request("POST", `${base}/answers/${encodeURIComponent(answerId)}/follow-up`, { answer: text, indicators: clean }, { timeout: AI_TIMEOUT });
    return answerResult(res, { followAnswer: text, indicators: clean });
  } catch (e) {
    if (e.status === 409) {
      const done = await recoverAnswer(interviewId, questionId, { followUp: true }).catch(() => null);
      if (done) return { ...done, followAnswer: done.followUp?.answer, indicators: clean };
    }
    throw e;
  }
}

/** Closes the session and resolves with it in the shape the summary screen renders. */
export async function finishInterview(interviewId) {
  return sessionFromServer(await request("POST", `/interviews/${encodeURIComponent(interviewId)}/finish`, undefined, { timeout: AI_TIMEOUT }));
}

function sessionFromServer(s) {
  const answers = s.questions.filter((q) => q.answered);
  return {
    id: s.id, userId: store?.user?.id, roleId: s.roleId, roleTitle: s.roleTitle, mode: s.mode, date: s.date, score: s.score,
    answerCount: answers.length,
    answers: answers.map((q) => ({
      questionId: q.templateId, question: q.question, skill: q.skill, type: q.type, score: q.score, criteria: q.criteria || {},
      answer: q.answer, followUp: q.followUp || null, indicators: q.indicators || null, reason: q.reason, provider: q.provider, questionOrigin: q.questionOrigin,
    })),
  };
}

/* =========================================================
   Candidate sync (employer module)
   =========================================================
 * The candidate pages keep CV skills and session scores in the local store. With the
 * employer module on, the backend ranks applicants, so it needs a copy of exactly what
 * the employer's CV match reads: skills, three CV facts and the sharing switch. Interview
 * sessions, CV text, contact details and answer text never leave the browser. */

// The backend's candidate module saves CV and sessions itself, so this copy is only for the employer-only setup.
const syncsCandidate = () => uses("employer") && !uses("candidate") && store?.user?.role === "candidate";
const syncFailed = (e) => console.warn("Couldn't sync with the server:", e.message);
const clip = (value) => String(value ?? "").slice(0, 200);

function profileBody(profile = {}) {
  const cv = profile.cv;
  return {
    skills: (profile.skills || []).filter((s) => typeof s === "string"),
    cv: cv
      ? {
          education: (cv.education || []).slice(0, 20).map((e) => ({ degree: clip(e.degree), institution: clip(e.institution) })),
          experienceYears: Math.min(80, Math.max(0, Number(cv.experienceYears) || 0)),
          projects: (cv.projects || []).slice(0, 50).map((p) => ({ name: clip(p.name) })),
        }
      : null,
    shareWithEmployers: profile.shareWithEmployers !== false, // same rule as the Profile page switch
  };
}

let profileTimer = null;

/**
 * Saves the candidate's skills, CV summary and sharing switch to the backend. Pass the
 * profile as it will be after the change (the store updates on the next render). Does
 * nothing unless the employer module is on and a candidate is signed in.
 */
export async function syncProfile(profile) {
  clearTimeout(profileTimer);
  if (!uses("employer") || store?.user?.role !== "candidate") return; // also the sharing switch with the candidate module on
  await request("PUT", "/profile", profileBody(profile));
}

/** Background syncProfile for rapid edits (the CV editor): waits for a pause, never throws. */
export function syncProfileSoon(profile) {
  clearTimeout(profileTimer);
  if (!syncsCandidate()) return;
  profileTimer = setTimeout(() => syncProfile(profile).catch(syncFailed), 600);
}

/**
 * Sends the candidate's local profile (skills, CV summary, sharing switch), so data from before
 * the sync existed reaches the server. Never throws: a failure here must not block the action
 * that triggered it.
 */
async function syncCandidateData(candidateId) {
  if (!syncsCandidate()) return;
  await syncProfile(getDb().profiles[candidateId]).catch(syncFailed);
}

/* =========================================================
   Jobs & applications
   ========================================================= */

/**
 * Admin configuration (roles, skills, scoring rules) as the employer pages need it.
 * With the employer module on it comes from the backend and is cached as `db.serverConfig`,
 * leaving the local `db.config` that the candidate and admin pages use untouched.
 */
export async function getConfig() {
  if (!uses("employer")) return getDb().config;
  const config = await request("GET", "/config");
  write((d) => { d.serverConfig = config; });
  return config;
}

/** The config the employer pages render with: the backend's once loaded, else the local one. */
export function employerConfig(db = getDb()) {
  return (uses("employer") && db.serverConfig) || db.config;
}

/**
 * All job postings the caller may see. With the employer module on, this replaces the cached
 * jobs, and the cached applications the caller owns (a candidate's own, or those on an
 * employer's jobs), with the backend's.
 */
export async function getJobs() {
  if (!uses("employer")) return getDb().jobs;
  const me = store.user;
  const { jobs, applications } = await request("GET", "/jobs");
  write((d) => {
    d.jobs = jobs;
    const mine = new Set(jobs.filter((j) => j.employerId === me?.id).map((j) => j.id));
    const stale = (a) => (me?.role === "employer" ? mine.has(a.jobId) : a.candidateId === me?.id);
    const ids = new Set(applications.map((a) => a.id));
    d.applications = [...d.applications.filter((a) => !stale(a) && !ids.has(a.id)), ...applications];
  });
  return jobs;
}

/** Creates (no id) or updates (with id) a job posting for `employer`. Resolves with the stored job. */
export async function saveJob(job, employer) {
  let saved;
  if (uses("employer")) saved = job.id ? await request("PUT", `/jobs/${encodeURIComponent(job.id)}`, job) : await request("POST", "/jobs", job);
  else saved = job.id ? job : { ...job, id: uid("job"), employerId: employer.id, company: employer.company, createdAt: Date.now() };
  write((d) => upsert(d.jobs, saved));
  return saved;
}

/** Closes or reopens a job posting: "open" | "closed". Resolves with the stored job. */
export async function setJobStatus(job, status) {
  const saved = uses("employer")
    ? await request("PATCH", `/jobs/${encodeURIComponent(job.id)}/status`, { status })
    : { ...job, status };
  write((d) => upsert(d.jobs, saved));
  return saved;
}

/** Applies the candidate to a job. `consent` shares their results with the employer. */
export async function applyToJob({ jobId, candidateId, consent }) {
  const profile = getDb().profiles[candidateId];
  if (!profile?.cv) throw new ApiError("Upload your CV before applying", 400); // the server enforces it too
  await syncCandidateData(candidateId); // the employer's ranking reads the server copy
  // The employer receives the CV as it is now. Local mode keeps that copy on the application, like the server does.
  const cvSnapshot = JSON.parse(JSON.stringify({ cv: { ...profile.cv, text: undefined }, skills: profile.skills || profile.cv.skills || [], cvFile: profile.cv.cvFile || null }));
  const application = uses("employer")
    ? await request("POST", `/jobs/${encodeURIComponent(jobId)}/apply`, { consent })
    : { id: uid("app"), jobId, candidateId, date: Date.now(), consent, status: "applied", history: [{ status: "applied", at: Date.now() }], cvSnapshot };
  write((d) => {
    upsert(d.applications, application);
    if (consent) d.profiles[candidateId] = { ...d.profiles[candidateId], shareWithEmployers: true };
  });
  return application;
}

/** Withdraws the candidate's application to a job. */
export async function withdrawApplication({ jobId, candidateId }) {
  if (uses("employer")) await request("DELETE", `/jobs/${encodeURIComponent(jobId)}/apply`); // the server deletes the stored file
  const db = getDb();
  const gone = db.applications.find((a) => a.jobId === jobId && a.candidateId === candidateId);
  const rest = db.applications.filter((a) => a !== gone);
  write((d) => { d.applications = d.applications.filter((a) => !(a.jobId === jobId && a.candidateId === candidateId)); });
  if (!uses("employer")) await dropFileIfUnused(gone?.cvSnapshot?.cvFile?.id, rest, db.profiles);
}

/* ---------- Shortlist flow ----------
 * applied → shortlisted → accepted | declined_by_candidate; the employer can also set
 * not_progressing. Contact details are shared only after the candidate accepts.
 * Local mode keeps the same rules in the store (db.applications[].history, db.notifications). */

/** Statuses from before the shortlist flow: "new" → applied, "declined" → not_progressing. */
export const appStatus = (a) => (!a?.status || a.status === "new" ? "applied" : a.status === "declined" ? "not_progressing" : a.status);

const MAX_NOTE = 500;
const trimNote = (text) => String(text ?? "").trim().slice(0, MAX_NOTE) || null;

function pushNotification(d, userId, type, title, body, link) {
  (d.notifications ??= []).push({ id: uid("ntf"), userId, type, title, body, link, createdAt: Date.now(), readAt: null });
}

function addHistory(app, status, extra = {}) {
  app.status = status;
  app.updatedAt = Date.now();
  (app.history ??= [{ status: "applied", at: app.date }]).push({ status, at: app.updatedAt, ...extra });
}

/**
 * Employer shortlists an application (optional `message`, up to 500 characters) or sets it to
 * "not_progressing". The candidate is notified. Resolves with the updated application.
 */
export async function setApplicationStatus(applicationId, status, message = "") {
  if (uses("employer")) {
    const saved = await request("PATCH", `/applications/${encodeURIComponent(applicationId)}/status`, { status, message: trimNote(message) });
    write((d) => upsert(d.applications, saved));
    return saved;
  }
  const db = getDb();
  const app = db.applications.find((a) => a.id === applicationId);
  if (!app) throw new ApiError("This application could not be found.", 404);
  const from = appStatus(app);
  if (from === "accepted" || from === "declined_by_candidate") throw new ApiError("The candidate has already responded to this application.", 409);
  if (from === status) throw new ApiError(`This application is already ${status.replace("_", " ")}.`, 409);
  const note = trimNote(message);
  const job = db.jobs.find((j) => j.id === app.jobId);
  write((d) => {
    const a = d.applications.find((x) => x.id === applicationId);
    addHistory(a, status, { employerMessage: note });
    a.employerMessage = note;
    const said = note ? ` They said: "${note}"` : "";
    if (status === "shortlisted") pushNotification(d, a.candidateId, "shortlisted", `You've been shortlisted for ${job?.title}`, `${job?.company} would like to move forward with your application.${said} Accept or decline in My Applications.`, "/applications");
    else pushNotification(d, a.candidateId, "not_progressing", `Update on your application for ${job?.title}`, `${job?.company} won't be moving forward with your application.${said}`, "/applications");
  });
  return { ...app, status, employerMessage: note };
}

/** One of the signed-in candidate's applications in the shape of GET /applications/mine. */
function myApplicationShape(db, app) {
  const job = db.jobs.find((j) => j.id === app.jobId) || {};
  const status = appStatus(app);
  const history = app.history || [{ status: "applied", at: app.date }];
  const boss = status === "accepted" ? db.users.find((u) => u.id === job.employerId) : null;
  return {
    id: app.id, jobId: app.jobId, jobTitle: job.title || "Removed job", company: job.company || "", status,
    employerMessage: [...history].reverse().find((h) => h.employerMessage)?.employerMessage ?? null,
    candidateNote: [...history].reverse().find((h) => h.candidateNote)?.candidateNote ?? null,
    appliedAt: app.date, updatedAt: history[history.length - 1].at, history,
    employer: boss ? { name: boss.name, company: boss.company || job.company, email: boss.email } : null,
  };
}

/** Local-mode "My Applications", without the Promise so the page renders in the same frame. Null when the backend serves it. */
export function getMyApplicationsSync(db = getDb()) {
  if (uses("employer")) return null;
  const me = store?.user;
  return db.applications.filter((a) => a.candidateId === me?.id).sort((a, b) => b.date - a.date).map((a) => myApplicationShape(db, a));
}

/** The candidate's own applications, newest first (employer contact only after they accepted). */
export async function getMyApplications() {
  if (!uses("employer")) return getMyApplicationsSync();
  const list = await request("GET", "/applications/mine");
  write((d) => list.forEach((m) => {
    const a = d.applications.find((x) => x.id === m.id);
    if (a) Object.assign(a, { status: m.status, employerMessage: m.employerMessage, candidateNote: m.candidateNote, updatedAt: m.updatedAt });
  }));
  return list;
}

/**
 * Candidate answers a shortlist: decision "accept" | "decline", optional note (500 characters).
 * Only allowed while the status is shortlisted. Resolves with the application as in getMyApplications.
 */
export async function respondToApplication(applicationId, decision, note = "") {
  if (uses("employer")) {
    const saved = await request("POST", `/applications/${encodeURIComponent(applicationId)}/respond`, { decision, note: trimNote(note) });
    write((d) => {
      const a = d.applications.find((x) => x.id === applicationId);
      if (a) Object.assign(a, { status: saved.status, employerMessage: saved.employerMessage, candidateNote: saved.candidateNote, updatedAt: saved.updatedAt });
    });
    return saved;
  }
  const db = getDb();
  const app = db.applications.find((a) => a.id === applicationId);
  if (!app) throw new ApiError("This application could not be found.", 404);
  if (app.candidateId !== store.user?.id) throw new ApiError("You can only respond to your own applications.", 403);
  const from = appStatus(app);
  if (from === "accepted" || from === "declined_by_candidate") throw new ApiError("You've already responded to this application.", 409);
  if (from !== "shortlisted") throw new ApiError("You can only respond once you've been shortlisted.", 409);
  const text = trimNote(note);
  const accepted = decision === "accept";
  const job = db.jobs.find((j) => j.id === app.jobId);
  const me = store.user;
  write((d) => {
    const a = d.applications.find((x) => x.id === applicationId);
    addHistory(a, accepted ? "accepted" : "declined_by_candidate", { candidateNote: text });
    a.candidateNote = text;
    if (job?.employerId) {
      const said = text ? ` They said: "${text}"` : "";
      const link = `/candidates?job=${job.id}`;
      if (accepted) pushNotification(d, job.employerId, "accepted", `${me.name} accepted your shortlist for ${job.title}`, `Their contact details are now on the Candidates page.${said}`, link);
      else pushNotification(d, job.employerId, "declined", `A candidate declined your shortlist for ${job.title}`, `No contact details were shared.${said}`, link);
    }
  });
  return myApplicationShape(getDb(), { ...app, status: accepted ? "accepted" : "declined_by_candidate", history: [...(app.history || [{ status: "applied", at: app.date }]), { status: accepted ? "accepted" : "declined_by_candidate", at: Date.now(), candidateNote: text }] });
}

/* ---------- Notifications ---------- */

const localNotifications = (db) => (db.notifications || []).filter((n) => n.userId === store?.user?.id).sort((a, b) => b.createdAt - a.createdAt);
const notificationShape = (n) => ({ ...n, read: n.readAt != null });

/** Local-mode notifications without the Promise (the bell reads these straight from the store). Null when the backend serves them. */
export function getNotificationsSync(db = getDb()) {
  return uses("employer") ? null : localNotifications(db).map(notificationShape);
}

/** The signed-in user's notifications, newest first. */
export async function getNotifications() {
  return uses("employer") ? request("GET", "/notifications") : getNotificationsSync();
}

/** Number of unread notifications. Cheap enough to poll. */
export async function getUnreadCount() {
  if (uses("employer")) return (await request("GET", "/notifications/unread-count")).count;
  return localNotifications(getDb()).filter((n) => n.readAt == null).length;
}

export async function markNotificationRead(id) {
  if (uses("employer")) await request("POST", `/notifications/${encodeURIComponent(id)}/read`);
  else write((d) => { const n = (d.notifications || []).find((x) => x.id === id); if (n && n.readAt == null) n.readAt = Date.now(); });
}

export async function markAllNotificationsRead() {
  if (uses("employer")) await request("POST", "/notifications/read-all");
  else write((d) => (d.notifications || []).forEach((n) => { if (n.userId === store.user?.id && n.readAt == null) n.readAt = Date.now(); }));
}

/**
 * Applicants for one job, best CV match first. Employers get only the CV skill match, the
 * requirement checks and a short CV summary, never interview scores or practice data. Only
 * candidates who consented are returned; the rest are counted in `hidden`.
 * Resolves with { job, visible: [{ app, cand, cvSummary, match }], hidden }.
 */
export async function getCandidates(jobId) {
  if (uses("employer")) {
    const { job, candidates, hidden } = await request("GET", `/jobs/${encodeURIComponent(jobId)}/candidates`);
    const visible = candidates.map((c) => ({ app: c.application, cand: c.candidate, cvSummary: c.cvSummary, match: c.match, contact: c.contact || null }));
    return { job, visible, hidden }; // the backend already ranks them
  }
  return getCandidatesSync(jobId);
}

/** Experience / education checks for a job whose description states them (local mode; the backend does the same). */
function requirementChecks(job, profile) {
  const jd = parseJDLocal(job.description || "", [], []);
  const checks = [];
  const years = profile?.cv?.experienceYears || 0;
  if (jd.minYears > 0) {
    checks.push({ key: "experience", label: "Experience", required: `${jd.minYears}+ years`, actual: `${years} years`, met: years >= jd.minYears || jd.fresherFriendly });
  }
  if (jd.education) {
    const degrees = (profile?.cv?.education || []).map((e) => e.degree).filter(Boolean);
    const have = Math.max(0, ...degrees.map(educationLevel));
    const need = educationLevel(jd.education);
    checks.push({ key: "education", label: "Education", required: jd.education, actual: degrees.find((d) => educationLevel(d) === have) || "Not found", met: need === 0 || have >= need });
  }
  return checks;
}

/** Local getCandidates without the Promise, so lists render in the same frame. Null when the backend ranks. */
export function getCandidatesSync(jobId, db = getDb()) {
  if (uses("employer")) return null;
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return { job: null, visible: [], hidden: 0 };
  const visible = [];
  let hidden = 0;
  db.applications.filter((a) => a.jobId === jobId).forEach((app) => {
    // Same rule the backend applies: details only for consented, opted-in candidates.
    const cand = db.users.find((u) => u.id === app.candidateId);
    const profile = db.profiles[app.candidateId];
    if (!cand) return;
    if (!app.consent || profile?.shareWithEmployers === false) return hidden++;
    // The CV this employer received when the candidate applied; later uploads and edits don't change it.
    const snap = app.cvSnapshot;
    const cv = snap ? snap.cv : profile?.cv;
    const scored = snap ? { ...profile, cv: snap.cv, skills: snap.skills } : profile;
    const cvSummary = cv ? { topDegree: cv.education?.[0]?.degree || null, experienceYears: cv.experienceYears || 0, projectCount: cv.projects?.length || 0 } : null;
    const match = cvFit({ job, profile: scored, config: db.config, checks: requirementChecks(job, scored) });
    // Contact details only once the candidate has accepted the shortlist.
    const contact = appStatus(app) === "accepted" ? { name: cand.name, email: cand.email, phone: cv?.contact?.phone || null } : null;
    visible.push({ app: { ...app, status: appStatus(app) }, cand: { id: cand.id, name: cand.name }, cvSummary, match, contact });
  });
  visible.sort((a, b) => b.match.percentage - a.match.percentage); // stable: ties keep application order
  // Same as the backend: the name stays hidden until the candidate accepts ("Candidate #n" in ranking order).
  visible.forEach((v, i) => { if (!v.contact) v.cand = { ...v.cand, name: `Candidate #${i + 1}` }; });
  return { job, visible, hidden };
}

/* ---------- The CV an employer receives ----------
 * Before the candidate accepts: the parsed CV without contact details. After: the original file
 * and the contact card. Same rules in local mode, read from the application's snapshot. */

/** Opens a PDF in a new tab, saves anything else, from a Blob. */
function deliverFile(blob, name, contentType) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  if ((contentType || blob.type) === "application/pdf") a.target = "_blank";
  else a.download = name || "cv";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * The parsed CV an employer may read for one application, never with contact details:
 * { applicationId, status, cv, file, contact }. `file` and `contact` are set only after the candidate accepted.
 */
export async function getApplicationCV(applicationId) {
  if (uses("employer")) return request("GET", `/applications/${encodeURIComponent(applicationId)}/cv`);
  const db = getDb();
  const app = db.applications.find((a) => a.id === applicationId);
  const job = app && db.jobs.find((j) => j.id === app.jobId);
  if (!app || !job) throw new ApiError("This application could not be found.", 404);
  if (job.employerId !== store.user?.id) throw new ApiError("Only the employer who posted this job can do that.", 403);
  if (!app.consent || db.profiles[app.candidateId]?.shareWithEmployers === false) throw new ApiError("This candidate hasn't agreed to share their CV.", 403);
  const cv = app.cvSnapshot?.cv || db.profiles[app.candidateId]?.cv;
  if (!cv) throw new ApiError("This application has no CV.", 404);
  const accepted = appStatus(app) === "accepted";
  const cand = db.users.find((u) => u.id === app.candidateId);
  return {
    applicationId, status: appStatus(app),
    cv: {
      summary: cv.summary || "", skills: cv.skills || [], otherSkills: cv.otherSkills || [], education: cv.education || [],
      experience: cv.experience || [], projects: cv.projects || [], certifications: cv.certifications || [], experienceYears: cv.experienceYears || 0,
    },
    file: accepted ? app.cvSnapshot?.cvFile || null : null,
    contact: accepted && cand ? { name: cand.name, email: cand.email, phone: cv.contact?.phone || null } : null,
  };
}

/** Downloads the original CV (PDFs open in a new tab). Only works once the candidate accepted the shortlist. */
export async function downloadApplicationCV(applicationId, fileName = "") {
  if (uses("employer")) {
    let res;
    try {
      res = await fetch(`${API_URL}/applications/${encodeURIComponent(applicationId)}/cv-file`, { headers: { Authorization: `Bearer ${getToken()}` } });
    } catch {
      throw new ApiError(OFFLINE, 0, null, true);
    }
    if (!res.ok) throw new ApiError(errorMessage(await res.json().catch(() => null), res.status), res.status);
    // Needs Content-Disposition in the backend's CORS expose_headers (it is).
    const header = res.headers.get("Content-Disposition") || "";
    const utf8 = /filename\*=utf-8''([^;]+)/i.exec(header)?.[1];
    const plain = /filename="([^"]+)"/i.exec(header)?.[1];
    return deliverFile(await res.blob(), (utf8 && decodeURIComponent(utf8)) || plain || fileName || "cv", res.headers.get("Content-Type")?.split(";")[0]);
  }
  const { file } = await getApplicationCV(applicationId);
  if (!file) throw new ApiError("The original CV is available after the candidate accepts your shortlist.", 403);
  const blob = await readCVFile(file.id);
  if (!blob) throw new ApiError("The original CV file is not available.", 404);
  deliverFile(blob, file.name, file.contentType);
}

/* =========================================================
   Admin console
   =========================================================
 * With the admin module on, every screen reads and writes the backend (/api/admin/*), and the
 * store's `db.config` becomes a cache of what the server holds, so the existing pages render
 * unchanged. Without it, the same functions edit the local store as before. Each function
 * throws ApiError with a message the UI shows as is (e.g. "Skill is used by a role"). */

const ADMIN = "/admin";
const byId = (id) => encodeURIComponent(id);

/** Loads the configuration, user list and overview counts. With the admin module off this does nothing. */
export async function loadAdminData() {
  if (!uses("admin")) return;
  const [domains, roles, skills, questions, criteria, rules, users, stats] = await Promise.all(
    ["domains", "roles", "skills", "questions", "criteria", "rules", "users", "stats"].map((p) => request("GET", `${ADMIN}/${p}`))
  );
  write((d) => {
    Object.assign(d.config, { domains, roles, skills, questions, criteria, rules });
    d.adminUsers = users;
    d.adminStats = stats;
  });
}

/** Counts for the admin overview tiles, from the backend or from the local store. */
export function adminStats(db) {
  if (uses("admin") && db.adminStats) {
    const s = db.adminStats;
    return { candidates: s.candidates, employers: s.employers, sessions: s.sessions, openJobs: s.openJobs, applications: s.applications };
  }
  return {
    candidates: db.users.filter((u) => u.role === "candidate").length,
    employers: db.users.filter((u) => u.role === "employer").length,
    sessions: db.sessions.length,
    openJobs: db.jobs.filter((j) => j.status === "open").length,
    applications: db.applications.length,
  };
}

/** Rows for the admin Users page: { id, name, email, role, faceEnrolled, createdAt, sessions, jobs }. */
export function adminUsers(db) {
  if (uses("admin") && db.adminUsers) return db.adminUsers;
  return db.users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, faceEnrolled: !!u.face?.template, createdAt: u.createdAt,
    sessions: db.sessions.filter((s) => s.userId === u.id).length,
    jobs: db.jobs.filter((j) => j.employerId === u.id).length,
  }));
}

/** Admin: clears a user's face so they enrol a new one at their next sign-in. */
export async function resetFace(userId) {
  if (uses("admin")) {
    const row = await request("POST", `${ADMIN}/users/${byId(userId)}/reset-face`);
    write((d) => { d.adminUsers = (d.adminUsers || []).map((u) => (u.id === row.id ? row : u)); });
  } else {
    write((d) => { d.users.find((u) => u.id === userId).face = null; });
  }
}

/* ---- domains ---- */

export async function addDomain(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  let domain;
  if (uses("admin")) domain = await request("POST", `${ADMIN}/domains`, { name: trimmed });
  else {
    if (getDb().config.domains.some((d) => d.name.toLowerCase() === trimmed.toLowerCase())) throw new ApiError(`A domain named "${trimmed}" already exists.`, 409);
    domain = { id: uid("dom"), name: trimmed };
  }
  write((d) => { d.config.domains.push(domain); });
  return domain;
}

export async function removeDomain(id) {
  if (uses("admin")) await request("DELETE", `${ADMIN}/domains/${byId(id)}`);
  else if (getDb().config.roles.some((r) => r.domainId === id)) throw new ApiError("Move or delete this domain's roles first", 409);
  write((d) => { d.config.domains = d.config.domains.filter((x) => x.id !== id); });
}

/* ---- job roles ---- */

/** Creates (no id) or updates (with id) a role: { id?, title, domainId, skills: [{ name, weight }], responsibilities: [string], active }. */
export async function saveRole(role) {
  let saved;
  if (uses("admin")) {
    const body = { title: role.title, domainId: role.domainId, skills: role.skills, responsibilities: role.responsibilities || [], active: role.active !== false };
    saved = role.id ? await request("PUT", `${ADMIN}/roles/${byId(role.id)}`, body) : await request("POST", `${ADMIN}/roles`, body);
  } else saved = role.id ? role : { ...role, id: uid("role") };
  write((d) => upsert(d.config.roles, saved));
  return saved;
}

export async function removeRole(id) {
  if (uses("admin")) await request("DELETE", `${ADMIN}/roles/${byId(id)}`);
  write((d) => { d.config.roles = d.config.roles.filter((x) => x.id !== id); });
}

/* ---- skills ---- */

/** Re-reads skills and question templates (a skill rename or delete changes both). */
async function reloadSkills() {
  const [skills, questions] = await Promise.all([request("GET", `${ADMIN}/skills`), request("GET", `${ADMIN}/questions`)]);
  write((d) => { d.config.skills = skills; d.config.questions = questions; });
}

/** Creates or updates a skill: { id?, name, aliases, related, tip }. `originalName` identifies it in local mode. */
export async function saveSkill(skill, originalName) {
  if (uses("admin")) {
    const body = { name: skill.name, aliases: skill.aliases, related: skill.related || [], tip: skill.tip || "" };
    if (skill.id) await request("PUT", `${ADMIN}/skills/${byId(skill.id)}`, body);
    else await request("POST", `${ADMIN}/skills`, body);
    return reloadSkills();
  }
  write((d) => {
    const i = d.config.skills.findIndex((s) => s.name === originalName);
    if (i >= 0) d.config.skills[i] = skill;
    else d.config.skills.push(skill);
  });
}

export async function removeSkill(skill) {
  if (uses("admin")) {
    await request("DELETE", `${ADMIN}/skills/${byId(skill.id)}`);
    return reloadSkills();
  }
  const db = getDb();
  if (db.config.roles.some((r) => r.skills.some((s) => s.name === skill.name)) || db.jobs.some((j) => j.skills.some((s) => s.name === skill.name))) {
    throw new ApiError(`Skill is used by a role or job ("${skill.name}")`, 409);
  }
  write((d) => {
    d.config.skills = d.config.skills.filter((s) => s.name !== skill.name);
    d.config.questions = d.config.questions.filter((x) => x.skill !== skill.name);
  });
}

/* ---- question templates ---- */

/** Creates (no id) or updates (with id) a template: { id?, skill, type, text, keywords, followUp }. */
export async function saveQuestion(q) {
  let saved;
  if (uses("admin")) {
    const body = { skill: q.skill, type: q.type, text: q.text, keywords: q.keywords, followUp: q.followUp || "", difficulty: q.difficulty || "medium" };
    saved = q.id ? await request("PUT", `${ADMIN}/questions/${byId(q.id)}`, body) : await request("POST", `${ADMIN}/questions`, body);
  } else saved = q.id ? q : { ...q, id: uid("q") };
  write((d) => upsert(d.config.questions, saved));
  return saved;
}

/** Admin: a generated question joins the question bank and can be asked to any candidate. */
export async function approveQuestion(id) {
  const saved = uses("admin")
    ? await request("POST", `${ADMIN}/questions/${byId(id)}/approve`)
    : { ...getDb().config.questions.find((x) => x.id === id), status: "approved" };
  write((d) => upsert(d.config.questions, saved));
  return saved;
}

export async function removeQuestion(id) {
  if (uses("admin")) await request("DELETE", `${ADMIN}/questions/${byId(id)}`);
  write((d) => { d.config.questions = d.config.questions.filter((x) => x.id !== id); });
}

/* ---- criteria and rules ---- */

/** Changes one criterion's weight (1-3) and/or enabled switch. Shown at once; put back if the server refuses. */
export async function setCriterion(key, patch) {
  const before = getDb().config.criteria;
  const current = before.find((c) => c.key === key);
  const next = { weight: patch.weight ?? current.weight, enabled: patch.enabled ?? current.enabled };
  write((d) => { Object.assign(d.config.criteria.find((c) => c.key === key), next); });
  if (!uses("admin")) return;
  try {
    const criteria = await request("PUT", `${ADMIN}/criteria`, { criteria: [{ key, ...next }] });
    write((d) => { d.config.criteria = criteria; });
  } catch (e) {
    write((d) => { d.config.criteria = before; });
    throw e;
  }
}

/** Changes one or more scoring rules, e.g. { defaultQuestions: 4 }. Shown at once; put back if the server refuses. */
export async function setRules(patch) {
  const before = getDb().config.rules;
  write((d) => { Object.assign(d.config.rules, patch); });
  if (!uses("admin")) return;
  try {
    const rules = await request("PUT", `${ADMIN}/rules`, patch);
    write((d) => { d.config.rules = { ...d.config.rules, ...rules }; });
  } catch (e) {
    write((d) => { d.config.rules = before; });
    throw e;
  }
}
