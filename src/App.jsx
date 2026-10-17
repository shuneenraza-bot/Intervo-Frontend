import { useEffect, useMemo, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./App.css";

import { StoreProvider, useStore } from "./store";
import { skillPerformance } from "./lib";
import { Shell } from "./Shell";
import Auth from "./Auth";
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

  function go(id, nextParams = {}) {
    setPage(id);
    setParams(nextParams);
    setNavKey((k) => k + 1); // remount so re-clicking a page resets it (e.g. interview summary → setup)
    setMenuOpen(false);
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }

  if (!user) return <Auth />;

  const pageProps = { page, go, params };

  return (
    <Shell
      page={page}
      go={go}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      badges={user.role === "candidate" ? { progress: weakCount } : {}}
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
