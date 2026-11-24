import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import * as api from "./api";
import { formatDate, initials, plural } from "./lib";
import { Card, Empty, Modal, Note, PageHeader, Segmented, Stat, Weight } from "./ui";

/*
 * Admin console — database-driven configuration (proposal objective 9).
 * Every change here is used immediately by the candidate and employer portals.
 * With the admin backend module on, each change is saved through /api/admin/* (see api.js);
 * server messages such as "Skill is used by a role" are shown as they come.
 */
export default function AdminApp({ page, go }) {
  const { notify } = useStore();
  // Backend mode: read the current configuration, users and counts when the console opens and on each page change.
  useEffect(() => {
    api.loadAdminData().catch((e) => notify(e.message, "bad"));
  }, [page, notify]);
  return (
    <>
      {page === "overview" && <AdminOverview go={go} />}
      {page === "domains" && <DomainsRoles />}
      {page === "skills" && <Skills />}
      {page === "questions" && <Questions />}
      {page === "criteria" && <CriteriaRules />}
      {page === "users" && <Users />}
    </>
  );
}

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

function AdminOverview({ go }) {
  const { db, resetDemo } = useStore();
  const c = db.config;
  const stats = api.adminStats(db);
  const tiles = [
    { page: "domains", icon: "layers", label: "Domains & roles", value: `${c.domains.length} / ${c.roles.length}`, text: "Group roles by domain and set required skills with weights." },
    { page: "skills", icon: "tag", label: "Skills", value: c.skills.length, text: "Aliases for CV extraction, related skills for partial matches, coaching tips." },
    { page: "questions", icon: "book", label: "Question templates", value: c.questions.length, text: "Per-skill questions with expected key points and follow-ups." },
    { page: "criteria", icon: "sliders", label: "Criteria & rules", value: c.criteria.filter((x) => x.enabled).length, text: "Rubric weights, weakness threshold, follow-ups and face verification rules." },
  ];
  return (
    <>
      <PageHeader kicker="Admin console" title="Configuration" subtitle="New roles, skills and questions are added here as data — no changes to application code." />
      <section className="stats">
        <Stat label="Candidates" value={stats.candidates} hint="Registered accounts" icon="user" accent="blue" />
        <Stat label="Employers" value={stats.employers} hint="Registered accounts" icon="building" accent="violet" />
        <Stat label="Sessions" value={stats.sessions} hint="Interviews completed" icon="mic" accent="green" />
        <Stat label="Open jobs" value={stats.openJobs} hint={plural(stats.applications, "application")} icon="briefcase" accent="amber" />
      </section>
      <div className="tile-grid">
        {tiles.map((t) => (
          <button key={t.page} className="tile" onClick={() => go(t.page)}>
            <span className="tile__icon"><Icon name={t.icon} size={20} /></span>
            <span className="tile__value">{t.value}</span>
            <strong>{t.label}</strong>
            <p>{t.text}</p>
            <span className="tile__go">Manage <Icon name="arrowRight" size={14} /></span>
          </button>
        ))}
      </div>
      {!api.uses("admin") && (
        <Card title="Prototype data" subtitle="Everything is stored in this browser until the PostgreSQL backend is connected" className="mt">
          <div className="btn-row">
            <button className="btn btn--ghost btn--danger-outline" onClick={() => window.confirm("Reset all data to the demo seed? This signs you out.") && resetDemo()}>
              <Icon name="refresh" size={15} /> Reset demo data
            </button>
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------------- Domains & roles ---------------- */

function DomainsRoles() {
  const { db, notify } = useStore();
  const [domainName, setDomainName] = useState("");
  const [editing, setEditing] = useState(null);
  const { domains, roles } = db.config;

  const run = (action, success) => action.then(() => success && notify(success)).catch((e) => notify(e.message, "bad"));

  function addDomain(e) {
    e.preventDefault();
    const name = domainName.trim();
    if (!name) return;
    api.addDomain(name).then(() => { setDomainName(""); notify(`Domain "${name}" added`); }).catch((err) => notify(err.message, "bad"));
  }

  const removeDomain = (id) => run(api.removeDomain(id));

  function saveRole(role) {
    api.saveRole(role).then(() => { notify("Role saved — available to candidates now"); setEditing(null); }).catch((e) => notify(e.message, "bad"));
  }

  return (
    <>
      <PageHeader kicker="Configuration" title="Domains & roles"
        actions={<button className="btn btn--primary" onClick={() => setEditing({ title: "", domainId: domains[0]?.id, skills: [], responsibilities: [], active: true })}><Icon name="plus" size={16} /> New role</button>} />
      <div className="grid grid--admin">
        <Card title="Domains" subtitle={`${domains.length} configured`}>
          <ul className="admin-list">
            {domains.map((d) => (
              <li key={d.id}>
                <span className="admin-list__icon"><Icon name="layers" size={15} /></span>
                <div><strong>{d.name}</strong><span>{plural(roles.filter((r) => r.domainId === d.id).length, "role")}</span></div>
                <button className="icon-btn icon-btn--sm" onClick={() => removeDomain(d.id)} aria-label={`Delete ${d.name}`}><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
          <form className="inline-add" onSubmit={addDomain}>
            <input className="input-plain" placeholder="New domain, e.g. Healthcare" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
            <button className="btn btn--ghost btn--sm" type="submit"><Icon name="plus" size={14} /> Add</button>
          </form>
        </Card>
        <Card title="Job roles" subtitle="Required skills and weights per role">
          <div className="role-table">
            {roles.map((r) => (
              <div className="role-table__row" key={r.id}>
                <div className="role-table__main">
                  <strong>{r.title}</strong>
                  <span className="badge badge--muted">{domains.find((d) => d.id === r.domainId)?.name || "No domain"}</span>
                  {r.active === false && <span className="badge badge--warn">Inactive</span>}
                </div>
                <div className="chips">{r.skills.map((s) => <span className="chip" key={s.name}>{s.name}<Weight w={s.weight} /></span>)}</div>
                <div className="btn-row">
                  <button className="icon-btn icon-btn--sm" onClick={() => setEditing(r)} aria-label="Edit role"><Icon name="edit" size={15} /></button>
                  <button className="icon-btn icon-btn--sm" onClick={() => run(api.removeRole(r.id))} aria-label="Delete role"><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {editing && <RoleEditor role={editing} onClose={() => setEditing(null)} onSave={saveRole} />}
    </>
  );
}

function RoleEditor({ role, onClose, onSave }) {
  const { db } = useStore();
  const [form, setForm] = useState(() => ({ responsibilities: [], active: true, ...structuredClone(role) }));
  const [duties, setDuties] = useState((role.responsibilities || []).join("\n"));
  const [add, setAdd] = useState("");
  const [error, setError] = useState("");
  const available = db.config.skills.filter((s) => !form.skills.some((x) => x.name === s.name));
  return (
    <Modal open wide onClose={onClose} title={role.id ? "Edit role" : "New role"}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={() => (form.title.trim() && form.skills.length ? onSave({ ...form, title: form.title.trim(), responsibilities: duties.split("\n").map((l) => l.trim()).filter(Boolean) }) : setError("Add a title and at least one skill."))}>Save role</button></>}>
      <div className="form">
        <div className="form__grid">
          <div className="field"><label>Title</label><div className="input"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Data Analyst" /></div></div>
          <div className="field"><label>Domain</label>
            <select className="select" value={form.domainId} onChange={(e) => setForm({ ...form, domainId: e.target.value })}>
              {db.config.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <div className="field__row"><label htmlFor="role-duties">Responsibilities</label><span className="field__hint">One short line each. Shown to candidates, pre-fills job descriptions and guides AI-written questions.</span></div>
          <textarea id="role-duties" rows={4} data-lenis-prevent value={duties} onChange={(e) => setDuties(e.target.value)} placeholder={"Build responsive UI\nConnect REST APIs"} />
        </div>
        <label className="check"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>Active: candidates can practise this role and employers can post jobs for it</label>
        <div className="field">
          <div className="field__row"><label>Required skills</label><span className="field__hint">1 = nice to have · 3 = core</span></div>
          <div className="skill-editor">
            {form.skills.map((s, i) => (
              <div className="skill-editor__row" key={s.name}>
                <span>{s.name}</span>
                <Segmented options={[1, 2, 3].map((w) => ({ value: w, label: `${w}` }))} value={s.weight} onChange={(w) => setForm((f) => { const sk = [...f.skills]; sk[i] = { ...sk[i], weight: w }; return { ...f, skills: sk }; })} />
                <button className="icon-btn icon-btn--sm" onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, j) => j !== i) }))} aria-label="Remove"><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div className="skill-editor__add">
              <select className="select" value={add} onChange={(e) => setAdd(e.target.value)}>
                <option value="">Add a skill…</option>
                {available.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
              <button className="btn btn--ghost btn--sm" disabled={!add} onClick={() => { setForm((f) => ({ ...f, skills: [...f.skills, { name: add, weight: 2 }] })); setAdd(""); }}><Icon name="plus" size={14} /> Add</button>
            </div>
          </div>
        </div>
        {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Skills ---------------- */

function Skills() {
  const { db, notify } = useStore();
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const list = db.config.skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  function save(skill, originalName) {
    // Server errors (e.g. a duplicate name) are shown in the editor so the admin can fix them.
    return api.saveSkill(skill, originalName).then(() => { notify("Skill saved"); setEditing(null); });
  }

  const remove = (skill) => api.removeSkill(skill).catch((e) => notify(e.message, "bad"));

  return (
    <>
      <PageHeader kicker="Configuration" title="Skills" subtitle="Aliases drive CV/JD extraction. Related skills create partial matches. Tips are shown as coaching advice."
        actions={<button className="btn btn--primary" onClick={() => setEditing({ name: "", aliases: [], related: [], tip: "" })}><Icon name="plus" size={16} /> New skill</button>} />
      <div className="toolbar">
        <div className="search"><Icon name="search" size={17} /><input placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="field__hint">{plural(list.length, "skill")}</span>
      </div>
      <Card>
        <div className="table table--skills" role="table">
          <div className="table__row table__row--head" role="row"><span>Skill</span><span>Aliases</span><span>Related</span><span>Questions</span><span /></div>
          {list.map((s) => (
            <div className="table__row" role="row" key={s.name}>
              <span className="table__skill">{s.name}</span>
              <span className="table__muted">{s.aliases.join(", ")}</span>
              <span>{s.related?.length ? s.related.join(", ") : <span className="field__hint">—</span>}</span>
              <span>{db.config.questions.filter((x) => x.skill === s.name).length}</span>
              <span className="btn-row btn-row--end">
                <button className="icon-btn icon-btn--sm" onClick={() => setEditing(s)} aria-label="Edit"><Icon name="edit" size={15} /></button>
                <button className="icon-btn icon-btn--sm" onClick={() => remove(s)} aria-label="Delete"><Icon name="trash" size={15} /></button>
              </span>
            </div>
          ))}
        </div>
      </Card>
      {editing && <SkillEditor skill={editing} onClose={() => setEditing(null)} onSave={save} />}
    </>
  );
}

function SkillEditor({ skill, onClose, onSave }) {
  const { db } = useStore();
  const [name, setName] = useState(skill.name);
  const [aliases, setAliases] = useState(skill.aliases.join(", "));
  const [related, setRelated] = useState(skill.related || []);
  const [tip, setTip] = useState(skill.tip || "");
  const [error, setError] = useState("");
  function submit() {
    const n = name.trim();
    if (!n) return setError("Name is required.");
    if (n !== skill.name && db.config.skills.some((s) => s.name.toLowerCase() === n.toLowerCase())) return setError("A skill with this name exists.");
    Promise.resolve(onSave({ ...skill, name: n, aliases: splitList(aliases.toLowerCase()), related, tip: tip.trim() }, skill.name)).catch((e) => setError(e.message));
  }
  return (
    <Modal open onClose={onClose} title={skill.name ? `Edit ${skill.name}` : "New skill"}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={submit}>Save skill</button></>}>
      <div className="form">
        <div className="field"><label>Name</label><div className="input"><input value={name} onChange={(e) => setName(e.target.value)} disabled={!!skill.name} /></div></div>
        <div className="field"><label>Aliases <span className="optional">comma separated</span></label><div className="input"><input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="reactjs, react.js" /></div></div>
        <div className="field">
          <label>Related skills <span className="optional">give partial credit</span></label>
          <div className="chips chips--pick">
            {db.config.skills.filter((s) => s.name !== skill.name).map((s) => {
              const on = related.includes(s.name);
              return <button type="button" key={s.name} className={`chip ${on ? "chip--brand" : ""}`} onClick={() => setRelated((r) => (on ? r.filter((x) => x !== s.name) : [...r, s.name]))}>{on && <Icon name="check" size={11} strokeWidth={2.6} />} {s.name}</button>;
            })}
          </div>
        </div>
        <div className="field"><label>Coaching tip</label><textarea rows={2} data-lenis-prevent value={tip} onChange={(e) => setTip(e.target.value)} /></div>
        {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Question templates ---------------- */

function Questions() {
  const { db, notify } = useStore();
  const [skill, setSkill] = useState("All");
  const [editing, setEditing] = useState(null);
  const list = db.config.questions.filter((q) => skill === "All" || q.skill === skill);

  function save(q) {
    return api.saveQuestion(q).then(() => { notify("Question template saved"); setEditing(null); });
  }

  return (
    <>
      <PageHeader kicker="Configuration" title="Question templates" subtitle="Each template targets one skill. Key points feed technical accuracy; the follow-up is asked when an answer is incomplete."
        actions={<button className="btn btn--primary" onClick={() => setEditing({ skill: db.config.skills[0].name, type: "technical", text: "", keywords: [], followUp: "", difficulty: "medium" })}><Icon name="plus" size={16} /> New template</button>} />
      <div className="toolbar">
        <select className="select select--lg" value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Filter by skill">
          <option>All</option>
          {db.config.skills.map((s) => <option key={s.name}>{s.name}</option>)}
        </select>
        <span className="field__hint">{plural(list.length, "template")}</span>
      </div>
      <div className="q-list">
        {list.map((q) => (
          <article className="q-card" key={q.id}>
            <div className="q-card__head">
              <div className="chips"><span className="chip chip--brand">{q.skill}</span><span className="chip">{q.type === "behavioral" ? "Behavioural" : "Technical"}</span><span className="chip">{q.difficulty === "easy" ? "Easy" : q.difficulty === "hard" ? "Hard" : "Medium"}</span></div>
              <div className="btn-row">
                <button className="icon-btn icon-btn--sm" onClick={() => setEditing(q)} aria-label="Edit"><Icon name="edit" size={15} /></button>
                <button className="icon-btn icon-btn--sm" onClick={() => api.removeQuestion(q.id).catch((e) => notify(e.message, "bad"))} aria-label="Delete"><Icon name="trash" size={15} /></button>
              </div>
            </div>
            <p className="q-card__text">{q.text}</p>
            <div className="q-card__meta">
              <span><b>Key points:</b> {q.keywords.join(", ") || "—"}</span>
              {q.followUp && <span><b>Follow-up:</b> {q.followUp}</span>}
            </div>
          </article>
        ))}
      </div>
      {!list.length && <Card><Empty icon="book" title="No templates for this skill" text="Add one so it can be used in interviews." /></Card>}
      {editing && <QuestionEditor q={editing} onClose={() => setEditing(null)} onSave={save} />}
    </>
  );
}

function QuestionEditor({ q, onClose, onSave }) {
  const { db } = useStore();
  const [form, setForm] = useState({ ...q, keywords: q.keywords.join(", ") });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open wide onClose={onClose} title={q.id ? "Edit template" : "New question template"}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={() => (form.text.trim().length < 10 ? setError("Write the question.") : Promise.resolve(onSave({ ...form, text: form.text.trim(), followUp: form.followUp.trim(), keywords: splitList(form.keywords.toLowerCase()) })).catch((e) => setError(e.message)))}>Save template</button></>}>
      <div className="form">
        <div className="form__grid">
          <div className="field"><label>Skill</label>
            <select className="select" value={form.skill} onChange={set("skill")}>{db.config.skills.map((s) => <option key={s.name}>{s.name}</option>)}</select>
          </div>
          <div className="field"><label>Type</label>
            <Segmented options={[{ value: "technical", label: "Technical" }, { value: "behavioral", label: "Behavioural" }]} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
          </div>
          <div className="field"><label>Difficulty</label>
            <Segmented options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} value={form.difficulty || "medium"} onChange={(v) => setForm((f) => ({ ...f, difficulty: v }))} />
          </div>
        </div>
        <div className="field"><label>Question</label><textarea rows={2} data-lenis-prevent value={form.text} onChange={set("text")} /></div>
        <div className="field"><label>Expected key points <span className="optional">comma separated</span></label><div className="input"><input value={form.keywords} onChange={set("keywords")} placeholder="state, props, re-render" /></div></div>
        <div className="field"><label>Follow-up question</label><div className="input"><input value={form.followUp} onChange={set("followUp")} placeholder="Asked when the answer is incomplete" /></div></div>
        {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Criteria & rules ---------------- */

function CriteriaRules() {
  const { db, notify } = useStore();
  const { criteria, rules } = db.config;
  const fail = (e) => notify(e.message, "bad");
  const setRule = (k, v) => api.setRules({ [k]: v }).catch(fail);
  const setCriterion = (key, patch) => api.setCriterion(key, patch).catch(fail);

  return (
    <>
      <PageHeader kicker="Configuration" title="Criteria & rules" subtitle="The rubric used to score every answer and the rules behind weakness detection, follow-ups and face verification." />
      <div className="grid grid--split">
        <Card title="Evaluation criteria" subtitle="Weights in the answer score">
          <div className="crit-list">
            {criteria.map((c) => (
              <div className={`crit ${c.enabled ? "" : "is-off"}`} key={c.key}>
                <div className="crit__main">
                  <strong>{c.label}</strong>
                  <span>{c.appliesTo === "all" ? "All questions" : c.appliesTo === "technical" ? "Technical questions" : "Behavioural questions"}</span>
                </div>
                <Segmented options={[1, 2, 3].map((w) => ({ value: w, label: `×${w}` }))} value={c.weight} onChange={(w) => setCriterion(c.key, { weight: w })} />
                <label className="mini-switch" aria-label={`Enable ${c.label}`}>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => setCriterion(c.key, { enabled: e.target.checked })} />
                  <span />
                </label>
              </div>
            ))}
          </div>
          <Note>Changes apply to new answers. Stored scores are not recalculated.</Note>
        </Card>
        <div className="stack">
          <Card title="Weakness & follow-up rules">
            <NumberRule label="Weakness threshold" hint="A skill averaging below this is weak" value={rules.weakThreshold} suffix="%" min={30} max={90} step={5} onChange={(v) => setRule("weakThreshold", v)} />
            <NumberRule label="Sessions required" hint="Minimum sessions before a weakness is confirmed" value={rules.weakMinSessions} min={1} max={5} step={1} onChange={(v) => setRule("weakMinSessions", v)} />
            <NumberRule label="Follow-up trigger" hint="Ask a follow-up when completeness is below" value={rules.followUpBelow} suffix="%" min={30} max={80} step={5} onChange={(v) => setRule("followUpBelow", v)} />
            <NumberRule label="Default questions" hint="Questions per session" value={rules.defaultQuestions} min={3} max={6} step={1} onChange={(v) => setRule("defaultQuestions", v)} />
            <NumberRule label="Face match threshold" hint="Minimum similarity to accept a face" value={rules.faceThreshold} min={0.3} max={0.9} step={0.05} onChange={(v) => setRule("faceThreshold", +v.toFixed(2))} />
          </Card>
        </div>
      </div>
    </>
  );
}

function NumberRule({ label, hint, value, suffix = "", min, max, step, onChange }) {
  return (
    <div className="rule">
      <div className="rule__text"><strong>{label}</strong>{hint && <span>{hint}</span>}</div>
      <div className="stepper-input">
        <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} aria-label={`Decrease ${label}`}>−</button>
        <b>{value}{suffix}</b>
        <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

/* ---------------- Users ---------------- */

function Users() {
  const { db, notify } = useStore();
  const [role, setRole] = useState("all");
  const [resetting, setResetting] = useState(null); // the user whose face is about to be reset
  const [busy, setBusy] = useState(false);

  async function resetFace() {
    setBusy(true);
    try {
      await api.resetFace(resetting.id);
      notify(`${resetting.name} will enrol a new face at their next sign-in`);
      setResetting(null);
    } catch (e) {
      notify(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  const list = api.adminUsers(db).filter((u) => role === "all" || u.role === role);
  return (
    <>
      <PageHeader kicker="Accounts" title="Users" subtitle="Role-based access: candidates, employers and administrators." />
      <div className="toolbar">
        <Segmented options={[{ value: "all", label: "All" }, { value: "candidate", label: "Candidates" }, { value: "employer", label: "Employers" }, { value: "admin", label: "Admins" }]} value={role} onChange={setRole} />
      </div>
      <Card>
        {list.length ? (
          <div className="table table--users" role="table">
            <div className="table__row table__row--head" role="row"><span>User</span><span>Role</span><span>Face</span><span>Activity</span><span>Joined</span><span>Actions</span></div>
            {list.map((u) => (
              <div className="table__row" role="row" key={u.id}>
                <span className="user-cell"><span className="avatar avatar--sm">{initials(u.name)}</span><span><strong>{u.name}</strong><small>{u.email}</small></span></span>
                <span><span className={`role-pill role-pill--${u.role}`}>{u.role}</span></span>
                <span>{u.faceEnrolled ? <span className="badge badge--good">Enrolled</span> : <span className="badge badge--muted">Not set</span>}</span>
                <span className="table__muted">
                  {u.role === "candidate" ? plural(u.sessions, "session") : u.role === "employer" ? plural(u.jobs, "job") : "—"}
                </span>
                <span className="table__muted">{formatDate(u.createdAt)}</span>
                <span>
                  <button className="btn btn--ghost btn--sm" disabled={!u.faceEnrolled} onClick={() => setResetting(u)} title={u.faceEnrolled ? "Clear this user's face so they enrol again at next sign-in" : "No face enrolled"}>
                    Reset face
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : <Empty icon="users" title="No users" text="Nobody in this group yet." />}
      </Card>
      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title="Reset face?"
        footer={<><button className="btn btn--ghost" onClick={() => setResetting(null)}>Cancel</button><button className="btn btn--danger-solid" onClick={resetFace} disabled={busy}>Reset face</button></>}
      >
        <p className="muted">
          {resetting?.name}'s face template will be cleared and their open sessions will end. They sign in with their password and enrol a new face. Use this when their camera or appearance means the old face no longer matches.
        </p>
      </Modal>
    </>
  );
}
