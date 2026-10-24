/*
 * API service layer. Pages call api.* for every data operation; this file
 * decides where the work happens:
 *
 *   USE_BACKEND = false (default) → the prototype logic in lib.js / cvParser.js
 *                                   runs in the browser against the localStorage store.
 *   USE_BACKEND = true            → REST calls to the FastAPI backend at API_URL with a
 *                                   JWT bearer token. Responses are written back into the
 *                                   store, which then acts as a client-side cache, so the
 *                                   pages render exactly the same way in both modes.
 *
 * Every function returns a Promise and throws ApiError with a user-facing message.
 * The endpoint contract is documented in API.md.
 */
import { evaluateAnswer as evaluateLocal, hashPassword, suitability, uid } from "./lib";
import { extractText, parseCV, parseJD as parseJDLocal } from "./cvParser";

export const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

const TOKEN_KEY = "intervo.token";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/* ---------- Store binding ----------
 * StoreProvider calls connectStore({ db, update, logout }) on every render so
 * local mode reads the latest db and both modes can write to it. */
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
  return "The server couldn't complete the request. Please try again.";
}

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
    throw new ApiError("Can't reach the Intervo server. Check your connection and try again.");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/")) {
      clearToken();
      store?.logout();
    }
    throw new ApiError(errorMessage(data, res.status), res.status);
  }
  return data;
}

/* ---------- Cache helpers (backend mode) ---------- */
function upsert(list, item, key = "id") {
  const i = list.findIndex((x) => x[key] === item[key]);
  if (i >= 0) list[i] = { ...list[i], ...item };
  else list.push(item);
}
function cacheUser(user) {
  write((d) => upsert(d.users, user));
}

/* =========================================================
   Auth
   ========================================================= */

/** Checks email + password for the selected role. Resolves with the user (incl. face template) for the face step. */
export async function login({ email, password, role, remember = true }) {
  const normalised = email.trim().toLowerCase();
  if (USE_BACKEND) {
    const { token, user } = await request("POST", "/auth/login", { email: normalised, password, role });
    setToken(token, remember);
    cacheUser(user);
    return user;
  }
  const found = getDb().users.find((u) => u.email === normalised);
  if (!found) throw new ApiError("No account found with that email.", 404);
  const hash = await hashPassword(found.id, password);
  if (hash !== found.passwordHash) throw new ApiError("Incorrect password.", 401);
  if (found.role !== role) throw new ApiError(`This account is registered as ${found.role}. Switch the tab above.`, 403);
  return found;
}

