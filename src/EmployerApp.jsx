import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { formatDate, initials, plural, scoreTone, timeAgo } from "./lib";
import * as api from "./api";
import { Card, Empty, Meter, Modal, Note, PageHeader, ScoreRing, Segmented, Stat, Weight } from "./ui";

const NO_APPLICANTS = { job: null, visible: [], hidden: 0 };

/**
 * Ranked applicants for each job id → { [jobId]: { job, visible, hidden } }.
 * Only consented, opted-in candidates are listed, and only with their CV skill match. Local mode computes from
 * the store in the same render; backend mode fetches and refetches when the store changes.
 */
function useApplicants(jobIds) {
  const { db, notify } = useStore();
  const key = jobIds.join(",");
  const local = useMemo(
    () => (api.uses("employer") ? null : Object.fromEntries((key ? key.split(",") : []).map((id) => [id, api.getCandidatesSync(id, db)]))),
    [key, db]
  );
  const [fetched, setFetched] = useState({});
  useEffect(() => {
    if (!api.uses("employer")) return;
    let live = true;
    const ids = key ? key.split(",") : [];
    Promise.allSettled(ids.map((id) => api.getCandidates(id))).then((results) => {
      if (!live) return;
      setFetched((prev) => Object.fromEntries(ids.map((id, i) => [id, results[i].value || prev[id] || NO_APPLICANTS])));
      // A 404 is a cached job the server doesn't have (the job list refresh removes it); a 401 has signed the user out.
      const failed = results.find((r) => r.status === "rejected" && ![401, 404].includes(r.reason.status));
      if (failed) notify(failed.reason.message, "bad");
    });
    return () => { live = false; };
  }, [key, db, notify]);
  return local || fetched;
}

