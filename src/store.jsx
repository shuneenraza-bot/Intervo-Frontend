import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DB_VERSION, seedDB } from "./data";
import { clearToken, connectStore } from "./api";

/*
 * App-wide store backed by localStorage. It plays the role of the PostgreSQL
 * database until the FastAPI backend is connected: each top-level key maps to
 * a planned table (users, profiles, sessions, jobs, applications, config.*).
 */

const DB_KEY = "intervo.db";
const AUTH_KEY = "intervo.auth";

const StoreContext = createContext(null);

function loadDB() {
  try {
    const db = JSON.parse(localStorage.getItem(DB_KEY));
    if (db?.version === DB_VERSION) return db;
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
  return seedDB();
}

function loadAuth() {
  try {
    return localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY) || "";
  } catch {
    return "";
  }
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

  // Give the API layer access to the store: local mode reads/writes it, backend mode caches into it.
  connectStore({ db, update, logout });

  const user = db.users.find((u) => u.id === authId) || null;

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
