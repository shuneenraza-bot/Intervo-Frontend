/*
 * API service layer. Pages call api.* for every data operation; this file
 * decides, per module, where the work happens:
 *
 *   VITE_BACKEND_MODULES = ""              → everything runs in the browser against the
 *                                            localStorage store (lib.js / cvParser.js).
 *   VITE_BACKEND_MODULES = "auth,employer" → the listed modules call the FastAPI backend at
 *                                            API_URL with a JWT bearer token; the rest stay local.
 *
 *   auth      lookup, signup, login (password or face), face enrol/delete, me
 *   employer  config, jobs, apply/withdraw, application status, candidate ranking
 *   cv        CV analysis and JD parsing        (no backend endpoints yet)
 *   interview answer evaluation and sessions    (no backend endpoints yet)
 *
 * Backend responses are written back into the store, which then acts as a client-side
 * cache, so the pages render the same way whichever side did the work.
 *
 * Every function returns a Promise and throws ApiError with a user-facing message.
 * The endpoint contract is documented in API.md.
 */
import { evaluateAnswer as evaluateLocal, hashPassword, isLandmarkTemplate, suitability, uid } from "./lib";
import { extractText, parseCV, parseJD as parseJDLocal } from "./cvParser";

const MODULES = new Set(
  (import.meta.env.VITE_BACKEND_MODULES || "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)
);
/** True when `module` ("auth" | "employer" | "cv" | "interview") is served by the backend. */
export const uses = (module) => MODULES.has(module);
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");

if (uses("employer") && !uses("auth")) {
  console.warn("VITE_BACKEND_MODULES: the employer module needs the auth module too (its requests need a JWT).");
}

const TOKEN_KEY = "intervo.token";

export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = null) {
    super(message);
    this.status = status;
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
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg; // FastAPI validation error
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item could not be found.";
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  return "The server couldn't complete the request. Please try again.";
}

const OFFLINE = "Can't reach the server — is the backend running?";
const PUBLIC_PATHS = ["/auth/lookup", "/auth/login", "/auth/signup"]; // a 401 here is a wrong password, not an expired session

async function request(method, path, body) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body; // browser sets the multipart boundary
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(OFFLINE);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
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

  if (uses("cv")) {
    const form = new FormData();
    if (file) form.append("file", file);
    else form.append("text", text);
    onStep("read");
    onStep("extract");
    const { cv, text: extracted = text || "" } = await request("POST", "/cv/analyze", form);
    onStep("parse");
    return { ...cv, ...meta, parsedAt: Date.now(), text: extracted.slice(0, 20000) };
  }

  const source = file ? await extractText(file, onStep) : text;
  onStep("parse");
  const parsed = parseCV(source, getDb().config.skills);
  return { ...parsed, ...meta, parsedAt: Date.now(), text: source.slice(0, 20000) };
}

/** Extracts title, weighted skills, years and education from a job description. */
export async function parseJD(text, roleSkills = []) {
  if (uses("cv")) return request("POST", "/jd/parse", { text, roleSkills });
  return parseJDSync(text, roleSkills);
}

/** Local parseJD without the Promise, so live previews render in the same frame. Null when the backend parses. */
export function parseJDSync(text, roleSkills = []) {
  return uses("cv") ? null : parseJDLocal(text, getDb().config.skills, roleSkills);
}

/* =========================================================
   Interview
   ========================================================= */

/** Scores one answer against the admin-configured rubric. */
export async function evaluateAnswer(answer, question) {
  if (uses("interview")) return request("POST", "/interview/evaluate", { answer, question });
  return evaluateLocal(answer, question, getDb().config);
}

/** A candidate's sessions, newest first. In backend mode this also refreshes the cache. */
export async function getSessions(userId) {
  if (uses("interview")) {
    const sessions = await request("GET", `/sessions?userId=${encodeURIComponent(userId)}`);
    write((d) => { d.sessions = [...d.sessions.filter((s) => s.userId !== userId), ...sessions]; });
    return [...sessions].sort((a, b) => b.date - a.date);
  }
  return getDb().sessions.filter((s) => s.userId === userId).sort((a, b) => b.date - a.date);
}

/** Saves a finished session (without id). Resolves with the stored session. */
export async function saveSession(session) {
  const saved = uses("interview") ? await request("POST", "/sessions", session) : { ...session, id: session.id || uid("s") };
  write((d) => upsert(d.sessions, saved));
  return saved;
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
 * Ranked applicants for one job with explainable suitability. Only candidates who
 * consented are returned with evidence; the rest are counted in `hidden`.
 * Resolves with { job, visible: [{ app, cand, profile, sessions, fit }], hidden }.
 */
export async function getCandidates(jobId) {
  if (uses("employer")) {
    const { job, candidates, hidden } = await request("GET", `/jobs/${encodeURIComponent(jobId)}/candidates`);
    const visible = candidates
      .map((c) => ({ app: c.application, cand: c.candidate, profile: c.profile, sessions: c.sessions, fit: c.fit }))
      .sort((a, b) => b.fit.total - a.fit.total);
    return { job, visible, hidden };
  }
  return getCandidatesSync(jobId);
}

/** Local getCandidates without the Promise, so lists render in the same frame. Null when the backend ranks. */
export function getCandidatesSync(jobId, db = getDb()) {
  if (uses("employer")) return null;
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return { job: null, visible: [], hidden: 0 };
  const visible = [];
  let hidden = 0;
  db.applications.filter((a) => a.jobId === jobId).forEach((app) => {
    // Same rule the backend must apply: evidence only for consented, opted-in candidates.
    const cand = db.users.find((u) => u.id === app.candidateId);
    const profile = db.profiles[app.candidateId];
    if (!cand) return;
    if (!app.consent || profile?.shareWithEmployers === false) return hidden++;
    const sessions = db.sessions.filter((s) => s.userId === cand.id);
    visible.push({ app, cand, profile, sessions, fit: suitability({ job, profile, sessions, config: db.config }) });
  });
  visible.sort((a, b) => b.fit.total - a.fit.total);
  return { job, visible, hidden };
}
