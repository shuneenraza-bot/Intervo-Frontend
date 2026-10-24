import { useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { extractSkills, matchSkills } from "./lib";
import { ACCEPTED, CVError, MAX_FILE_MB, educationLevel, extractText, monthsBetween, parseCV, parseJD } from "./cvParser";
import { Card, Empty, Modal, Note, PageHeader, ScoreRing, Segmented, Weight } from "./ui";

const STEPS = [
  { key: "read", label: "Reading file" },
  { key: "extract", label: "Extracting text" },
  { key: "parse", label: "Finding sections and skills" },
];

const SECTIONS = {
  education: {
    title: "Education", icon: "award", empty: "No education found.",
    fields: [
      { key: "degree", label: "Degree", placeholder: "BS Software Engineering" },
      { key: "institution", label: "Institution", placeholder: "University of Gujrat" },
      { key: "dates", label: "Dates", placeholder: "2022 – 2026" },
      { key: "score", label: "CGPA / marks", placeholder: "CGPA 3.4 / 4.0" },
    ],
    view: (e) => ({ title: e.degree || "Untitled degree", sub: [e.institution, e.score].filter(Boolean).join(" · "), meta: e.dates }),
  },
  experience: {
    title: "Experience", icon: "briefcase", empty: "No work experience found — that's fine for fresh graduates.",
    fields: [
      { key: "title", label: "Job title", placeholder: "Frontend Developer Intern" },
      { key: "company", label: "Company", placeholder: "Company, City" },
      { key: "dates", label: "Dates", placeholder: "Jun 2025 – Aug 2025" },
      { key: "details", label: "What you did", type: "textarea", placeholder: "One point per line" },
    ],
    view: (e) => ({ title: e.title || "Untitled role", sub: e.company, meta: e.dates, details: e.details }),
  },
  projects: {
    title: "Projects", icon: "layers", empty: "No projects found.",
    fields: [
      { key: "name", label: "Project name", placeholder: "Intervo – AI interview coaching" },
      { key: "details", label: "Description", type: "textarea", placeholder: "What it does, your role, technologies" },
    ],
    view: (e) => ({ title: e.name || "Untitled project", details: e.details, tags: e.tech }),
  },
};

export default function CVPage({ user, db, profile, go }) {
  const { update, notify } = useStore();
  const { skills: skillConfig, roles, domains } = db.config;

  // Older profiles only stored a skills list — wrap them so the editor still works.
  const initialCV = profile.cv || (profile.skills?.length ? { skills: profile.skills, otherSkills: [], education: [], experience: [], projects: [], contact: {}, fileName: profile.fileName || "", manual: true } : null);
  const [cv, setCv] = useState(initialCV);
  const [status, setStatus] = useState({ state: "idle" }); // idle | working | error
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileRef = useRef(null);

  const [domainId, setDomainId] = useState(roles.find((r) => r.id === profile.roleId)?.domainId || domains[0].id);
  const [roleId, setRoleId] = useState(profile.roleId || roles[0].id);
  const [jd, setJd] = useState(profile.jd || "");
  const [jdFile, setJdFile] = useState("");
  const [error, setError] = useState("");

  const role = roles.find((r) => r.id === roleId) || roles[0];
  const domainRoles = roles.filter((r) => r.domainId === domainId);
  const jdParsed = useMemo(() => (jd.trim().length > 30 ? parseJD(jd, skillConfig, role.skills) : null), [jd, skillConfig, role]);
  const result = profile.result;

  /* ---------- Persist ---------- */
  function saveCV(next, message) {
    setCv(next);
    update((d) => {
      d.profiles[user.id] = { ...d.profiles[user.id], cv: next, skills: next.skills, fileName: next.fileName };
    });
    if (message) notify(message);
  }

  /* ---------- Upload & parse ---------- */
  async function handleFile(file) {
    if (!file) return;
    setError("");
    setStatus({ state: "working", step: "read", fileName: file.name });
    try {
      const text = await extractText(file, (step) => setStatus((s) => ({ ...s, step })));
      setStatus((s) => ({ ...s, step: "parse" }));
      await new Promise((r) => setTimeout(r, 350)); // let the step animation land
      const parsed = parseCV(text, skillConfig);
      saveCV(
        { ...parsed, fileName: file.name, fileType: file.name.split(".").pop().toUpperCase(), fileSize: file.size, parsedAt: Date.now(), text: text.slice(0, 20000) },
        `CV analysed — ${parsed.skills.length} skills found`
      );
      setStatus({ state: "idle" });
    } catch (e) {
      setStatus({ state: "error", message: e instanceof CVError ? e.message : "Something went wrong while reading this file. Try another format." });
      if (!(e instanceof CVError)) console.error(e);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function parsePasted() {
    if (pasted.trim().length < 30) return setStatus({ state: "error", message: "Paste a bit more of your CV — at least a few lines." });
    const parsed = parseCV(pasted, skillConfig);
    saveCV({ ...parsed, fileName: "", fileType: "TEXT", parsedAt: Date.now(), text: pasted.slice(0, 20000) }, `CV analysed — ${parsed.skills.length} skills found`);
    setPasteMode(false);
    setStatus({ state: "idle" });
  }

  async function handleJdFile(file) {
    if (!file) return;
    try {
      const text = await extractText(file);
      setJd(text);
      setJdFile(file.name);
    } catch (e) {
      setError(e instanceof CVError ? e.message : "Couldn't read that job description file.");
    }
  }

  /* ---------- Analyse ---------- */
  function analyse() {
    if (!cv?.skills?.length) return setError("Upload your CV (or add skills) before running the analysis.");
    const required = jdParsed?.skills.length ? jdParsed.skills : role.skills;
    const match = matchSkills(cv.skills, required, skillConfig);
    const checks = [];
    if (jdParsed?.minYears) {
      checks.push({
        label: `Experience: ${jdParsed.minYears}+ year${jdParsed.minYears > 1 ? "s" : ""} asked`,
        ok: (cv.experienceYears || 0) >= jdParsed.minYears,
        detail: cv.experienceYears ? `Your CV shows about ${cv.experienceYears} year${cv.experienceYears === 1 ? "" : "s"}` : jdParsed.fresherFriendly ? "No experience listed, but the role is open to fresh graduates" : "No dated experience found in your CV",
        soft: jdParsed.fresherFriendly,
      });
    }
    if (jdParsed?.education) {
      const have = Math.max(0, ...(cv.education || []).map((e) => educationLevel(e.degree)));
      checks.push({ label: `Education: ${jdParsed.education}`, ok: have >= educationLevel(jdParsed.education), detail: cv.education?.[0]?.degree ? `Your highest: ${[...cv.education].sort((a, b) => educationLevel(b.degree) - educationLevel(a.degree))[0].degree}` : "No degree found in your CV" });
    }
    setError("");
    update((d) => {
      d.profiles[user.id] = {
        ...d.profiles[user.id], roleId, jd,
        result: { ...match, checks, roleTitle: jdParsed?.title && jdParsed.skills.length ? jdParsed.title : role.title, source: jdParsed?.skills.length ? (jdFile ? `Job description · ${jdFile}` : "Pasted job description") : "Role template", date: Date.now() },
      };
    });
    notify("Skill-gap analysis saved");
  }

  const working = status.state === "working";

  return (
    <>
      <PageHeader kicker="CV · Job description analysis" title="CV & skill gap" subtitle="Upload your CV and we'll pull out your skills, education, experience and projects. Check them, pick a target role, and see exactly where the gaps are." />

      <div className="grid grid--split">
        <div className="stack">
          {/* ---------------- 01 · CV ---------------- */}
          <Card
            title="Your CV"
            subtitle={cv && !cv.manual ? `${cv.fileName || "Pasted text"} · analysed ${new Date(cv.parsedAt).toLocaleDateString()}` : "PDF, DOCX or TXT · read securely in your browser"}
            action={<span className="step-num">01</span>}
          >
            {working ? (
              <div className="parsing">
                <div className="parsing__file"><Icon name="file" size={18} /> {status.fileName}</div>
                <ol className="parsing__steps">
                  {STEPS.map((s, i) => {
                    const cur = STEPS.findIndex((x) => x.key === status.step);
                    const state = i < cur ? "done" : i === cur ? "active" : "";
                    return (
                      <li key={s.key} className={`is-${state || "todo"}`}>
                        <span className="parsing__dot">{state === "done" ? <Icon name="check" size={12} strokeWidth={2.8} /> : state === "active" ? <span className="spinner spinner--brand" /> : i + 1}</span>
                        {s.label}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : pasteMode ? (
              <div className="form">
                <textarea rows={9} data-lenis-prevent placeholder="Paste the full text of your CV here…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={parsePasted}>Analyse text <Icon name="arrowRight" size={15} /></button>
                  <button className="btn btn--ghost" onClick={() => setPasteMode(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <label
                  className={`dropzone ${dragging ? "is-dragging" : ""} ${cv && !cv.manual ? "dropzone--compact has-file" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
                >
                  <input ref={fileRef} type="file" accept={ACCEPTED} onChange={(e) => handleFile(e.target.files?.[0])} />
                  <span className="dropzone__icon"><Icon name={cv && !cv.manual ? "refresh" : "upload"} size={22} /></span>
                  {cv && !cv.manual ? (
                    <><strong>Replace CV</strong><small>Drop a new file or click to browse</small></>
                  ) : (
                    <><strong>Drop your CV here or <u>browse</u></strong><small>PDF, DOCX or TXT · up to {MAX_FILE_MB} MB</small></>
                  )}
                </label>
                {!cv && <button className="btn btn--text paste-link" onClick={() => { setPasteMode(true); setStatus({ state: "idle" }); }}>No file? Paste your CV text instead</button>}
              </>
            )}

            {status.state === "error" && (
              <div className="upload-error">
                <Icon name="alert" size={18} />
                <div><strong>We couldn't read that file</strong><p>{status.message}</p></div>
                <button className="icon-btn icon-btn--sm" onClick={() => setStatus({ state: "idle" })} aria-label="Dismiss"><Icon name="x" size={14} /></button>
              </div>
            )}

            {cv && !working && <ParsedCV cv={cv} skillConfig={skillConfig} onChange={(next, msg) => saveCV(next, msg)} onShowText={() => setShowText(true)} onPaste={() => setPasteMode(true)} />}
          </Card>

          {/* ---------------- 02 · Target ---------------- */}
          <Card title="Target role" subtitle="Compare against a role template or a real job description" action={<span className="step-num">02</span>}>
            <div className="form">
              <div className="field">
                <label>Domain</label>
                <Segmented options={domains.map((d) => ({ value: d.id, label: d.name }))} value={domainId} onChange={(id) => { setDomainId(id); const first = roles.find((r) => r.domainId === id); if (first) setRoleId(first.id); }} />
              </div>
              <div className="field">
                <label>Role</label>
                {domainRoles.length ? (
                  <Segmented wrap options={domainRoles.map((r) => ({ value: r.id, label: r.title, sub: `${r.skills.length} required skills` }))} value={roleId} onChange={setRoleId} />
                ) : <p className="field__hint">No roles configured for this domain yet.</p>}
              </div>

              <div className="field">
                <div className="field__row">
                  <label htmlFor="jd">Job description <span className="optional">optional · overrides the template</span></label>
                  <label className="btn btn--text jd-upload">
                    <Icon name="upload" size={14} /> Upload JD
                    <input type="file" accept={ACCEPTED} hidden onChange={(e) => handleJdFile(e.target.files?.[0])} />
                  </label>
                </div>
                <textarea id="jd" rows={5} data-lenis-prevent placeholder="Paste a job posting here, e.g. from LinkedIn or Rozee.pk…" value={jd} onChange={(e) => { setJd(e.target.value); setJdFile(""); }} />
                {jdParsed && (
                  <div className="jd-summary">
                    <div className="jd-summary__head">
                      <span><Icon name="scan" size={14} /> Requirements found</span>
                      {jd && <button className="btn btn--text" onClick={() => { setJd(""); setJdFile(""); }}>Clear</button>}
                    </div>
                    {jdParsed.skills.length ? (
                      <div className="chips">{jdParsed.skills.map((s) => <span className="chip" key={s.name}>{s.name}<Weight w={s.weight} /></span>)}</div>
                    ) : <p className="field__hint">No known skills found — the role template will be used.</p>}
                    <div className="jd-summary__meta">
                      {jdParsed.minYears > 0 && <span><Icon name="clock" size={13} /> {jdParsed.minYears}+ years</span>}
                      {jdParsed.education && <span><Icon name="award" size={13} /> {jdParsed.education.length > 48 ? `${jdParsed.education.slice(0, 48)}…` : jdParsed.education}</span>}
                      {jdParsed.fresherFriendly && <span><Icon name="checkCircle" size={13} /> Open to fresh graduates</span>}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
              <button className="btn btn--primary btn--lg" onClick={analyse} disabled={working}>Analyse skill gap <Icon name="arrowRight" size={16} /></button>
            </div>
          </Card>
        </div>

        {/* ---------------- 03 · Result ---------------- */}
        <Card title="Skill alignment" subtitle={result ? `${result.roleTitle} · ${result.source}` : "Your result appears here"} className="card--sticky" action={<span className="step-num">03</span>}>
          {result ? (
            <div className="result">
              <div className="result__score">
                <ScoreRing value={result.percentage} size={118} stroke={10} label="weighted" />
                <div>
                  <strong>{result.matched.length} matched · {result.partial?.length || 0} partial · {result.missing.length} missing</strong>
                  <p>Skills are weighted by importance (●●● = core). A related skill counts as a partial match at half weight.</p>
                </div>
              </div>
              {result.checks?.length > 0 && (
                <ul className="req-checks">
                  {result.checks.map((c) => (
                    <li key={c.label} className={c.ok ? "is-ok" : c.soft ? "is-soft" : "is-miss"}>
                      <Icon name={c.ok ? "checkCircle" : "alert"} size={16} />
                      <div><strong>{c.label}</strong><span>{c.detail}</span></div>
                    </li>
                  ))}
                </ul>
              )}
              <SkillGroup tone="good" title="Matched" items={result.matched} icon="check" empty="No direct matches yet." />
              <SkillGroup tone="fair" title="Partially matched" items={result.partial || []} icon="refresh" empty="None." detail={(s) => `via ${s.via}`} />
              <SkillGroup tone="low" title="Missing" items={result.missing} icon="plus" empty="Nothing missing — strong fit." />
              {(result.missing.length > 0 || result.partial?.length > 0) && (
                <button className="btn btn--primary btn--block" onClick={() => go("interview")}>Practise these gaps <Icon name="arrowRight" size={15} /></button>
              )}
            </div>
          ) : (
            <Empty icon="target" title="No analysis yet" text="Upload your CV, choose a role or paste a job description, then run the analysis." />
          )}
          <Note>Parsing runs in your browser with fixed rules, so the same CV always gives the same result. AI-assisted extraction (Gemini) will run on the FastAPI server once connected.</Note>
        </Card>
      </div>

      <Modal open={showText} onClose={() => setShowText(false)} wide title="Extracted text" subtitle="Exactly what the analyzer read from your file">
        <pre className="raw-text">{cv?.text || "No text stored."}</pre>
      </Modal>
    </>
  );
}

/* =========================================================
   Parsed CV — review & edit
   ========================================================= */

function ParsedCV({ cv, skillConfig, onChange, onShowText, onPaste }) {
  const [adding, setAdding] = useState("");
  const set = (patch, msg) => onChange({ ...cv, ...patch }, msg);
  const available = skillConfig.filter((s) => !cv.skills.includes(s.name));
  const c = cv.contact || {};

  return (
    <div className="parsed">
      {!cv.manual && (
        <div className="parsed__bar">
          <div className="parsed__badges">
            {cv.fileType && <span className="badge badge--brand">{cv.fileType}</span>}
            {(cv.sectionsFound || []).map((s) => <span key={s} className="badge badge--muted">{s}</span>)}
          </div>
          <div className="btn-row">
            {cv.text && <button className="btn btn--text" onClick={onShowText}><Icon name="eye" size={14} /> View text</button>}
          </div>
        </div>
      )}
      {cv.manual && (
        <div className="banner banner--soft">
          <Icon name="info" size={16} />
          <span>Your profile has skills but no parsed CV yet. Upload a file above to extract education, experience and projects.</span>
          <button className="btn btn--text" onClick={onPaste}>Paste text</button>
        </div>
      )}

      {cv.warnings?.map((w) => <p key={w} className="parsed__warn"><Icon name="alert" size={14} /> {w}</p>)}

      {(c.name || c.email || c.phone) && (
        <div className="contact-card">
          <span className="avatar">{(c.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div className="contact-card__main">
            <strong>{c.name || "Name not found"}</strong>
            <div className="contact-card__items">
              {c.email && <span><Icon name="mail" size={13} /> {c.email}</span>}
              {c.phone && <span><Icon name="message" size={13} /> {c.phone}</span>}
              {c.location && <span><Icon name="pin" size={13} /> {c.location}</span>}
              {c.linkedin && <span><Icon name="globe" size={13} /> {c.linkedin}</span>}
              {c.github && <span><Icon name="globe" size={13} /> {c.github}</span>}
            </div>
          </div>
          {cv.experienceYears > 0 && <span className="contact-card__years"><b>{cv.experienceYears}</b> yrs exp.</span>}
        </div>
      )}

      {/* Skills */}
      <section className="parsed__section">
        <h3><Icon name="tag" size={15} /> Skills <span className="result__count">{cv.skills.length}</span></h3>
        <div className="chips">
          {cv.skills.map((s) => (
            <span className="chip chip--brand chip--removable" key={s}>
              {s}
              <button onClick={() => set({ skills: cv.skills.filter((x) => x !== s) }, `${s} removed`)} aria-label={`Remove ${s}`}><Icon name="x" size={11} strokeWidth={2.4} /></button>
            </span>
          ))}
          <span className="chip-add">
            <select className="select select--chip" value={adding} onChange={(e) => { const v = e.target.value; if (v) { set({ skills: [...cv.skills, v] }, `${v} added`); setAdding(""); } }} aria-label="Add a skill">
              <option value="">+ Add skill</option>
              {available.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </span>
        </div>
        {cv.otherSkills?.length > 0 && (
          <div className="other-skills">
            <span className="field__hint">Also in your CV but not in the skill library (not used for matching):</span>
            <div className="chips">{cv.otherSkills.map((s) => <span className="chip chip--muted" key={s}>{s}</span>)}</div>
          </div>
        )}
      </section>

      {Object.entries(SECTIONS).map(([key, def]) => (
        <EntryList
          key={key}
          def={def}
          items={cv[key] || []}
          onChange={(items, msg) => {
            const patch = { [key]: items };
            if (key === "projects") patch.projects = items.map((p) => ({ ...p, tech: extractSkills(`${p.name || ""} ${p.details || ""}`, skillConfig) }));
            if (key === "experience") {
              patch.experience = items.map((e) => ({ ...e, months: monthsBetween(e.dates || "") }));
              const months = patch.experience.reduce((sum, e) => sum + e.months, 0);
              patch.experienceYears = Math.round((months / 12) * 2) / 2;
            }
            set(patch, msg);
          }}
        />
      ))}

      {cv.certifications?.length > 0 && (
        <section className="parsed__section">
          <h3><Icon name="star" size={15} /> Certifications <span className="result__count">{cv.certifications.length}</span></h3>
          <ul className="cert-list">{cv.certifications.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

function EntryList({ def, items, onChange }) {
  const [editing, setEditing] = useState(null); // index | "new"
  const [draft, setDraft] = useState({});

  const start = (i) => { setEditing(i); setDraft(i === "new" ? {} : { ...items[i] }); };
  const save = () => {
    const filled = def.fields.some((f) => (draft[f.key] || "").trim());
    if (!filled) return setEditing(null);
    const next = editing === "new" ? [...items, draft] : items.map((x, i) => (i === editing ? draft : x));
    onChange(next, `${def.title} updated`);
    setEditing(null);
  };

  return (
    <section className="parsed__section">
      <h3>
        <Icon name={def.icon} size={15} /> {def.title} <span className="result__count">{items.length}</span>
        <button className="btn btn--text parsed__add" onClick={() => start("new")}><Icon name="plus" size={13} /> Add</button>
      </h3>
      {!items.length && editing !== "new" && <p className="field__hint">{def.empty}</p>}
      <div className="entries">
        {items.map((item, i) => {
          if (editing === i) return <EntryForm key={i} def={def} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} />;
          const v = def.view(item);
          return (
            <article className="entry" key={i}>
              <div className="entry__main">
                <div className="entry__top">
                  <strong>{v.title}</strong>
                  {v.meta && <span className="entry__meta">{v.meta}</span>}
                </div>
                {v.sub && <span className="entry__sub">{v.sub}</span>}
                {v.details && (
                  <ul className="entry__details">{v.details.split("\n").filter(Boolean).slice(0, 4).map((d, j) => <li key={j}>{d}</li>)}</ul>
                )}
                {v.tags?.length > 0 && <div className="chips">{v.tags.map((t) => <span className="chip chip--sm" key={t}>{t}</span>)}</div>}
              </div>
              <div className="entry__actions">
                <button className="icon-btn icon-btn--sm" onClick={() => start(i)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                <button className="icon-btn icon-btn--sm" onClick={() => onChange(items.filter((_, j) => j !== i), `${def.title} entry removed`)} aria-label="Delete"><Icon name="trash" size={14} /></button>
              </div>
            </article>
          );
        })}
        {editing === "new" && <EntryForm def={def} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} />}
      </div>
    </section>
  );
}

function EntryForm({ def, draft, setDraft, onSave, onCancel }) {
  return (
    <div className="entry entry--editing">
      <div className="entry-form">
        {def.fields.map((f) => (
          <div className={`field ${f.type === "textarea" ? "field--wide" : ""}`} key={f.key}>
            <label>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea rows={3} data-lenis-prevent value={draft[f.key] || ""} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            ) : (
              <input className="input-plain" value={draft[f.key] || ""} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
      <div className="btn-row btn-row--end">
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary btn--sm" onClick={onSave}><Icon name="check" size={14} /> Save</button>
      </div>
    </div>
  );
}

function SkillGroup({ tone, title, items, icon, empty, detail }) {
  return (
    <div className="result__group">
      <h3><span className={`dot dot--${tone}`} /> {title} <span className="result__count">{items.length}</span></h3>
      <div className="chips">
        {items.length ? items.map((s) => (
          <span className={`chip chip--${tone}`} key={s.name} title={detail?.(s)}>
            <Icon name={icon} size={12} strokeWidth={2.4} /> {s.name}{detail && <small>{detail(s)}</small>}<Weight w={s.weight} />
          </span>
        )) : <span className="field__hint">{empty}</span>}
      </div>
    </div>
  );
}
