import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { navigate } from "./router";
import { Brand, ThemeToggle } from "./ui";
import { ProductPreview, SHOWCASE } from "./Auth";

/* Public landing page (#/). Section links scroll with the app's Lenis instance;
   cards fade up as they enter the viewport unless the user prefers reduced motion. */

const NAV = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "employers", label: "For employers" },
];

const MODES = [
  { icon: "message", title: "Text", text: "Type your answers at your own pace and edit before you submit." },
  { icon: "mic", title: "Voice", text: "Answer out loud; your speech is transcribed as you talk." },
  { icon: "video", title: "Video", text: "Practise on camera with eye-contact and expressiveness cues." },
];

const RUBRIC = ["Technical accuracy", "Relevance", "Clarity", "Completeness", "Communication", "STAR structure"];

const FEATURES = [
  {
    icon: "file",
    title: "CV & job description analysis",
    text: "Upload a PDF or DOCX CV and add a job posting. Intervo extracts your skills and experience, and the role's requirements.",
  },
  {
    icon: "layers",
    title: "Skill-gap matching",
    text: "Every requirement in the role is checked against your CV, so you know what to prepare before the interview.",
    extra: (
      <div className="chips">
        <span className="chip chip--good"><Icon name="check" size={12} /> Matched</span>
        <span className="chip chip--warn">Partial</span>
        <span className="chip lp-chip--low">Missing</span>
      </div>
    ),
  },
  {
    icon: "message",
    title: "Adaptive mock interviews",
    text: "Questions are built from your target role. Short or vague answers get a follow-up question, the way a real interviewer would ask.",
  },
  {
    icon: "chart",
    title: "Rubric feedback",
    text: "Each answer is scored against a published rubric, with a note on what to improve.",
    extra: (
      <div className="chips">
        {RUBRIC.map((r) => <span className="chip chip--sm chip--muted" key={r}>{r}</span>)}
      </div>
    ),
  },
  {
    icon: "trend",
    title: "Weakness tracking across sessions",
    text: "Skills that stay below the threshold are flagged and prioritised in your next interview until they improve.",
  },
  {
    icon: "scan",
    title: "Face-verified secure sign-in",
    text: "Sign in with your password or Face ID. Repeated failed attempts pause sign-in automatically.",
  },
];

const STEPS = [
  { icon: "upload", title: "Upload your CV", text: "PDF or DOCX. Review and correct the extracted sections before they're used." },
  { icon: "briefcase", title: "Pick a target role", text: "Choose a role or paste a job description to see where you match." },
  { icon: "mic", title: "Practise an adaptive interview", text: "Answer in text, voice or video. Follow-ups adapt to what you say." },
  { icon: "target", title: "Track and fix weak skills", text: "See scores per skill over time and drill the ones that need work." },
];

const EMPLOYER_POINTS = [
  { icon: "sliders", title: "Weighted job skills", text: "Decide which skills matter most for the role, and by how much." },
  { icon: "chart", title: "Explainable CV skill match", text: "See which required skills each CV matches, partly matches or misses, with the weights you set." },
  { icon: "users", title: "Candidates who opt in only", text: "You only see candidates who chose to share their CV match with employers. Interview results always stay private." },
  { icon: "checkCircle", title: "The final decision stays with you", text: "Intervo informs your shortlist. It never rejects or hires anyone." },
];

