import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { DEMO_ACCOUNTS } from "./data";
import { firstName, passwordMeetsRules, passwordStrength } from "./lib";
import * as api from "./api";
import { navigate } from "./router";
import { Brand, Meter, ThemeToggle } from "./ui";
import { FaceCapture } from "./Camera";
import { isPlainObject, readJSON } from "./storage";

const ROLE_COPY = {
  candidate: { label: "Candidate", icon: "user", text: "Practise interviews, close skill gaps and track progress." },
  employer: { label: "Employer", icon: "building", text: "Post jobs and rank candidates by how well their CV matches the skills you need." },
  admin: { label: "Admin", icon: "settings", text: "Configure domains, roles, skills and evaluation criteria." },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** view: "login" (#/login) | "signup" (#/signup) — chosen by the hash route in App. */
export default function Auth({ view }) {
  const [role, setRole] = useState("candidate");
  // Admins can't sign up, so the sign-up page (and its showcase) falls back to candidate.
  const shownRole = view === "signup" && role === "admin" ? "candidate" : role;

  return (
    <div className="auth">
      <section className="auth__form-side">
        <div className="auth__top">
          <button className="auth__home" onClick={() => navigate("/")} aria-label="Intervo home"><Brand /></button>
          <div className="auth__top-actions">
            <ThemeToggle />
            <button className="btn btn--ghost btn--sm" onClick={() => navigate(view === "login" ? "/signup" : "/login")}>
              {view === "login" ? <>Create account <Icon name="userPlus" size={15} /></> : <>Sign in <Icon name="arrowRight" size={15} /></>}
            </button>
          </div>
        </div>
        <div className="auth__form-wrap" key={view}>
          {view === "login" ? <SignIn role={role} setRole={setRole} /> : <SignUp role={shownRole} setRole={setRole} />}
        </div>
        <p className="auth__foot">Final Year Project · Department of Software Engineering, University of Gujrat</p>
      </section>
      <Showcase role={shownRole} />
    </div>
  );
}

/* ---------------- Attempt limits ----------------
 * Client-side mirror of the limits the backend enforces (it answers 429 + Retry-After):
 * 5 wrong passwords → 60 s, 3 wrong faces → 5 min. The password counter survives a reload. */

const MAX_PASSWORD_FAILS = 5;
const LOCK_SECONDS = 60;
const PASSWORD_KEY = "intervo.passwordGuard"; // localStorage: email → { fails }

function readMap(key) {
  return readJSON(key, isPlainObject, {});
}

function writeEntry(key, email, value) {
  try {
    const map = readMap(key);
    if (value == null) delete map[email];
    else map[email] = value;
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* storage blocked — limits then only last for this page */
  }
}

/* ---------------- Sign in: step 1 password → step 2 face (both required) ---------------- */

function SignIn({ role, setRole }) {
  const { login, notify } = useStore();
  const [stage, setStage] = useState("password"); // "password" | "face"
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);

  const locked = lockedUntil > now;
  const addr = email.trim().toLowerCase();

  // Countdown while sign-in is blocked.
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [locked]);

  function showError(message, isNoAccount = false) {
    setError(message);
    setNoAccount(isNoAccount);
  }

  function lockFor(seconds) {
    setLockedUntil(Date.now() + seconds * 1000);
    setNow(Date.now());
    showError("");
  }

  /* Step 1: role + email + password. Success only opens the face step. */
  async function checkPassword(e) {
    e.preventDefault();
    if (locked) return;
    showError("");
    if (!EMAIL_RE.test(addr)) return showError("Enter a valid email address.");
    if (!password) return showError("Enter your password.");
    setLoading(true);
    try {
      const res = await api.startLogin({ email: addr, role, password });
      writeEntry(PASSWORD_KEY, addr, null);
      setFaceEnrolled(res.faceEnrolled);
      setStage("face");
    } catch (err) {
      if (err.status === 429) return lockFor(err.retryAfter || LOCK_SECONDS);
      if (err.status !== 401) return showError(err.message, err.status === 404);
      const fails = (readMap(PASSWORD_KEY)[addr]?.fails || 0) + 1;
      writeEntry(PASSWORD_KEY, addr, { fails });
      const left = MAX_PASSWORD_FAILS - fails;
      showError(left > 0
        ? `Incorrect password. ${left} ${left === 1 ? "attempt" : "attempts"} left before sign-in is paused for ${LOCK_SECONDS} seconds.`
        : "Incorrect password.");
    } finally {
      setLoading(false);
    }
  }

  function finish(user) {
    login(user.id, remember);
    notify(`Welcome back, ${firstName(user.name)}`);
  }

  /* The face step failed in a way that needs the password again (timed out, spent or blocked). */
  function backToPassword(err) {
    setStage("password");
    setPassword("");
    if (err.status === 429) lockFor(err.retryAfter || LOCK_SECONDS * 5);
    else showError(err.message);
  }

  async function enrolAndFinish({ template }) {
    try {
      finish(await api.completeFace({ template, remember }));
    } catch (err) {
      if (api.needsPassword(err)) backToPassword(err);
      else notify(err.message, "bad");
    }
  }

  /* ---- Step 2: face verification (or enrolment when the account has no face yet) ---- */
  if (stage === "face") {
    return (
      <>
        <button className="btn btn--text auth__back" onClick={() => { setStage("password"); setPassword(""); showError(""); }}><Icon name="arrowLeft" size={15} /> Back</button>
        <p className="kicker">Step 2 of 2 · Face verification</p>
        <h1>{faceEnrolled ? "Verify your face" : "Set up face verification"}</h1>
        <p className="auth__lead">
          {faceEnrolled
            ? <>Password accepted for <b>{addr}</b>. Look at the camera and blink to finish signing in.</>
            : <>Password accepted for <b>{addr}</b>. This account has no face yet. Face verification is required to protect your account, so set it up now.</>}
        </p>
        {faceEnrolled ? (
          <FaceCapture
            mode="verify"
            verify={(template, liveness) => api.completeFace({ template, liveness, remember })}
            onComplete={finish}
            onFail={(err) => { if (api.needsPassword(err)) backToPassword(err); }}
          />
        ) : (
          <FaceCapture mode="enroll" onComplete={enrolAndFinish} />
        )}
      </>
    );
  }

  /* ---- Step 1: role + email + password ---- */
  const secondsLeft = Math.ceil((lockedUntil - now) / 1000);
  return (
    <>
      <p className="kicker">Step 1 of 2 · Password</p>
      <h1>Welcome back</h1>
      <p className="auth__lead">Choose your role and enter your email and password. Next, verify your face.</p>

      <div className="role-tabs" role="tablist">
        {Object.entries(ROLE_COPY).map(([key, r]) => (
          <button key={key} role="tab" aria-selected={role === key} className={role === key ? "is-active" : ""} onClick={() => { setRole(key); showError(""); }}>
            <Icon name={r.icon} size={16} /> {r.label}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={checkPassword} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="input">
            <Icon name="mail" size={17} />
            <input id="email" type="email" autoComplete="email" placeholder={role === "employer" ? "hr@company.com" : "you@uog.edu.pk"} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <div className="field__row">
            <label htmlFor="password">Password</label>
            <button type="button" className="link" onClick={() => showError("Password reset emails are sent by the backend — not available in the prototype.")}>Forgot password?</button>
          </div>
          <div className="input">
            <Icon name="lock" size={17} />
            <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="input__action" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
              <Icon name={show ? "eyeOff" : "eye"} size={17} />
            </button>
          </div>
        </div>
        {locked && <p className="form__error" role="alert"><Icon name="lock" size={15} /> Too many failed attempts. Sign-in is paused — try again in {secondsLeft >= 90 ? `${Math.ceil(secondsLeft / 60)} min` : `${secondsLeft}s`}.</p>}
        {error && !locked && (
          <p className="form__error" role="alert">
            <Icon name="alert" size={15} /> {error}
            {noAccount && role !== "admin" && <> <button type="button" className="link" onClick={() => navigate("/signup")}>Create an account</button></>}
          </p>
        )}
        <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={loading || locked}>
          {loading ? <span className="spinner" /> : <>Continue to face verification <Icon name="arrowRight" size={16} /></>}
        </button>
        <label className="check auth__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>
          Keep me signed in on this device
        </label>
      </form>

      {role !== "admin" ? (
        <p className="auth__switch">New to Intervo? <button className="link" onClick={() => navigate("/signup")}>Create an account</button></p>
      ) : (
        <p className="auth__switch">Admin accounts are created by the system owner.</p>
      )}

      <div className="demo-box">
        <span className="demo-box__title"><Icon name="sparkle" size={14} /> Demo account</span>
        {DEMO_ACCOUNTS.filter((a) => a.role === role).map((a) => (
          <button key={a.email} className="demo-box__row" onClick={() => { setEmail(a.email); setPassword(a.password); showError(""); }}>
            <span><b>{a.email}</b> · {a.password}</span>
            <span className="link">Fill in</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------- Sign up: role → details → face (required, no skip) ---------------- */

function SignUp({ role, setRole }) {
  const { db, login, notify } = useStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "", confirm: "", terms: false, dataConsent: false });
  const [error, setError] = useState("");
  const [faceError, setFaceError] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const strength = passwordStrength(form.password);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  /* Validates the details, then creates the account (without a face). The face step must follow. */
  async function createAccount(e) {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (form.name.trim().length < 3) return setError("Enter your full name.");
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
    // With backend auth the server is the judge of duplicates (409 from signup).
    if (!api.uses("auth") && db.users.some((u) => u.email === email)) return setError("An account with this email already exists.");
    if (role === "employer" && form.company.trim().length < 2) return setError("Enter your company name.");
    if (!passwordMeetsRules(form.password)) return setError("Use at least 8 characters with upper and lower case letters and a number.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (!form.terms) return setError("Please accept the terms to continue.");
    if (role === "candidate" && !form.dataConsent) return setError("Consent is needed to process your CV and interview answers.");
    setError("");
    setLoading(true);
    try {
      await api.startSignup({ role, name: form.name, email, company: form.company, password: form.password, dataConsent: form.dataConsent });
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function enrolFace({ template }) {
    setFaceError("");
    try {
      const user = await api.completeFace({ template, remember: true });
      login(user.id, true);
      notify("Account created with face verification — welcome to Intervo");
    } catch (err) {
      if (api.needsPassword(err)) {
        notify("Your account was created. Sign in with your password to finish setting up your face.", "bad");
        navigate("/login");
      } else {
        setFaceError(err.message);
      }
    }
  }

  return (
    <>
      <div className="stepper" aria-label="Sign-up progress">
        {["Role", "Details", "Face"].map((s, i) => (
          <div key={s} className={`stepper__item ${step === i + 1 ? "is-current" : ""} ${step > i + 1 ? "is-done" : ""}`}>
            <span>{step > i + 1 ? <Icon name="check" size={12} strokeWidth={2.8} /> : i + 1}</span> {s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          <h1>Create your account</h1>
          <p className="auth__lead">Choose how you'll use Intervo.</p>
          <div className="role-cards">
            {["candidate", "employer"].map((key) => (
              <button key={key} className={`role-card ${role === key ? "is-active" : ""}`} onClick={() => setRole(key)}>
                <span className="role-card__icon"><Icon name={ROLE_COPY[key].icon} size={20} /></span>
                <strong>I'm {key === "candidate" ? "a candidate" : "an employer"}</strong>
                <small>{ROLE_COPY[key].text}</small>
                <span className="role-card__radio" />
              </button>
            ))}
          </div>
          <button className="btn btn--primary btn--block btn--lg" onClick={() => setStep(2)}>Continue <Icon name="arrowRight" size={16} /></button>
        </>
      )}

      {step === 2 && (
        <>
          <button className="btn btn--text auth__back" onClick={() => setStep(1)}><Icon name="arrowLeft" size={15} /> Back</button>
          <h1>{role === "employer" ? "Employer details" : "Your details"}</h1>
          <p className="auth__lead">{role === "employer" ? "Tell us who you're hiring for." : "We'll use these to set up your candidate workspace."} Next, you'll set up face verification.</p>
          <form className="form" onSubmit={createAccount} noValidate>
            <div className={role === "employer" ? "form__grid" : "form"}>
              <div className="field">
                <label htmlFor="su-name">Full name</label>
                <div className="input"><Icon name="user" size={17} /><input id="su-name" autoComplete="name" placeholder="Syeda Huneen Raza" value={form.name} onChange={set("name")} /></div>
              </div>
              {role === "employer" && (
                <div className="field">
                  <label htmlFor="su-company">Company</label>
                  <div className="input"><Icon name="building" size={17} /><input id="su-company" autoComplete="organization" placeholder="Company name" value={form.company} onChange={set("company")} /></div>
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="su-email">{role === "employer" ? "Work email" : "Email"}</label>
              <div className="input"><Icon name="mail" size={17} /><input id="su-email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} /></div>
            </div>
            <div className="form__grid">
              <div className="field">
                <label htmlFor="su-pw">Password</label>
                <div className="input">
                  <Icon name="lock" size={17} />
                  <input id="su-pw" type={show ? "text" : "password"} autoComplete="new-password" placeholder="8+ characters" value={form.password} onChange={set("password")} />
                  <button type="button" className="input__action" onClick={() => setShow((v) => !v)} aria-label="Toggle password"><Icon name={show ? "eyeOff" : "eye"} size={17} /></button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="su-pw2">Confirm password</label>
                <div className="input"><Icon name="lock" size={17} /><input id="su-pw2" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Repeat password" value={form.confirm} onChange={set("confirm")} /></div>
              </div>
            </div>
            {form.password && (
              <div className={`strength strength--${strength.score}`}>
                <div className="strength__bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= strength.score ? "on" : ""} />)}</div>
                <span>{strength.label}</span>
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={form.terms} onChange={set("terms")} />
              <span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>
              I agree to the terms of use and privacy policy
            </label>
            {role === "candidate" && (
              <label className="check">
                <input type="checkbox" checked={form.dataConsent} onChange={set("dataConsent")} />
                <span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>
                I consent to Intervo processing my CV and interview answers to give feedback
              </label>
            )}
            {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : <>Continue to face verification <Icon name="arrowRight" size={16} /></>}
            </button>
          </form>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Set up face verification</h1>
          <p className="auth__lead">Face verification is required to protect your account. You'll verify your face with a blink every time you sign in. We store landmark measurements, not your photo.</p>
          {faceError && <p className="form__error" role="alert"><Icon name="alert" size={15} /> {faceError}</p>}
          <FaceCapture mode="enroll" onComplete={enrolFace} />
        </>
      )}

      <p className="auth__switch">Already have an account? <button className="link" onClick={() => navigate("/login")}>Sign in</button></p>
    </>
  );
}

/* ---------------- Right-hand showcase, mirrors the real dashboard ---------------- */

const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const SHOWCASE = {
  candidate: {
    pill: "Adaptive interview coaching",
    title: ["Practise smarter.", "Improve with every session."],
    text: "Intervo scores every answer by skill, remembers where you struggle, and builds your next interview around it.",
    card: "Session report · Frontend Developer",
    chip: today,
    ring: { value: 72, label: "Overall" },
    delta: { icon: "trend", text: "+9 vs last session" },
    rows: [
      { name: "React", value: 81 },
      { name: "Communication", value: 68 },
      { name: "Testing", value: 48, focus: true },
    ],
    foot: "Next session prioritises Testing — below 60% in 2 sessions.",
    features: [["file", "CV & job match"], ["video", "Text · Voice · Video"], ["target", "Weakness tracking"]],
  },
  employer: {
    pill: "For hiring teams",
    title: ["Shortlist on skills,", "not guesswork."],
    text: "See how well opted-in candidates' CVs match the skills your role needs — matched, partial and missing, all explained.",
    card: "CV skill match · Junior Frontend Developer",
    chip: today,
    ring: { value: 83, label: "CV match" },
    delta: { icon: "checkCircle", text: "Meets criteria" },
    rows: [
      { name: "Matched skills", value: 83 },
      { name: "Partial skills", value: 10 },
      { name: "Missing skills", value: 7 },
    ],
    foot: "Final hiring decisions always stay with your team.",
    features: [["sliders", "Weighted job skills"], ["chart", "Explainable CV match"], ["shield", "Consent-based sharing"]],
  },
  admin: {
    pill: "Platform configuration",
    title: ["Add new roles", "without changing code."],
    text: "Domains, skills, question templates and scoring rules are all managed as data.",
    card: "Evaluation criteria",
    chip: "Active",
    ring: { value: 100, display: 6, label: "criteria" },
    rows: [
      { name: "Technical accuracy", value: 66, display: "×2", tone: "brand" },
      { name: "Relevance", value: 66, display: "×2", tone: "brand" },
      { name: "STAR structure", value: 66, display: "×2", tone: "brand" },
    ],
    foot: "Changes apply to the next interview instantly.",
    features: [["layers", "Domains & roles"], ["book", "Question templates"], ["settings", "Scoring rules"]],
  },
};

/** Session-report / candidate-fit card from the showcase; the landing page reuses it. */
export function ProductPreview({ s, className = "" }) {
  return (
    <div className={`preview ${className}`}>
      <div className="preview__head">
        <strong>{s.card}</strong>
        <span className="preview__chip">{s.chip}</span>
      </div>
      <div className="preview__body">
        <div className="preview__score">
          <PreviewRing {...s.ring} />
          {s.delta && <span className="preview__delta"><Icon name={s.delta.icon} size={13} /> {s.delta.text}</span>}
        </div>
        <div className="preview__rows">
          {s.rows.map((row) => (
            <div className="preview__row" key={row.name}>
              <span className="preview__name">{row.name}{row.focus && <em className="preview__tag">Needs focus</em>}</span>
              <Meter value={row.value} tone={row.tone} />
              <b>{row.display ?? row.value}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="preview__foot"><Icon name="target" size={15} /> <span>{s.foot}</span></div>
    </div>
  );
}

function PreviewRing({ value, display = value, label, size = 96, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="ring__value" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} />
      </svg>
      <div className="ring__label">
        <strong>{display}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Showcase({ role }) {
  const s = SHOWCASE[role] || SHOWCASE.candidate;
  return (
    <aside className="auth__showcase" aria-hidden="true">
      <div className="showcase__grid" />
      <div className="showcase__content" key={role}>
        <span className="showcase__pill"><i /> {s.pill}</span>
        <h2>{s.title[0]}<br />{s.title[1]}</h2>
        <p className="showcase__text">{s.text}</p>

        <ProductPreview s={s} />

        <ul className="showcase__features">
          {s.features.map(([icon, label]) => (
            <li key={label}><span><Icon name={icon} size={16} /></span>{label}</li>
          ))}
        </ul>
      </div>
      <p className="showcase__foot">
        <Icon name="shield" size={14} /> Password + Face verification <i /> Consent-first data sharing
      </p>
    </aside>
  );
}