export default function EmployerApp({ page, go, params }) {
  const { db, user, notify } = useStore();
  const myJobs = db.jobs.filter((j) => j.employerId === user.id).sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    // Roles and skills first, then the jobs (both are local reads when the employer module is off).
    api.getConfig().then(() => api.getJobs()).catch((e) => notify(e.message, "bad"));
  }, [notify]);
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
  const ranked = useApplicants(myJobs.map((j) => j.id));
  const shared = Object.values(ranked).flatMap((r) => r.visible); // applicants who consented and share their profile
  const top = Object.values(ranked)
    .flatMap(({ job, visible }) => visible.map(({ app, cand, match }) => ({ a: app, job, cand, match })))
    .sort((x, y) => y.match.percentage - x.match.percentage || db.applications.indexOf(x.a) - db.applications.indexOf(y.a));

  return (
    <>
      <PageHeader kicker={user.company} title="Hiring overview" subtitle="Your open roles and the candidates who chose to share their CV skill match with you."
        actions={<button className="btn btn--primary" onClick={() => go("jobs")}><Icon name="plus" size={16} /> Post a job</button>} />
      <section className="stats">
        <Stat label="Open jobs" value={myJobs.filter((j) => j.status === "open").length} hint={plural(myJobs.length, "total posting")} icon="briefcase" accent="blue" />
        <Stat label="Applicants" value={apps.length} hint="Across all postings" icon="users" accent="violet" />
        <Stat label="Sharing CV match" value={shared.length} hint={`${apps.length - shared.length} without consent`} icon="shield" accent="green" />
        <Stat label="Avg CV match" value={top.length ? `${Math.round(top.reduce((s, t) => s + t.match.percentage, 0) / top.length)}%` : "—"} hint="Opted-in applicants" icon="target" accent="amber" />
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
                    <button className="btn btn--ghost btn--sm" onClick={() => openCandidates(j.id)}>{plural(n, "applicant")}</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="briefcase" title="No postings yet" text="Create a job with required skills and success criteria to start receiving candidates." action="Post a job" onAction={() => go("jobs")} />
          )}
        </Card>
        <Card title="Top candidates" subtitle="Highest CV skill match, opted-in only">
          {top.length ? (
            <ul className="rank-list">
              {top.slice(0, 5).map(({ a, job, cand, match }) => (
                <li key={a.id}>
                  <span className="avatar">{initials(cand.name)}</span>
                  <div><strong>{cand.name}</strong><span>{job.title}</span></div>
                  {match.meetsCriteria && <Icon name="checkCircle" size={16} className="rank-list__ok" />}
                  {match.percentage > 0
                    ? <span className={`pill pill--${scoreTone(match.percentage)}`}>{match.percentage}%</span>
                    : <span className="pill pill--muted">No match yet</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="users" title="No shared CV matches yet" text="Candidates appear here once they apply and consent to sharing." />
          )}
        </Card>
      </section>
      <Note>The CV skill match is decision support only. Final selection always stays with the employer — Intervo makes no automated hiring decisions.</Note>
    </>
  );
}

/* ---------------- Job postings ---------------- */

const EMPTY_JOB = { title: "", roleId: "", location: "", mode: "On-site", level: "Entry level", type: "Full-time", description: "", skills: [], success: { minMatch: 60, notes: "" }, status: "open" };

function JobPostings({ myJobs, openCandidates }) {
  const { db, notify, user } = useStore();
  const config = api.employerConfig(db);
  const [editing, setEditing] = useState(null);

  async function save(job) {
    try {
      await api.saveJob(job, user);
      notify(job.id ? "Job updated" : "Job posted — candidates can now apply");
      setEditing(null);
    } catch (e) {
      notify(e.message, "bad");
    }
  }

  function toggleStatus(job) {
    api.setJobStatus(job, job.status === "open" ? "closed" : "open").catch((e) => notify(e.message, "bad"));
  }

  return (
    <>
      <PageHeader kicker="Recruitment" title="Job postings" subtitle="Define required skills with weights and the minimum CV skill match used to rank candidates."
        actions={<button className="btn btn--primary" onClick={() => setEditing({ ...EMPTY_JOB, roleId: config.roles[0].id, skills: config.roles[0].skills })}><Icon name="plus" size={16} /> New job</button>} />
      {myJobs.length ? (
        <div className="jobs">
          {myJobs.map((job, i) => {
            const n = db.applications.filter((a) => a.jobId === job.id).length;
            return (
              <article className="job" key={job.id}>
                <div className="job__head">
                  <span className="job__logo" data-tone={i % 4}>{initials(job.title)}</span>
                  <div className="job__title"><h3>{job.title}</h3><p>{config.roles.find((r) => r.id === job.roleId)?.title || "Custom role"} · {job.level}</p></div>
                  <span className={`badge ${job.status === "open" ? "badge--good" : "badge--muted"}`}>{job.status}</span>
                </div>
                <div className="job__meta">
                  <span><Icon name="pin" size={14} /> {job.location}</span>
                  <span><Icon name="building" size={14} /> {job.mode}</span>
                  <span><Icon name="clock" size={14} /> {formatDate(job.createdAt)}</span>
                </div>
                <div className="chips">{job.skills.map((s) => <span className="chip" key={s.name}>{s.name}<Weight w={s.weight} /></span>)}</div>
                <div className="criteria-mini">
                  <span>Min CV match <b>{job.success.minMatch}%</b></span>
                </div>
                <div className="job__foot">
                  <button className="btn btn--text" onClick={() => toggleStatus(job)}>{job.status === "open" ? "Close posting" : "Reopen"}</button>
                  <div className="btn-row">
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(job)}><Icon name="edit" size={14} /> Edit</button>
                    <button className="btn btn--primary btn--sm" onClick={() => openCandidates(job.id)}>{plural(n, "applicant")} <Icon name="arrowRight" size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card><Empty icon="briefcase" title="No postings yet" text="Create your first job posting." action="New job" onAction={() => setEditing({ ...EMPTY_JOB, roleId: config.roles[0].id, skills: config.roles[0].skills })} /></Card>
      )}
      {editing && <JobEditor job={editing} onClose={() => setEditing(null)} onSave={save} />}
    </>
  );
}

function JobEditor({ job, onClose, onSave }) {
  const { db } = useStore();
  const config = api.employerConfig(db);
  const [form, setForm] = useState(structuredClone(job));
  const [error, setError] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const available = config.skills.filter((s) => !form.skills.some((x) => x.name === s.name));

  function applyTemplate(roleId) {
    const role = config.roles.find((r) => r.id === roleId);
    setForm((f) => ({ ...f, roleId, skills: role ? structuredClone(role.skills) : f.skills, title: f.title || (role ? `Junior ${role.title}` : "") }));
  }

  function submit() {
    if (form.title.trim().length < 3) return setError("Add a job title.");
    if (!form.location.trim()) return setError("Add a location.");
    if (!form.skills.length) return setError("Add at least one required skill.");
    onSave({ ...form, title: form.title.trim(), location: form.location.trim(), success: { minMatch: form.success.minMatch, notes: form.success.notes } });
  }

  return (
    <Modal open wide onClose={onClose} title={job.id ? "Edit job posting" : "New job posting"} subtitle="Required skills and their weights drive the CV skill match."
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
              {config.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
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

/* ---------------- Candidates ranked by CV skill match ---------------- */

const STATUS_BADGE = {
  shortlisted: ["warn", "Waiting for response"],
  accepted: ["good", "Accepted"],
  declined_by_candidate: ["low", "Declined"],
  not_progressing: ["muted", "Not progressing"],
};

/** Name, email and phone: shown only after the candidate has accepted the shortlist. */
function ContactCard({ contact }) {
  return (
    <div className="contact-card">
      <h4><Icon name="checkCircle" size={15} /> Contact details shared</h4>
      <ul>
        <li><Icon name="user" size={15} /> {contact.name}</li>
        <li><Icon name="mail" size={15} /> <a href={`mailto:${contact.email}`}>{contact.email}</a></li>
        <li><Icon name="phone" size={15} /> {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <span className="muted">No phone number on their CV</span>}</li>
      </ul>
    </div>
  );
}

/** The CV the candidate applied with: the parsed CV without contact details; after they accept, the original file and contact card too. */
function CVPanel({ target, onClose }) {
  const { notify } = useStore();
  const [state, setState] = useState({ loading: true });
  const appId = target?.app.id;
  const status = target ? api.appStatus(target.app) : null;

  useEffect(() => {
    if (!appId) return;
    let live = true;
    setState({ loading: true });
    api.getApplicationCV(appId)
      .then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [appId, status]);

  async function download() {
    try {
      await api.downloadApplicationCV(appId, state.data?.file?.name);
    } catch (e) {
      notify(e.message, "bad");
    }
  }

  const { data } = state;
  const cv = data?.cv;
  return (
    <Modal open={!!target} wide onClose={onClose} title={`CV · ${target?.cand.name ?? ""}`}
      subtitle={data?.contact ? "Contact details were shared when they accepted your shortlist." : "Contact details stay hidden until the candidate accepts your shortlist."}
      footer={data?.contact ? <><button className="btn btn--ghost" onClick={onClose}>Close</button><button className="btn btn--primary" onClick={download} disabled={!data.file}><Icon name="download" size={15} /> Download original CV</button></> : <button className="btn btn--ghost" onClick={onClose}>Close</button>}>
      {state.loading && <p className="muted">Loading the CV…</p>}
      {state.error && <p className="form__error" role="alert"><Icon name="alert" size={16} /> {state.error}</p>}
      {cv && (
        <div className="cv-view">
          {data.contact && <ContactCard contact={data.contact} />}
          {data.contact && !data.file && <p className="field__hint">The original file isn't available for this application. The parsed CV is shown below.</p>}
          {cv.summary && <section><h4>Summary</h4><p>{cv.summary}</p></section>}
          {(cv.skills.length > 0 || cv.otherSkills.length > 0) && (
            <section><h4>Skills</h4>
              <div className="chips">{cv.skills.map((s) => <span className="chip chip--good" key={s}>{s}</span>)}{cv.otherSkills.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
            </section>
          )}
          {cv.education.length > 0 && (
            <section><h4>Education</h4>
              <ul>{cv.education.map((e, i) => <li key={i}><b>{e.degree || "Degree"}</b>{e.institution && ` · ${e.institution}`}{e.dates && ` · ${e.dates}`}{e.score && ` · ${e.score}`}</li>)}</ul>
            </section>
          )}
          {cv.experience.length > 0 && (
            <section><h4>Experience{cv.experienceYears ? ` · about ${plural(cv.experienceYears, "year")}` : ""}</h4>
              <ul>{cv.experience.map((e, i) => <li key={i}><b>{e.title}</b>{e.company && ` · ${e.company}`}{e.dates && ` · ${e.dates}`}{e.details && <p>{e.details}</p>}</li>)}</ul>
            </section>
          )}
          {cv.projects.length > 0 && (
            <section><h4>Projects</h4>
              <ul>{cv.projects.map((p, i) => <li key={i}><b>{p.name}</b>{p.details && <p>{p.details}</p>}{p.tech?.length > 0 && <div className="chips">{p.tech.map((t) => <span className="chip" key={t}>{t}</span>)}</div>}</li>)}</ul>
            </section>
          )}
          {cv.certifications.length > 0 && (
            <section><h4>Certifications</h4><ul>{cv.certifications.map((c) => <li key={c}>{c}</li>)}</ul></section>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The employer's decision for one applicant: shortlist (optional message), stop, or the candidate's answer. */
function Decision({ app, contact, onShortlist, onStop }) {
  const status = api.appStatus(app);
  return (
    <div className="field">
      <label>Your decision</label>
      {(status === "applied" || status === "not_progressing") && (
        <div className="btn-row">
          <button className="btn btn--primary btn--sm" onClick={onShortlist}><Icon name="star" size={14} /> Shortlist</button>
          {status === "applied" && <button className="btn btn--ghost btn--sm" onClick={onStop}>Not progressing</button>}
        </div>
      )}
      {status === "not_progressing" && <p className="field__hint">Marked as not progressing. The candidate was notified.</p>}
      {status === "shortlisted" && (
        <>
          <div className="btn-row">
            <span className="badge badge--warn"><Icon name="clock" size={12} /> Waiting for response</span>
            <button className="btn btn--ghost btn--sm" onClick={onStop}>Not progressing</button>
          </div>
          {app.employerMessage && <blockquote className="app-quote"><small>Your message</small>{app.employerMessage}</blockquote>}
        </>
      )}
      {status === "accepted" && (
        <>
          {app.candidateNote && <blockquote className="app-quote app-quote--you"><small>Their note</small>{app.candidateNote}</blockquote>}
          {contact && <ContactCard contact={contact} />}
        </>
      )}
      {status === "declined_by_candidate" && (
        <>
          <p className="field__hint">The candidate declined. No contact details were shared.</p>
          {app.candidateNote && <blockquote className="app-quote app-quote--you"><small>Their note</small>{app.candidateNote}</blockquote>}
        </>
      )}
    </div>
  );
}

function Candidates({ myJobs, jobId, setJobId, go }) {
  const { db, notify } = useStore();
  const { job, visible, hidden } = useApplicants(jobId ? [jobId] : [])[jobId] || NO_APPLICANTS;
  const [openId, setOpenId] = useState(null);
  const [shortlisting, setShortlisting] = useState(null); // applicant being shortlisted: { app, cand }
  const [viewing, setViewing] = useState(null); // applicant whose CV panel is open: { app, cand }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function changeStatus(app, status, text = "") {
    setBusy(true);
    try {
      await api.setApplicationStatus(app.id, status, text);
      notify(status === "shortlisted" ? "Shortlisted: the candidate has been notified" : "Marked as not progressing: the candidate has been notified");
      setShortlisting(null);
    } catch (e) {
      notify(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  if (!myJobs.length) return (
    <>
      <PageHeader kicker="Candidates" title="Candidates" />
      <Card><Empty icon="users" title="No postings yet" text="Post a job first — applicants who consent will appear here." action="Post a job" onAction={() => go("jobs")} /></Card>
    </>
  );

  return (
    <>
      <PageHeader kicker="CV skill match" title="Candidates"
        subtitle="Ranked by how well each candidate's CV covers the skills this job requires. Only candidates who opted in are shown." />
      <div className="toolbar">
        <select className="select select--lg" value={job?.id} onChange={(e) => { setJobId(e.target.value); setOpenId(null); }} aria-label="Job">
          {myJobs.map((j) => <option key={j.id} value={j.id}>{j.title} — {plural(db.applications.filter((a) => a.jobId === j.id).length, "applicant")}</option>)}
        </select>
        {hidden > 0 && <span className="badge badge--muted"><Icon name="lock" size={12} /> {plural(hidden, "applicant")} not sharing their CV match</span>}
      </div>

      {visible.length ? (
        <div className="cand-list">
          {visible.map(({ app, cand, cvSummary, match, contact }, rank) => {
            const open = openId === app.id;
            const skillState = (name) => (match.matched.some((m) => m.name === name) ? "match" : match.partial.some((m) => m.name === name) ? "partial" : "missing");
            return (
              <article className={`cand ${open ? "is-open" : ""}`} key={app.id}>
                <button className="cand__row" onClick={() => setOpenId(open ? null : app.id)} aria-expanded={open}>
                  <span className="cand__rank">#{rank + 1}</span>
                  <span className="avatar">{initials(cand.name)}</span>
                  <div className="cand__name">
                    <strong>{cand.name}</strong>
                    <span>Applied {formatDate(app.date)} · {match.matched.length}/{plural(job.skills.length, "skill")} matched</span>
                  </div>
                  <div className="cand__factors">
                    <div title={`${match.matched.length} matched, ${match.partial.length} partial, ${match.missing.length} missing`}><span>CV skill match</span><Meter value={match.percentage} /><b>{match.percentage}</b></div>
                  </div>
                  {match.meetsCriteria ? <span className="badge badge--good"><Icon name="checkCircle" size={12} /> Meets criteria</span> : <span className="badge badge--muted">Below criteria</span>}
                  {STATUS_BADGE[api.appStatus(app)] && <span className={`badge badge--${STATUS_BADGE[api.appStatus(app)][0]}`}>{STATUS_BADGE[api.appStatus(app)][1]}</span>}
                  <ScoreRing value={match.percentage} size={58} stroke={6} tone={match.percentage > 0 ? undefined : "muted"} />
                  <Icon name="chevronDown" size={18} className="cand__chev" />
                </button>
                {open && (
                  <div className="cand__detail">
                    <div className="cand__col">
                      <h4>Required skills</h4>
                      <div className="evidence">
                        {[...match.matched, ...match.partial, ...match.missing].map((e) => {
                          const state = skillState(e.name);
                          return (
                            <div className="evidence__row" key={e.name}>
                              <span className="evidence__skill">{e.name}<Weight w={e.weight} /></span>
                              <span className={`chip chip--${state === "match" ? "good" : state === "partial" ? "fair" : "warn"}`}>
                                {state === "match" ? "Matched" : state === "partial" ? `Partial · via ${e.via}` : "Missing"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="field__hint">{match.percentage}% weighted match · a related skill counts as half. Minimum for this job: {job.success?.minMatch ?? 0}%.</p>
                    </div>
                    <div className="cand__col">
                      {match.checks?.length > 0 && (
                        <>
                          <h4>Requirement checks</h4>
                          <ul className="req-checks">
                            {match.checks.map((c) => (
                              <li key={c.key} className={c.met ? "is-ok" : "is-miss"}>
                                <Icon name={c.met ? "checkCircle" : "alert"} size={16} />
                                <div><strong>{c.label}: {c.required}</strong><span>{c.actual}</span></div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <h4 className="mt-sm">From the CV</h4>
                      <p className="cv-line">
                        {cvSummary
                          ? [cvSummary.topDegree, cvSummary.experienceYears ? `${plural(cvSummary.experienceYears, "yr")} experience` : "No dated experience", cvSummary.projectCount ? plural(cvSummary.projectCount, "project") : null].filter(Boolean).join(" · ")
                          : "No CV summary shared yet"}
                      </p>
                      <div className="btn-row">
                        <button className="btn btn--ghost btn--sm" onClick={() => setViewing({ app, cand })}><Icon name="file" size={14} /> View CV</button>
                        {api.appStatus(app) === "accepted" && (
                          <button className="btn btn--primary btn--sm" onClick={() => api.downloadApplicationCV(app.id).catch((e) => notify(e.message, "bad"))}><Icon name="download" size={14} /> Download original CV</button>
                        )}
                      </div>
                      <Decision app={app} contact={contact}
                        onShortlist={() => { setShortlisting({ app, cand }); setMessage(""); }}
                        onStop={() => changeStatus(app, "not_progressing")} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Card><Empty icon="users" title="No opted-in candidates yet" text="When candidates apply and agree to share, they appear here ranked by CV skill match." /></Card>
      )}
      <Note>Employers see only the CV skill match. Interview answers, scores, practice history and face data are never shown. A candidate's email and phone appear only after they accept your shortlist.</Note>

      <CVPanel target={viewing ? { ...viewing, app: visible.find((v) => v.app.id === viewing.app.id)?.app || viewing.app } : null} onClose={() => setViewing(null)} />

      <Modal
        open={!!shortlisting}
        title={`Shortlist ${shortlisting?.cand.name ?? ""}?`}
        subtitle="They are notified and decide whether to share their contact details with you."
        onClose={() => !busy && setShortlisting(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setShortlisting(null)} disabled={busy}>Cancel</button>
            <button className="btn btn--primary" onClick={() => changeStatus(shortlisting.app, "shortlisted", message)} disabled={busy}>{busy ? "Sending…" : "Shortlist & notify"}</button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="shortlist-msg">Message to the candidate (optional)</label>
          <textarea id="shortlist-msg" rows={4} maxLength={500} data-lenis-prevent value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: we liked your portfolio and would like to talk." />
          <span className="field__hint">{message.length}/500</span>
        </div>
      </Modal>
    </>
  );
}
