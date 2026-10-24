import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { formatDate, initials, scoreTone, suitability, timeAgo, uid } from "./lib";
import { Card, Empty, Meter, Modal, Note, PageHeader, ScoreRing, Segmented, Stat, Weight } from "./ui";

/** Ranks applicants for one job. Only consented, opted-in candidates expose evidence. */
function useApplicants(jobId) {
  const { db } = useStore();
  return useMemo(() => {
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) return { job: null, visible: [], hidden: 0 };
    const apps = db.applications.filter((a) => a.jobId === jobId);
    const visible = [];
    let hidden = 0;
    apps.forEach((app) => {
      const cand = db.users.find((u) => u.id === app.candidateId);
      const profile = db.profiles[app.candidateId];
      if (!cand) return;
      if (!app.consent || profile?.shareWithEmployers === false) return hidden++;
      const sessions = db.sessions.filter((s) => s.userId === cand.id);
      visible.push({ app, cand, profile, sessions, fit: suitability({ job, profile, sessions, config: db.config }) });
    });
    visible.sort((a, b) => b.fit.total - a.fit.total);
    return { job, visible, hidden };
  }, [db, jobId]);
}

export default function EmployerApp({ page, go, params }) {
  const { db, user } = useStore();
  const myJobs = db.jobs.filter((j) => j.employerId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const [selectedJob, setSelectedJob] = useState(params.jobId || myJobs[0]?.id || "");

  const openCandidates = (jobId) => go("candidates", { jobId });

  return (
    <>
      {page === "overview" && <EmployerOverview myJobs={myJobs} go={go} openCandidates={openCandidates} />}
      {page === "jobs" && <JobPostings myJobs={myJobs} openCandidates={openCandidates} />}
      {page === "candidates" && <Candidates myJobs={myJobs} jobId={selectedJob || myJobs[0]?.id} setJobId={setSelectedJob} go={go} />}
    </>
  );
}

/* ---------------- Overview ---------------- */

function EmployerOverview({ myJobs, go, openCandidates }) {
  const { db, user } = useStore();
  const apps = db.applications.filter((a) => myJobs.some((j) => j.id === a.jobId));
  const shared = apps.filter((a) => a.consent && db.profiles[a.candidateId]?.shareWithEmployers !== false);
  const top = shared
    .map((a) => {
      const job = myJobs.find((j) => j.id === a.jobId);
      const cand = db.users.find((u) => u.id === a.candidateId);
      if (!cand) return null;
      const fit = suitability({ job, profile: db.profiles[cand.id], sessions: db.sessions.filter((s) => s.userId === cand.id), config: db.config });
      return { a, job, cand, fit };
    })
    .filter(Boolean)
    .sort((x, y) => y.fit.total - x.fit.total);

  return (
    <>
      <PageHeader kicker={user.company} title="Hiring overview" subtitle="Your open roles and the candidates who chose to share their interview evidence with you."
        actions={<button className="btn btn--primary" onClick={() => go("jobs")}><Icon name="plus" size={16} /> Post a job</button>} />
      <section className="stats">
        <Stat label="Open jobs" value={myJobs.filter((j) => j.status === "open").length} hint={`${myJobs.length} total postings`} icon="briefcase" accent="blue" />
        <Stat label="Applicants" value={apps.length} hint="Across all postings" icon="users" accent="violet" />
        <Stat label="Sharing evidence" value={shared.length} hint={`${apps.length - shared.length} without consent`} icon="shield" accent="green" />
        <Stat label="Avg suitability" value={top.length ? `${Math.round(top.reduce((s, t) => s + t.fit.total, 0) / top.length)}%` : "—"} hint="Opted-in applicants" icon="target" accent="amber" />
      </section>

      <section className="grid grid--overview">
        <Card title="Your postings" subtitle="Applicants per job" action={<button className="btn btn--text" onClick={() => go("jobs")}>Manage <Icon name="arrowRight" size={14} /></button>}>
          {myJobs.length ? (
            <ul className="session-list">
              {myJobs.map((j) => {
                const n = db.applications.filter((a) => a.jobId === j.id).length;
                return (
                  <li key={j.id}>
                    <span className="session-list__icon"><Icon name="briefcase" size={16} /></span>
                    <div><strong>{j.title}</strong><span>{j.location} · {j.mode} · posted {timeAgo(j.createdAt)}</span></div>
                    <span className={`badge ${j.status === "open" ? "badge--good" : "badge--muted"}`}>{j.status}</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => openCandidates(j.id)}>{n} applicant{n === 1 ? "" : "s"}</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="briefcase" title="No postings yet" text="Create a job with required skills and success criteria to start receiving candidates." action="Post a job" onAction={() => go("jobs")} />
          )}
        </Card>
        <Card title="Top candidates" subtitle="Highest suitability, opted-in only">
          {top.length ? (
            <ul className="rank-list">
              {top.slice(0, 5).map(({ a, job, cand, fit }) => (
                <li key={a.id}>
                  <span className="avatar">{initials(cand.name)}</span>
                  <div><strong>{cand.name}</strong><span>{job.title}</span></div>
                  {fit.meetsCriteria && <Icon name="checkCircle" size={16} className="rank-list__ok" />}
                  <span className={`pill pill--${scoreTone(fit.total)}`}>{fit.total}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="users" title="No shared evidence yet" text="Candidates appear here once they apply and consent to sharing." />
          )}
        </Card>
      </section>
      <Note>Suitability is decision support only. Final selection always stays with the employer — Intervo makes no automated hiring decisions.</Note>
    </>
  );
}

/* ---------------- Job postings ---------------- */

const EMPTY_JOB = { title: "", roleId: "", location: "", mode: "On-site", level: "Entry level", type: "Full-time", description: "", skills: [], success: { minScore: 60, minMatch: 60, notes: "" }, status: "open" };

function JobPostings({ myJobs, openCandidates }) {
  const { db, update, notify, user } = useStore();
  const [editing, setEditing] = useState(null);

  function save(job) {
    update((d) => {
      if (job.id) {
        const i = d.jobs.findIndex((j) => j.id === job.id);
        d.jobs[i] = job;
      } else {
        d.jobs.push({ ...job, id: uid("job"), employerId: user.id, company: user.company, createdAt: Date.now() });
      }
    });
    notify(job.id ? "Job updated" : "Job posted — candidates can now apply");
    setEditing(null);
  }

  function toggleStatus(job) {
    update((d) => { d.jobs.find((j) => j.id === job.id).status = job.status === "open" ? "closed" : "open"; });
  }

  return (
    <>
      <PageHeader kicker="Recruitment" title="Job postings" subtitle="Define required skills with weights and the success criteria used in the suitability score."
        actions={<button className="btn btn--primary" onClick={() => setEditing({ ...EMPTY_JOB, roleId: db.config.roles[0].id, skills: db.config.roles[0].skills })}><Icon name="plus" size={16} /> New job</button>} />
      {myJobs.length ? (
        <div className="jobs">
          {myJobs.map((job, i) => {
            const n = db.applications.filter((a) => a.jobId === job.id).length;
            return (
              <article className="job" key={job.id}>
                <div className="job__head">
                  <span className="job__logo" data-tone={i % 4}>{initials(job.title)}</span>
                  <div className="job__title"><h3>{job.title}</h3><p>{db.config.roles.find((r) => r.id === job.roleId)?.title || "Custom role"} · {job.level}</p></div>
                  <span className={`badge ${job.status === "open" ? "badge--good" : "badge--muted"}`}>{job.status}</span>
                </div>
                <div className="job__meta">
                  <span><Icon name="pin" size={14} /> {job.location}</span>
                  <span><Icon name="building" size={14} /> {job.mode}</span>
                  <span><Icon name="clock" size={14} /> {formatDate(job.createdAt)}</span>
                </div>
                <div className="chips">{job.skills.map((s) => <span className="chip" key={s.name}>{s.name}<Weight w={s.weight} /></span>)}</div>
                <div className="criteria-mini">
                  <span>Min interview score <b>{job.success.minScore}%</b></span>
                  <span>Min CV match <b>{job.success.minMatch}%</b></span>
                </div>
                <div className="job__foot">
                  <button className="btn btn--text" onClick={() => toggleStatus(job)}>{job.status === "open" ? "Close posting" : "Reopen"}</button>
                  <div className="btn-row">
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(job)}><Icon name="edit" size={14} /> Edit</button>
                    <button className="btn btn--primary btn--sm" onClick={() => openCandidates(job.id)}>{n} applicant{n === 1 ? "" : "s"} <Icon name="arrowRight" size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card><Empty icon="briefcase" title="No postings yet" text="Create your first job posting." action="New job" onAction={() => setEditing({ ...EMPTY_JOB, roleId: db.config.roles[0].id, skills: db.config.roles[0].skills })} /></Card>
      )}
      {editing && <JobEditor job={editing} onClose={() => setEditing(null)} onSave={save} />}
    </>
  );
}

function JobEditor({ job, onClose, onSave }) {
  const { db } = useStore();
  const [form, setForm] = useState(structuredClone(job));
  const [error, setError] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const available = db.config.skills.filter((s) => !form.skills.some((x) => x.name === s.name));

  function applyTemplate(roleId) {
    const role = db.config.roles.find((r) => r.id === roleId);
    setForm((f) => ({ ...f, roleId, skills: role ? structuredClone(role.skills) : f.skills, title: f.title || (role ? `Junior ${role.title}` : "") }));
  }

  function submit() {
    if (form.title.trim().length < 3) return setError("Add a job title.");
    if (!form.location.trim()) return setError("Add a location.");
    if (!form.skills.length) return setError("Add at least one required skill.");
    onSave({ ...form, title: form.title.trim(), location: form.location.trim() });
  }

  return (
    <Modal open wide onClose={onClose} title={job.id ? "Edit job posting" : "New job posting"} subtitle="Required skills and their weights drive the CV match and suitability score."
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={submit}>{job.id ? "Save changes" : "Publish job"}</button></>}>
      <div className="form">
        <div className="form__grid">
          <div className="field">
            <label htmlFor="jt">Job title</label>
            <div className="input"><input id="jt" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Junior Frontend Developer" /></div>
          </div>
          <div className="field">
            <label htmlFor="jr">Role template</label>
            <select id="jr" className="select" value={form.roleId} onChange={(e) => applyTemplate(e.target.value)}>
              {db.config.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="jl">Location</label>
            <div className="input"><Icon name="pin" size={16} /><input id="jl" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Lahore" /></div>
          </div>
          <div className="field">
            <label>Work mode</label>
            <Segmented options={["On-site", "Hybrid", "Remote"]} value={form.mode} onChange={(v) => set("mode", v)} />
          </div>
          <div className="field">
            <label>Level</label>
            <Segmented options={["Entry level", "Internship"]} value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v, type: v === "Internship" ? "Internship" : "Full-time" }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="jd2">Description</label>
          <textarea id="jd2" rows={3} data-lenis-prevent value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What will the person work on?" />
        </div>

        <div className="field">
          <div className="field__row"><label>Required skills & weights</label><span className="field__hint">1 = nice to have · 3 = core</span></div>
          <div className="skill-editor">
            {form.skills.map((s, i) => (
              <div className="skill-editor__row" key={s.name}>
                <span>{s.name}</span>
                <Segmented options={[1, 2, 3].map((w) => ({ value: w, label: `${w}` }))} value={s.weight} onChange={(w) => setForm((f) => { const sk = [...f.skills]; sk[i] = { ...sk[i], weight: w }; return { ...f, skills: sk }; })} />
                <button className="icon-btn icon-btn--sm" onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, j) => j !== i) }))} aria-label={`Remove ${s.name}`}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div className="skill-editor__add">
              <select className="select" value={newSkill} onChange={(e) => setNewSkill(e.target.value)}>
                <option value="">Add a skill…</option>
                {available.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <button className="btn btn--ghost btn--sm" disabled={!newSkill} onClick={() => { setForm((f) => ({ ...f, skills: [...f.skills, { name: newSkill, weight: 2 }] })); setNewSkill(""); }}><Icon name="plus" size={14} /> Add</button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Success criteria</label>
          <div className="form__grid">
            <RangeField label="Minimum interview score" value={form.success.minScore} onChange={(v) => setForm((f) => ({ ...f, success: { ...f.success, minScore: v } }))} />
            <RangeField label="Minimum CV skill match" value={form.success.minMatch} onChange={(v) => setForm((f) => ({ ...f, success: { ...f.success, minMatch: v } }))} />
          </div>
          <textarea rows={2} data-lenis-prevent value={form.success.notes} onChange={(e) => setForm((f) => ({ ...f, success: { ...f.success, notes: e.target.value } }))} placeholder="What does success in this role look like? (optional)" />
        </div>
        {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
      </div>
    </Modal>
  );
}

function RangeField({ label, value, onChange }) {
  return (
    <div className="range">
      <div className="field__row"><span>{label}</span><b>{value}%</b></div>
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(+e.target.value)} style={{ "--v": `${value}%` }} />
    </div>
  );
}

/* ---------------- Candidates & explainable suitability ---------------- */

const STATUS = [
  { value: "new", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "declined", label: "Not progressing" },
];

function Candidates({ myJobs, jobId, setJobId, go }) {
  const { db, update } = useStore();
  const { job, visible, hidden } = useApplicants(jobId);
  const [openId, setOpenId] = useState(null);
  const w = db.config.rules.suitability;

  if (!myJobs.length) return (
    <>
      <PageHeader kicker="Candidates" title="Candidates" />
      <Card><Empty icon="users" title="No postings yet" text="Post a job first — applicants who consent will appear here." action="Post a job" onAction={() => go("jobs")} /></Card>
    </>
  );

  return (
    <>
      <PageHeader kicker="Explainable suitability" title="Candidates"
        subtitle={`Score = CV match ×${w.cv}% + interview evidence ×${w.interview}% + consistency ×${w.consistency}%. Only candidates who opted in are shown.`} />
      <div className="toolbar">
        <select className="select select--lg" value={job?.id} onChange={(e) => { setJobId(e.target.value); setOpenId(null); }} aria-label="Job">
          {myJobs.map((j) => <option key={j.id} value={j.id}>{j.title} — {db.applications.filter((a) => a.jobId === j.id).length} applicants</option>)}
        </select>
        {hidden > 0 && <span className="badge badge--muted"><Icon name="lock" size={12} /> {hidden} applicant{hidden > 1 ? "s" : ""} not sharing evidence</span>}
      </div>

      {visible.length ? (
        <div className="cand-list">
          {visible.map(({ app, cand, profile, fit }, rank) => {
            const open = openId === app.id;
            return (
              <article className={`cand ${open ? "is-open" : ""}`} key={app.id}>
                <button className="cand__row" onClick={() => setOpenId(open ? null : app.id)} aria-expanded={open}>
                  <span className="cand__rank">#{rank + 1}</span>
                  <span className="avatar">{initials(cand.name)}</span>
                  <div className="cand__name">
                    <strong>{cand.name}</strong>
                    <span>Applied {formatDate(app.date)} · {fit.cv.matched.length}/{job.skills.length} skills matched</span>
                  </div>
                  <div className="cand__factors">
                    {fit.factors.map((f) => (
                      <div key={f.key} title={f.detail}><span>{f.label}</span><Meter value={f.value} /><b>{f.value}</b></div>
                    ))}
                  </div>
                  {fit.meetsCriteria ? <span className="badge badge--good"><Icon name="checkCircle" size={12} /> Meets criteria</span> : <span className="badge badge--muted">Below criteria</span>}
                  <ScoreRing value={fit.total} size={58} stroke={6} />
                  <Icon name="chevronDown" size={18} className="cand__chev" />
                </button>
                {open && (
                  <div className="cand__detail">
                    <div className="cand__col">
                      <h4>How the score is built</h4>
                      <ul className="factor-list">
                        {fit.factors.map((f) => (
                          <li key={f.key}>
                            <div className="factor-list__top"><strong>{f.label}</strong><span>{f.value} × {f.weight}% = <b>{Math.round((f.value * f.weight) / 100)}</b></span></div>
                            <Meter value={f.value} />
                            <small>{f.detail}</small>
                          </li>
                        ))}
                        <li className="factor-list__total"><strong>Suitability</strong><b>{fit.total}%</b></li>
                      </ul>
                    </div>
                    <div className="cand__col">
                      {profile?.cv && (profile.cv.education?.length > 0 || profile.cv.experienceYears > 0 || profile.cv.projects?.length > 0) && (
                        <>
                          <h4>From the CV</h4>
                          <p className="cv-line">
                            {[profile.cv.education?.[0]?.degree, profile.cv.experienceYears ? `${profile.cv.experienceYears} yrs experience` : "No dated experience", profile.cv.projects?.length ? `${profile.cv.projects.length} project${profile.cv.projects.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </>
                      )}
                      <h4 className={profile?.cv ? "mt-sm" : ""}>Skill evidence</h4>
                      <div className="evidence">
                        {fit.evidence.map((e) => {
                          const inCv = fit.cv.matched.some((m) => m.name === e.name) ? "match" : fit.cv.partial.some((m) => m.name === e.name) ? "partial" : "missing";
                          return (
                            <div className="evidence__row" key={e.name}>
                              <span className="evidence__skill">{e.name}<Weight w={e.weight} /></span>
                              <span className={`chip chip--${inCv === "match" ? "good" : inCv === "partial" ? "fair" : "warn"}`}>CV: {inCv}</span>
                              {e.perf ? <span className={`score-text score-text--${scoreTone(e.perf.avg)}`}>{e.perf.avg}%</span> : <span className="field__hint">no answers</span>}
                            </div>
                          );
                        })}
                      </div>
                      {fit.weak.length > 0 && <p className="field__hint">Working on: {fit.weak.join(", ")}</p>}
                      <div className="field">
                        <label>Your decision</label>
                        <Segmented options={STATUS} value={app.status || "new"} onChange={(v) => update((d) => { d.applications.find((a) => a.id === app.id).status = v; })} />
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Card><Empty icon="users" title="No opted-in candidates yet" text="When candidates apply and agree to share their results, they appear here ranked by suitability." /></Card>
      )}
      <Note>Raw answers, face data and personal history are never shown to employers — only skill-level evidence the candidate agreed to share.</Note>
    </>
  );
}