/** Creates a candidate or employer account. `face` is the enrolment result or null. Resolves with the new user. */
export async function signup({ role, name, email, company, password, dataConsent = false, face = null }) {
  const body = {
    role, name: name.trim(), email: email.trim().toLowerCase(),
    company: role === "employer" ? company.trim() : undefined,
    password, dataConsent,
    face: face ? { template: face.template } : null,
  };
  if (USE_BACKEND) {
    const { token, user } = await request("POST", "/auth/signup", body);
    setToken(token, true);
    write((d) => {
      upsert(d.users, user);
      if (role === "candidate") d.profiles[user.id] ??= { skills: [], shareWithEmployers: false, consentAt: Date.now() };
    });
    return user;
  }
  if (getDb().users.some((u) => u.email === body.email)) throw new ApiError("An account with this email already exists.", 409);
  const id = uid(role === "employer" ? "emp" : "cand");
  const user = {
    id, role, name: body.name, email: body.email, company: body.company,
    passwordHash: await hashPassword(id, password), createdAt: Date.now(),
    face: face ? { template: face.template, enrolledAt: Date.now() } : null,
    lastLogin: { at: Date.now(), method: face ? "signup+face" : "signup" },
  };
  write((d) => {
    d.users.push(user);
    if (role === "candidate") d.profiles[id] = { skills: [], shareWithEmployers: false, consentAt: Date.now() };
  });
  return user;
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

  if (USE_BACKEND) {
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
  if (USE_BACKEND) return request("POST", "/jd/parse", { text, roleSkills });
  return parseJDSync(text, roleSkills);
}

/** Local-mode parseJD without the Promise, so live previews render in the same frame. Null in backend mode. */
export function parseJDSync(text, roleSkills = []) {
  return USE_BACKEND ? null : parseJDLocal(text, getDb().config.skills, roleSkills);
}

/* =========================================================
   Interview
   ========================================================= */

/** Scores one answer against the admin-configured rubric. */
export async function evaluateAnswer(answer, question) {
  if (USE_BACKEND) return request("POST", "/interview/evaluate", { answer, question });
  return evaluateLocal(answer, question, getDb().config);
}

/** A candidate's sessions, newest first. In backend mode this also refreshes the cache. */
export async function getSessions(userId) {
  if (USE_BACKEND) {
    const sessions = await request("GET", `/sessions?userId=${encodeURIComponent(userId)}`);
    write((d) => { d.sessions = [...d.sessions.filter((s) => s.userId !== userId), ...sessions]; });
    return [...sessions].sort((a, b) => b.date - a.date);
  }
  return getDb().sessions.filter((s) => s.userId === userId).sort((a, b) => b.date - a.date);
}

/** Saves a finished session (without id). Resolves with the stored session. */
export async function saveSession(session) {
  const saved = USE_BACKEND ? await request("POST", "/sessions", session) : { ...session, id: session.id || uid("s") };
  write((d) => upsert(d.sessions, saved));
  return saved;
}

/* =========================================================
   Jobs & applications
   ========================================================= */

/**
 * All job postings. In backend mode this also refreshes the cache with the jobs and
 * the applications the caller may see (a candidate's own, or those on an employer's jobs).
 */
export async function getJobs() {
  if (USE_BACKEND) {
    const { jobs, applications } = await request("GET", "/jobs");
    write((d) => {
      d.jobs = jobs;
      const ids = new Set(applications.map((a) => a.id));
      d.applications = [...d.applications.filter((a) => !ids.has(a.id)), ...applications];
    });
    return jobs;
  }
  return getDb().jobs;
}

/** Creates (no id) or updates (with id) a job posting for `employer`. Resolves with the stored job. */
export async function saveJob(job, employer) {
  let saved;
  if (USE_BACKEND) saved = job.id ? await request("PUT", `/jobs/${encodeURIComponent(job.id)}`, job) : await request("POST", "/jobs", job);
  else saved = job.id ? job : { ...job, id: uid("job"), employerId: employer.id, company: employer.company, createdAt: Date.now() };
  write((d) => upsert(d.jobs, saved));
  return saved;
}

/** Applies the candidate to a job. `consent` shares their results with the employer. */
export async function applyToJob({ jobId, candidateId, consent }) {
  const application = USE_BACKEND
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
  if (USE_BACKEND) await request("DELETE", `/jobs/${encodeURIComponent(jobId)}/apply`);
  write((d) => { d.applications = d.applications.filter((a) => !(a.jobId === jobId && a.candidateId === candidateId)); });
}

/** Employer moves an application through the pipeline: "new" | "shortlisted" | "declined". */
export async function setApplicationStatus(applicationId, status) {
  if (USE_BACKEND) await request("PATCH", `/applications/${encodeURIComponent(applicationId)}`, { status });
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
  if (USE_BACKEND) {
    const { job, candidates, hidden } = await request("GET", `/jobs/${encodeURIComponent(jobId)}/candidates`);
    const visible = candidates
      .map((c) => ({ app: c.application, cand: c.candidate, profile: c.profile, sessions: c.sessions, fit: c.fit }))
      .sort((a, b) => b.fit.total - a.fit.total);
    return { job, visible, hidden };
  }
  return getCandidatesSync(jobId);
}

/** Local-mode getCandidates without the Promise, so lists render in the same frame. Null in backend mode. */
export function getCandidatesSync(jobId, db = getDb()) {
  if (USE_BACKEND) return null;
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
