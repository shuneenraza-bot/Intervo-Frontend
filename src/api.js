/*
 * API service layer. Pages call api.* for every data operation; this file
 * decides, per module, where the work happens:
 *
 *   VITE_BACKEND_MODULES = ""              → everything runs in the browser against the
 *                                            localStorage store (lib.js / cvParser.js).
 *   VITE_BACKEND_MODULES = "auth,employer,candidate,admin" → the listed modules call the FastAPI
 *                                            backend at API_URL with a JWT bearer token; the rest stay local.
 *
 *   auth      lookup, signup, login (password or face), face enrol/delete, me
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

const MODULES = new Set(
  (import.meta.env.VITE_BACKEND_MODULES || "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)
);
/** True when `module` ("auth" | "employer" | "candidate" | "admin") is served by the backend. */
export const uses = (module) => MODULES.has(module);
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");

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
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
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
const PUBLIC_PATHS = ["/auth/lookup", "/auth/login", "/auth/signup"]; // a 401 here is a wrong password, not an expired session

async function request(method, path, body, { timeout = 0 } = {}) {
  const headers = { Accept: "application/json" };
  const token = getToken();
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

/** Sign-in step 1. Resolves with { faceEnabled } so the UI knows whether to offer Face ID. */
export async function lookupAccount({ email, role }) {
  const normalised = email.trim().toLowerCase();
  if (uses("auth")) return request("POST", "/auth/lookup", { email: normalised, role });
  return { faceEnabled: isLandmarkTemplate(findAccount(normalised, role).face?.template) };
}

/**
 * Sign-in step 2 with ONE method: pass `password`, or `faceTemplate` (the live landmark
 * template from a blink-verified FaceCapture). Resolves with the signed-in user.
 */
export async function login({ email, role, password, faceTemplate, remember = true }) {
  const normalised = email.trim().toLowerCase();
  const method = faceTemplate ? "face" : "password";
  if (uses("auth")) {
    const body = faceTemplate ? { email: normalised, role, faceTemplate } : { email: normalised, role, password };
    const { token, user } = await request("POST", "/auth/login", body);
    setToken(token, remember);
    cacheUser(user);
    return user;
  }
  const found = findAccount(normalised, role);
  if (method === "password") {
    if ((await hashPassword(found.id, password)) !== found.passwordHash) throw new ApiError("Incorrect password.", 401);
  } else {
    if (!isLandmarkTemplate(found.face?.template)) throw new ApiError("Face ID isn't set up for this account.", 400);
    const { compareGeometry } = await import("./faceCues"); // already loaded by the face step
    const threshold = getDb().config.rules.faceThreshold;
    const sim = compareGeometry(faceTemplate.features, found.face.template.features);
    if (sim < threshold) throw new ApiError(`Face didn't match this account (similarity ${sim.toFixed(2)}, needs ${threshold}).`, 401);
  }
  const lastLogin = { at: Date.now(), method };
  write((d) => { d.users.find((u) => u.id === found.id).lastLogin = lastLogin; });
  return { ...found, lastLogin };
}

/** Creates a candidate or employer account. `face` is the enrolment result or null. Resolves with the new user. */
export async function signup({ role, name, email, company, password, dataConsent = false, face = null }) {
  const body = {
    role, name: name.trim(), email: email.trim().toLowerCase(),
    company: role === "employer" ? company.trim() : undefined,
    password, dataConsent,
    face: face ? { template: face.template } : null,
  };
  if (uses("auth")) {
    const { token, user } = await request("POST", "/auth/signup", body);
    setToken(token, true);
    cacheUser(user);
    return user;
  }
  if (getDb().users.some((u) => u.email === body.email)) throw new ApiError("An account with this email already exists.", 409);
  const id = uid(role === "employer" ? "emp" : "cand");
  const user = {
    id, role, name: body.name, email: body.email, company: body.company,
    passwordHash: await hashPassword(id, password), createdAt: Date.now(),
    face: face ? { template: face.template, enrolledAt: Date.now() } : null,
    lastLogin: { at: Date.now(), method: "signup" },
  };
  write((d) => {
    d.users.push(user);
    if (role === "candidate") d.profiles[id] = { skills: [], shareWithEmployers: false, consentAt: Date.now() };
  });
  return user;
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

/** Enrols or replaces the user's Face ID template. */
export async function enrolFace(userId, template) {
  if (uses("auth")) return cacheUser(await request("PUT", "/auth/face", { template }));
  write((d) => { d.users.find((u) => u.id === userId).face = { template, enrolledAt: Date.now() }; });
}

/** Deletes the user's Face ID template. */
export async function deleteFace(userId) {
  if (uses("auth")) return cacheUser(await request("DELETE", "/auth/face"));
  write((d) => { d.users.find((u) => u.id === userId).face = null; });
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
  return { ...parsed, ...meta, parsedAt: Date.now(), text: source.slice(0, 20000) };
}

/** A backend CVResponse as the CV page's record. `provider` is "gemini" or "rules". */
function serverCV(res, meta) {
  return { ...res.cv, ...meta, provider: res.provider, parsedAt: Date.now(), text: (res.text || "").slice(0, 20000) };
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
    questions: res.questions.map((q) => ({ id: q.id, text: q.question, skill: q.skill, type: q.type, reason: q.reason, keywords: [], followUp: null })),
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
      answer: q.answer, followUp: q.followUp || null, indicators: q.indicators || null, reason: q.reason, provider: q.provider,
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
  await syncCandidateData(candidateId); // the employer's ranking reads the server copy
  const application = uses("employer")
    ? await request("POST", `/jobs/${encodeURIComponent(jobId)}/apply`, { consent })
    : { id: uid("app"), jobId, candidateId, date: Date.now(), consent };
  write((d) => {
    upsert(d.applications, application);
    if (consent) d.profiles[candidateId] = { ...d.profiles[candidateId], shareWithEmployers: true };
  });
  return application;
}

/** Withdraws the candidate's application to a job. */
export async function withdrawApplication({ jobId, candidateId }) {
  if (uses("employer")) await request("DELETE", `/jobs/${encodeURIComponent(jobId)}/apply`);
  write((d) => { d.applications = d.applications.filter((a) => !(a.jobId === jobId && a.candidateId === candidateId)); });
}

/** Employer moves an application through the pipeline: "new" | "shortlisted" | "declined". */
export async function setApplicationStatus(applicationId, status) {
  if (uses("employer")) await request("PATCH", `/applications/${encodeURIComponent(applicationId)}`, { status });
  write((d) => {
    const app = d.applications.find((a) => a.id === applicationId);
    if (app) app.status = status;
  });
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
    const visible = candidates.map((c) => ({ app: c.application, cand: c.candidate, cvSummary: c.cvSummary, match: c.match }));
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
    const cv = profile?.cv;
    const cvSummary = cv ? { topDegree: cv.education?.[0]?.degree || null, experienceYears: cv.experienceYears || 0, projectCount: cv.projects?.length || 0 } : null;
    const match = cvFit({ job, profile, config: db.config, checks: requirementChecks(job, profile) });
    visible.push({ app, cand, cvSummary, match });
  });
  visible.sort((a, b) => b.match.percentage - a.match.percentage); // stable: ties keep application order
  return { job, visible, hidden };
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

/** Creates (no id) or updates (with id) a role: { id?, title, domainId, skills: [{ name, weight }] }. */
export async function saveRole(role) {
  let saved;
  if (uses("admin")) {
    const body = { title: role.title, domainId: role.domainId, skills: role.skills };
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
    const body = { skill: q.skill, type: q.type, text: q.text, keywords: q.keywords, followUp: q.followUp || "" };
    saved = q.id ? await request("PUT", `${ADMIN}/questions/${byId(q.id)}`, body) : await request("POST", `${ADMIN}/questions`, body);
  } else saved = q.id ? q : { ...q, id: uid("q") };
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