const PRIVACY = [
  { icon: "shield", title: "Consent-first sharing", text: "Nothing reaches an employer unless you turn sharing on, and you can turn it off again at any time." },
  { icon: "scan", title: "Face templates, not photos", text: "Face ID keeps a numeric template of your face for matching, not the images from your camera." },
  { icon: "trash", title: "Delete your data anytime", text: "Remove your CV, interview sessions and face template from Profile & Privacy whenever you want." },
];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Adds .is-in to every [data-reveal] inside `ref` once it scrolls into view. */
function useReveal(ref) {
  useEffect(() => {
    const els = ref.current.querySelectorAll("[data-reveal]");
    if (reducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}

/** Stagger delay for the nth revealed item in a group. */
const delay = (i) => ({ "--d": `${i * 70}ms` });

export default function Landing({ lenis }) {
  const rootRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useReveal(rootRef);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Close the mobile menu on Escape or when the viewport grows past the breakpoint */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    const mq = window.matchMedia("(min-width: 861px)");
    const onWide = (e) => e.matches && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  function scrollToId(id) {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis?.current) lenis.current.scrollTo(el, { offset: -76 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function scrollTop() {
    setMenuOpen(false);
    if (lenis?.current) lenis.current.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  const go = (path) => () => navigate(path);

  return (
    <div className="lp" ref={rootRef}>
      {/* ---------- Navbar ---------- */}
      <header className={`lp-nav ${scrolled || menuOpen ? "is-scrolled" : ""}`}>
        <div className="lp-wrap lp-nav__bar">
          <button className="lp-nav__brand" onClick={scrollTop} aria-label="Intervo, back to top"><Brand /></button>
          <nav className="lp-nav__links" aria-label="Sections">
            {NAV.map((n) => <button key={n.id} onClick={() => scrollToId(n.id)}>{n.label}</button>)}
          </nav>
          <div className="lp-nav__actions">
            <ThemeToggle />
            <button className="btn btn--ghost btn--sm lp-nav__cta" onClick={go("/login")}>Sign in</button>
            <button className="btn btn--primary btn--sm lp-nav__cta" onClick={go("/signup")}>Get started <Icon name="arrowRight" size={14} /></button>
            <button
              className="icon-btn lp-nav__menu"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="lp-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <Icon name={menuOpen ? "x" : "menu"} size={19} />
            </button>
          </div>
        </div>
        <div id="lp-menu" className={`lp-menu ${menuOpen ? "is-open" : ""}`} hidden={!menuOpen}>
          {NAV.map((n) => (
            <button key={n.id} className="lp-menu__link" onClick={() => scrollToId(n.id)}>
              {n.label} <Icon name="chevronRight" size={16} />
            </button>
          ))}
          <div className="lp-menu__actions">
            <button className="btn btn--ghost" onClick={go("/login")}>Sign in</button>
            <button className="btn btn--primary" onClick={go("/signup")}>Get started</button>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="lp-hero">
          <div className="showcase__grid" aria-hidden="true" />
          <div className="lp-wrap lp-hero__inner">
            <div className="lp-hero__copy">
              <span className="showcase__pill"><i /> AI-powered interview coaching</span>
              <h1>Interview practice that learns where you struggle.</h1>
              <p className="lp-hero__text">
                Intervo reads your CV and the role you're aiming for, then runs mock interviews in text, voice or video that adapt
                to your answers and keep returning to the skills you haven't mastered yet.
              </p>
              <div className="lp-hero__actions">
                <button className="btn btn--primary btn--lg" onClick={go("/signup")}>Get started free <Icon name="arrowRight" size={16} /></button>
                <button className="btn btn--lg lp-btn-dark" onClick={go("/login")}>Sign in</button>
              </div>
              <ul className="lp-hero__facts">
                <li><Icon name="file" size={14} /> CV-aware questions</li>
                <li><Icon name="refresh" size={14} /> Adaptive follow-ups</li>
                <li><Icon name="shield" size={14} /> You control sharing</li>
              </ul>
            </div>
            <div className="lp-hero__visual" aria-hidden="true">
              <ProductPreview s={SHOWCASE.candidate} />
              <div className="lp-float">
                <span className="lp-float__icon"><Icon name="message" size={14} /></span>
                <div>
                  <small>Follow-up question</small>
                  <p>How did you measure whether the change actually improved load time?</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Interview modes ---------- */}
        <section className="lp-wrap lp-modes" aria-label="Interview modes">
          <p className="lp-modes__label">Three interview modes</p>
          <ul className="lp-modes__list">
            {MODES.map((m, i) => (
              <li key={m.title} data-reveal style={delay(i)}>
                <span className="lp-tile"><Icon name={m.icon} size={18} /></span>
                <div>
                  <strong>{m.title}</strong>
                  <p>{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="lp-wrap lp-section">
          <SectionHead
            kicker="Features"
            title="Everything between your CV and the real interview."
            text="Intervo connects what's on your CV, what the role asks for and how you actually answer, so every session targets what matters."
          />
          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <div key={f.title} data-reveal style={delay(i % 3)}>
                <article className="lp-card">
                  <span className="lp-tile"><Icon name={f.icon} size={18} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  {f.extra}
                </article>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="lp-section lp-section--tint">
          <div className="lp-wrap">
            <SectionHead kicker="How it works" title="From CV to confident answers in four steps." center />
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} data-reveal style={delay(i)}>
                  <span className="lp-steps__num">{i + 1}</span>
                  <div>
                    <h3><Icon name={s.icon} size={15} /> {s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- For employers ---------- */}
        <section id="employers" className="lp-wrap lp-section lp-split">
          <div className="lp-split__copy" data-reveal>
            <SectionHead
              kicker="For employers"
              title="Shortlist with evidence, not guesswork."
              text="Post a role, weight the skills it needs, and see how opted-in candidates performed on exactly those skills, with every score explained."
            />
            <ul className="lp-points">
              {EMPLOYER_POINTS.map((p) => (
                <li key={p.title}>
                  <span className="lp-tile lp-tile--sm"><Icon name={p.icon} size={15} /></span>
                  <div>
                    <strong>{p.title}</strong>
                    <p>{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button className="btn btn--primary btn--lg" onClick={go("/signup")}>Post a job <Icon name="arrowRight" size={16} /></button>
          </div>
          <div className="lp-stage" data-reveal style={delay(1)} aria-hidden="true">
            <div className="showcase__grid" />
            <ProductPreview s={SHOWCASE.employer} className="lp-stage__card" />
          </div>
        </section>

        {/* ---------- Privacy ---------- */}
        <section className="lp-section lp-section--tint" aria-labelledby="lp-privacy">
          <div className="lp-wrap lp-privacy">
            <div data-reveal>
              <p className="kicker">Privacy</p>
              <h2 id="lp-privacy">Your data, your call.</h2>
              <p className="lp-head__text">
                Interview practice means sharing your CV, your voice and sometimes your face. Intervo is built so that you stay in control of all three.
              </p>
            </div>
            <ul className="lp-privacy__list">
              {PRIVACY.map((p, i) => (
                <li key={p.title} data-reveal style={delay(i)}>
                  <span className="lp-tile"><Icon name={p.icon} size={18} /></span>
                  <div>
                    <strong>{p.title}</strong>
                    <p>{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="lp-wrap lp-cta-wrap">
          <div className="lp-cta" data-reveal>
            <div className="showcase__grid" aria-hidden="true" />
            <h2>Ready for your next interview?</h2>
            <p>Upload your CV and run your first adaptive mock interview in a few minutes.</p>
            <div className="lp-hero__actions">
              <button className="btn btn--primary btn--lg" onClick={go("/signup")}>Create free account <Icon name="arrowRight" size={16} /></button>
              <button className="btn btn--lg lp-btn-dark" onClick={go("/login")}>Sign in</button>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer__top">
            <div className="lp-footer__about">
              <Brand />
              <p>Adaptive, CV-aware interview practice for candidates, and explainable skill evidence for the employers they choose to share it with.</p>
            </div>
            <nav className="lp-footer__cols" aria-label="Footer">
              <div>
                <h4>Product</h4>
                {NAV.map((n) => <button key={n.id} onClick={() => scrollToId(n.id)}>{n.label}</button>)}
              </div>
              <div>
                <h4>Account</h4>
                <button onClick={go("/login")}>Sign in</button>
                <button onClick={go("/signup")}>Create account</button>
                <button onClick={go("/signup")}>Post a job</button>
              </div>
            </nav>
          </div>
          <p className="lp-footer__fyp">
            Final Year Project · Department of Software Engineering, University of Gujrat · Supervised by Dr. Farooq Ali
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ kicker, title, text, center = false }) {
  return (
    <div className={`lp-head ${center ? "lp-head--center" : ""}`}>
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      {text && <p className="lp-head__text">{text}</p>}
    </div>
  );
}
