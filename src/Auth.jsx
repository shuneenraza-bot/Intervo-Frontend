import { useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { DEMO_ACCOUNTS } from "./data";
import { isLegacyTemplate, passwordStrength } from "./lib";
import * as api from "./api";
import { Brand, Meter, ThemeToggle } from "./ui";
import { FaceCapture } from "./Camera";

const ROLE_COPY = {
  candidate: { label: "Candidate", icon: "user", text: "Practise interviews, close skill gaps and track progress." },
  employer: { label: "Employer", icon: "building", text: "Post jobs and review explainable candidate suitability." },
  admin: { label: "Admin", icon: "settings", text: "Configure domains, roles, skills and evaluation criteria." },
};

export default function Auth() {
  const [view, setView] = useState("signin"); // signin | signup
  const [role, setRole] = useState("candidate");

  return (
    <div className="auth">
      <section className="auth__form-side">
        <div className="auth__top">
          <Brand />
          <div className="auth__top-actions">
            <ThemeToggle />
            <button className="btn btn--ghost btn--sm" onClick={() => setView(view === "signin" ? "signup" : "signin")}>
              {view === "signin" ? <>Create account <Icon name="userPlus" size={15} /></> : <>Sign in <Icon name="arrowRight" size={15} /></>}
            </button>
          </div>
        </div>
        <div className="auth__form-wrap" key={view}>
          {view === "signin" ? (
            <SignIn role={role} setRole={setRole} goSignup={() => setView("signup")} />
          ) : (
            <SignUp initialRole={role === "admin" ? "candidate" : role} goSignin={() => setView("signin")} />
          )}
        </div>
        <p className="auth__foot">Final Year Project · Department of Software Engineering, University of Gujrat</p>
      </section>
      <Showcase role={role} />
    </div>
  );
}

/* ---------------- Sign in: password → face verification ---------------- */

function SignIn({ role, setRole, goSignup }) {
  const { db, login, update, notify } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // user waiting for face step

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      setPending(await api.login({ email, password, role, remember }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function finish(method) {
    update((d) => {
      const u = d.users.find((x) => x.id === pending.id);
      u.lastLogin = { at: Date.now(), method };
    });
    login(pending.id, remember);
    notify(`Welcome back, ${pending.name.split(" ")[0]}`);
  }

  if (pending) {
    const enrolled = !!pending.face?.template;
    const upgrade = isLegacyTemplate(pending.face?.template);
    return (
      <>
        <button className="btn btn--text auth__back" onClick={() => setPending(null)}><Icon name="arrowLeft" size={15} /> Back</button>
        <p className="kicker">Step 2 of 2 · Face verification</p>
        <h1>{enrolled ? "Confirm it's you" : "Set up face login"}</h1>
        <p className="auth__lead">
          {upgrade
            ? "Your password is correct. Face login has been upgraded, so we need to re-enrol your face once."
            : enrolled
              ? "Your password is correct. A quick webcam check — including a blink — completes sign-in."
              : "This account has no face template yet. Enrol now to protect future sign-ins."}
        </p>
        <FaceCapture
          mode={enrolled ? "verify" : "enroll"}
          template={pending.face?.template}
          threshold={db.config.rules.faceThreshold}
          onComplete={(res) => {
            // A template comes back on first enrolment and when an older template is re-enrolled.
            if (res.template) {
              update((d) => {
                d.users.find((x) => x.id === pending.id).face = { template: res.template, enrolledAt: Date.now() };
              });
            }
            finish(!enrolled ? "password+enrolled" : res.template ? "password+reenrolled" : "password+face");
          }}
          onFallback={() => finish("password-fallback")}
          fallbackLabel={enrolled ? "Camera not working? Use password-only fallback" : "Skip for now"}
        />
      </>
    );
  }

  return (
    <>
      <p className="kicker">Step 1 of 2 · Account</p>
      <h1>Welcome back</h1>
      <p className="auth__lead">Sign in to continue. You'll confirm your identity with a quick face check next.</p>

      <div className="role-tabs" role="tablist">
        {Object.entries(ROLE_COPY).map(([key, r]) => (
          <button key={key} role="tab" aria-selected={role === key} className={role === key ? "is-active" : ""} onClick={() => { setRole(key); setError(""); }}>
            <Icon name={r.icon} size={16} /> {r.label}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={submit} noValidate>
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
            <button type="button" className="link" onClick={() => setError("Password reset emails are sent by the backend — not available in the prototype.")}>Forgot password?</button>
          </div>
          <div className="input">
            <Icon name="lock" size={17} />
            <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="input__action" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
              <Icon name={show ? "eyeOff" : "eye"} size={17} />
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>
          Keep me signed in on this device
        </label>
        {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
        <button className={`btn btn--primary btn--block btn--lg`} type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : <>Continue <Icon name="arrowRight" size={16} /></>}
        </button>
      </form>

      {role !== "admin" ? (
        <p className="auth__switch">New to Intervo? <button className="link" onClick={goSignup}>Create {role === "employer" ? "an employer" : "a candidate"} account</button></p>
      ) : (
        <p className="auth__switch">Admin accounts are created by the system owner.</p>
      )}

      <div className="demo-box">
        <span className="demo-box__title"><Icon name="sparkle" size={14} /> Demo account</span>
        {DEMO_ACCOUNTS.filter((a) => a.role === role).map((a) => (
          <button key={a.email} className="demo-box__row" onClick={() => { setEmail(a.email); setPassword(a.password); setError(""); }}>
            <span><b>{a.email}</b> · {a.password}</span>
            <span className="link">Fill in</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------- Sign up: role → details → face enrolment ---------------- */

function SignUp({ initialRole, goSignin }) {
  const { db, login, notify } = useStore();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "", confirm: "", terms: false, dataConsent: false });
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const strength = passwordStrength(form.password);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function validateDetails(e) {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (form.name.trim().length < 3) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (db.users.some((u) => u.email === email)) return setError("An account with this email already exists.");
    if (role === "employer" && form.company.trim().length < 2) return setError("Enter your company name.");
    if (strength.score < 3) return setError("Use at least 8 characters with upper and lower case letters and a number.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (!form.terms) return setError("Please accept the terms to continue.");
    if (role === "candidate" && !form.dataConsent) return setError("Consent is needed to process your CV and interview answers.");
    setError("");
    setStep(3);
  }

  async function createAccount(face) {
    try {
      const created = await api.signup({ role, name: form.name, email: form.email, company: form.company, password: form.password, dataConsent: form.dataConsent, face });
      login(created.id, true);
      notify("Account created — welcome to Intervo");
    } catch (err) {
      setError(err.message);
      setStep(2);
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
          <p className="auth__switch">Already registered? <button className="link" onClick={goSignin}>Sign in</button></p>
        </>
      )}

      {step === 2 && (
        <>
          <button className="btn btn--text auth__back" onClick={() => setStep(1)}><Icon name="arrowLeft" size={15} /> Back</button>
          <h1>{role === "employer" ? "Employer details" : "Your details"}</h1>
          <p className="auth__lead">{role === "employer" ? "Tell us who you're hiring for." : "We'll use these to set up your candidate workspace."}</p>
          <form className="form" onSubmit={validateDetails} noValidate>
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
            <button className="btn btn--primary btn--block btn--lg" type="submit">Continue to face setup <Icon name="arrowRight" size={16} /></button>
          </form>
        </>
      )}

      {step === 3 && (
        <>
          <button className="btn btn--text auth__back" onClick={() => setStep(2)}><Icon name="arrowLeft" size={15} /> Back</button>
          <h1>Enrol your face</h1>
          <p className="auth__lead">Face verification adds a second step to every sign-in. We store a numeric template, not your photo, and you can delete it any time.</p>
          <FaceCapture mode="enroll" onComplete={createAccount} onFallback={() => createAccount(null)} fallbackLabel="Skip — use password only for now" />
        </>
      )}
    </>
  );
}

/* ---------------- Right-hand showcase, mirrors the real dashboard ---------------- */

const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });

const SHOWCASE = {
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
    title: ["Shortlist with evidence,", "not guesswork."],
    text: "See how opted-in candidates perform on the skills your role needs — with every score explained.",
    card: "Candidate fit · Junior Frontend Developer",
    chip: today,
    ring: { value: 78, label: "Suitability" },
    delta: { icon: "checkCircle", text: "Meets criteria" },
    rows: [
      { name: "CV skill match", value: 83 },
      { name: "Interview evidence", value: 79 },
      { name: "Practice consistency", value: 62 },
    ],
    foot: "Final hiring decisions always stay with your team.",
    features: [["sliders", "Weighted job skills"], ["chart", "Explainable scores"], ["shield", "Consent-based sharing"]],
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

        <div className="preview">
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

        <ul className="showcase__features">
          {s.features.map(([icon, label]) => (
            <li key={label}><span><Icon name={icon} size={16} /></span>{label}</li>
          ))}
        </ul>
      </div>
      <p className="showcase__foot">
        <Icon name="shield" size={14} /> Face-verified sign-in <i /> Consent-first data sharing
      </p>
    </aside>
  );
}
