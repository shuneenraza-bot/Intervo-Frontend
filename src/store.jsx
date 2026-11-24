import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DB_VERSION, seedDB } from "./data";
import { clearToken, connectStore, restoreSession } from "./api";
import { navigate } from "./router";
import { hasFace } from "./lib";
import { isPlainObject, readJSON, readRaw } from "./storage";

/*
 * App-wide store backed by localStorage. It plays the role of the PostgreSQL
 * database until the FastAPI backend is connected: each top-level key maps to
 * a planned table (users, profiles, sessions, jobs, applications, config.*).
 */

const DB_KEY = "intervo.db";
const AUTH_KEY = "intervo.auth";

const StoreContext = createContext(null);

/** True when `db` has every collection the pages read without checking. */
function validDB(db) {
  return (
    isPlainObject(db) &&
    ["users", "sessions", "jobs", "applications"].every((k) => Array.isArray(db[k])) &&
    isPlainObject(db.profiles) &&
    isPlainObject(db.config) &&
    ["domains", "skills", "roles", "questions", "criteria"].every((k) => Array.isArray(db.config[k])) &&
    isPlainObject(db.config.rules) &&
    db.users.every(isPlainObject)
  );
}

function loadDB() {
  // Corrupt, wrongly shaped or old data: that one key is deleted and a fresh seed is used.
  const db = readJSON(DB_KEY, validDB);
  if (db?.version === DB_VERSION) return db;
  try {
    // v5 → v6: the question bank. Keep every existing template (admin edits, ones past interviews used) and add
    // the new ones, matched by skill + question text so nothing is added twice.
    if (db?.version === 5) {
      const key = (q) => `${q.skill}|${q.text.trim().toLowerCase()}`;
      const have = new Set(db.config.questions.map(key));
      const taken = new Set(db.config.questions.map((q) => q.id));
      const added = seedDB().config.questions.filter((q) => !have.has(key(q))).map((q) => (taken.has(q.id) ? { ...q, id: `${q.id}-n` } : q));
      db.config = { ...db.config, questions: [...db.config.questions, ...added] };
      db.version = DB_VERSION;
      return db;
    }
    // v4 → v5: new domains, roles, skills and questions. Keep the user's data; keep old skills that jobs still use.
    if (db?.version === 4) {
      const fresh = seedDB().config;
      const usedByJobs = new Set(db.jobs.flatMap((j) => (j.skills || []).map((s) => s.name)));
      const kept = db.config.skills.filter((s) => usedByJobs.has(s.name) && !fresh.skills.some((f) => f.name === s.name));
      db.config = { ...db.config, domains: fresh.domains, roles: fresh.roles, skills: [...fresh.skills, ...kept], questions: fresh.questions };
      db.version = DB_VERSION;
      return db;
    }
    // v3 → v4: keep the user's data, only fix the Recruitment aliases ("hiring" caused false matches in job descriptions).
    if (db?.version === 3) {
      const rec = db.config.skills.find((s) => s.name === "Recruitment");
      if (rec) rec.aliases = rec.aliases.filter((a) => a !== "hiring").concat("talent acquisition");
      db.version = DB_VERSION;
      return db;
    }
  } catch {
    /* fall through to a fresh seed */
  }
  try { localStorage.removeItem(DB_KEY); } catch { /* blocked */ }
  return seedDB();
}

function loadAuth() {
  const id = readRaw(AUTH_KEY) || readRaw(AUTH_KEY, "session") || "";
  return typeof id === "string" ? id : "";
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(loadDB);
  const [authId, setAuthId] = useState(loadAuth);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  }, [db]);

  /** Immutable update with a mutable-style callback: update(d => { d.jobs.push(job) }) */
  const update = useCallback((fn) => {
    setDb((current) => {
      const next = structuredClone(current);
      fn(next);
      return next;
    });
  }, []);

  const login = useCallback((userId, remember = true) => {
    try {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
      (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, userId);
    } catch {
      /* ignore */
    }
    setAuthId(userId);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    clearToken();
    setAuthId("");
    navigate("/login", { replace: true });
  }, []);

  const notify = useCallback((message, tone = "good") => {
    setToast({ message, tone, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const resetDemo = useCallback(() => {
    setDb(seedDB());
    logout();
  }, [logout]);

  // A signed-in account must have a face enrolled: if it was reset, the session ends (the backend does the same with a 401).
  const found = db.users.find((u) => u.id === authId) || null;
  const user = found && ["candidate", "employer", "admin"].includes(found.role) && hasFace(found) ? found : null;

  // Give the API layer access to the store: local modules read/write it, backend modules cache into it.
  connectStore({ db, update, user, logout, notify });

  // A remembered sign-in is re-checked with the backend once on load (a no-op when auth is local).
  useEffect(() => {
    if (!authId) return;
    restoreSession().catch((e) => {
      if (e?.status === 401) return; // already signed out
      // Backend down, offline or failing: never leave a cached session on screen — show the login page.
      logout();
      notify(e?.message || "Can't reach the server. Please sign in again.", "bad");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ db, update, user, login, logout, notify, toast, resetDemo }),
    [db, update, user, login, logout, notify, toast, resetDemo]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

/* Convenience selectors */
export function useCandidateData(userId) {
  const { db } = useStore();
  return useMemo(() => {
    const sessions = db.sessions.filter((s) => s.userId === userId).sort((a, b) => b.date - a.date);
    const profile = db.profiles[userId] || {};
    const applications = db.applications.filter((a) => a.candidateId === userId);
    return { sessions, profile, applications };
  }, [db, userId]);
}
