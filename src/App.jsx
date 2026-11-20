import { useEffect, useMemo, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./App.css";

import { StoreProvider, useStore } from "./store";
import { skillPerformance } from "./lib";
import { appStatus } from "./api";
import { navigate, useHashPath } from "./router";
import { Shell } from "./Shell";
import Auth from "./Auth";
import Landing from "./Landing";
import CandidateApp, { CandidatePromo } from "./CandidateApp";
import EmployerApp from "./EmployerApp";
import AdminApp from "./AdminApp";

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

function Root() {
  const { user, db } = useStore();
  const path = useHashPath();
  const [page, setPage] = useState("overview");
  const [params, setParams] = useState({});
  const [navKey, setNavKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const lenisRef = useRef(null);

  /* Lenis smooth scrolling — wheel and touch at 1.5× with an expo ease-out */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.5,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;
    let raf;
    const loop = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  /* Back to the overview whenever a different user signs in */
  useEffect(() => {
    setPage("overview");
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [user?.id]);

  /* Pause page scrolling while the mobile menu is open */
  useEffect(() => {
    if (menuOpen) lenisRef.current?.stop();
    else lenisRef.current?.start();
  }, [menuOpen]);

  const weakCount = useMemo(() => {
    if (user?.role !== "candidate") return 0;
    return skillPerformance(db.sessions.filter((s) => s.userId === user.id), db.config.rules).filter((p) => p.weak).length;
  }, [db, user]);

  // Shortlists waiting for the candidate's answer
  const awaiting = useMemo(
    () => (user?.role === "candidate" ? db.applications.filter((a) => a.candidateId === user.id && appStatus(a) === "shortlisted").length : 0),
    [db.applications, user]
  );

  function go(id, nextParams = {}) {
    setPage(id);
    setParams(nextParams);
    setNavKey((k) => k + 1); // remount so re-clicking a page resets it (e.g. interview summary → setup)
    setMenuOpen(false);
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }

  /* Public routes: signed-out users see #/ (landing), #/login and #/signup; signed-in users always land on #/dashboard */
  const authView = path === "/signup" ? "signup" : "login";
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
    else if (path !== "/" && path !== "/login" && path !== "/signup") navigate("/", { replace: true });
  }, [user, path]);

  /* Each route starts at the top (e.g. landing → sign-up after scrolling) */
  useEffect(() => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [path]);

  if (!user) return path === "/" ? <Landing lenis={lenisRef} /> : <Auth view={authView} />;

  const pageProps = { page, go, params };

  return (
    <Shell
      page={page}
      go={go}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      badges={user.role === "candidate" ? { progress: weakCount, applications: awaiting } : {}}
      promo={user.role === "candidate" ? <CandidatePromo go={go} weakCount={weakCount} /> : null}
    >
      <main className="content" key={`${user.id}-${page}-${navKey}`}>
        {user.role === "candidate" && <CandidateApp {...pageProps} />}
        {user.role === "employer" && <EmployerApp {...pageProps} />}
        {user.role === "admin" && <AdminApp {...pageProps} />}
      </main>
    </Shell>
  );
}
