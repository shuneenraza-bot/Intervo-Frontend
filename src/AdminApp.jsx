import { useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { formatDate, initials, plural, uid } from "./lib";
import { Card, Empty, Modal, Note, PageHeader, Segmented, Stat, Switch, Weight } from "./ui";

/*
 * Admin console — database-driven configuration (proposal objective 9).
 * Every change here is used immediately by the candidate and employer portals.
 */
export default function AdminApp({ page, go }) {
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
  const tiles = [
    { page: "domains", icon: "layers", label: "Domains & roles", value: `${c.domains.length} / ${c.roles.length}`, text: "Group roles by domain and set required skills with weights." },
    { page: "skills", icon: "tag", label: "Skills", value: c.skills.length, text: "Aliases for CV extraction, related skills for partial matches, coaching tips." },
    { page: "questions", icon: "book", label: "Question templates", value: c.questions.length, text: "Per-skill questions with expected key points and follow-ups." },
    { page: "criteria", icon: "sliders", label: "Criteria & rules", value: c.criteria.filter((x) => x.enabled).length, text: "Rubric weights, weakness threshold and suitability weights." },
  ];
  return (
    <>
      <PageHeader kicker="Admin console" title="Configuration" subtitle="New roles, skills and questions are added here as data — no changes to application code." />
      <section className="stats">
        <Stat label="Candidates" value={db.users.filter((u) => u.role === "candidate").length} hint="Registered accounts" icon="user" accent="blue" />
        <Stat label="Employers" value={db.users.filter((u) => u.role === "employer").length} hint="Registered accounts" icon="building" accent="violet" />
        <Stat label="Sessions" value={db.sessions.length} hint="Interviews completed" icon="mic" accent="green" />
        <Stat label="Open jobs" value={db.jobs.filter((j) => j.status === "open").length} hint={plural(db.applications.length, "application")} icon="briefcase" accent="amber" />
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
      <Card title="Prototype data" subtitle="Everything is stored in this browser until the PostgreSQL backend is connected" className="mt">
        <div className="btn-row">
          <button className="btn btn--ghost btn--danger-outline" onClick={() => window.confirm("Reset all data to the demo seed? This signs you out.") && resetDemo()}>
            <Icon name="refresh" size={15} /> Reset demo data
          </button>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Domains & roles ---------------- */

function DomainsRoles() {
  const { db, update, notify } = useStore();
  const [domainName, setDomainName] = useState("");
  const [editing, setEditing] = useState(null);
  const { domains, roles } = db.config;

  function addDomain(e) {
    e.preventDefault();
    const name = domainName.trim();
    if (!name || domains.some((d) => d.name.toLowerCase() === name.toLowerCase())) return;
    update((d) => { d.config.domains.push({ id: uid("dom"), name }); });
    setDomainName("");
    notify(`Domain "${name}" added`);
  }

  function removeDomain(id) {
    if (roles.some((r) => r.domainId === id)) return notify("Move or delete this domain's roles first", "bad");
    update((d) => { d.config.domains = d.config.domains.filter((x) => x.id !== id); });
  }

  function saveRole(role) {
    update((d) => {
      const i = d.config.roles.findIndex((r) => r.id === role.id);
      if (i >= 0) d.config.roles[i] = role;
      else d.config.roles.push({ ...role, id: uid("role") });
    });
    notify("Role saved — available to candidates now");
    setEditing(null);
  }

  return (
    <>
      <PageHeader kicker="Configuration" title="Domains & roles"
        actions={<button className="btn btn--primary" onClick={() => setEditing({ title: "", domainId: domains[0]?.id, skills: [] })}><Icon name="plus" size={16} /> New role</button>} />
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
                </div>
                <div className="chips">{r.skills.map((s) => <span className="chip" key={s.name}>{s.name}<Weight w={s.weight} /></span>)}</div>
                <div className="btn-row">
                  <button className="icon-btn icon-btn--sm" onClick={() => setEditing(r)} aria-label="Edit role"><Icon name="edit" size={15} /></button>
                  <button className="icon-btn icon-btn--sm" onClick={() => update((d) => { d.config.roles = d.config.roles.filter((x) => x.id !== r.id); })} aria-label="Delete role"><Icon name="trash" size={15} /></button>
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
  const [form, setForm] = useState(structuredClone(role));
  const [add, setAdd] = useState("");
  const [error, setError] = useState("");
  const available = db.config.skills.filter((s) => !form.skills.some((x) => x.name === s.name));
  return (
    <Modal open wide onClose={onClose} title={role.id ? "Edit role" : "New role"}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={() => (form.title.trim() && form.skills.length ? onSave({ ...form, title: form.title.trim() }) : setError("Add a title and at least one skill."))}>Save role</button></>}>
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
  const { db, update, notify } = useStore();
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const list = db.config.skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  function save(skill, originalName) {
    update((d) => {
      const i = d.config.skills.findIndex((s) => s.name === originalName);
      if (i >= 0) d.config.skills[i] = skill;
      else d.config.skills.push(skill);
    });
    notify("Skill saved");
    setEditing(null);
  }

  function remove(name) {
    const used = db.config.roles.some((r) => r.skills.some((s) => s.name === name)) || db.jobs.some((j) => j.skills.some((s) => s.name === name));
    if (used) return notify(`"${name}" is used by a role or job`, "bad");
    update((d) => {
      d.config.skills = d.config.skills.filter((s) => s.name !== name);
      d.config.questions = d.config.questions.filter((x) => x.skill !== name);
    });
  }

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
                <button className="icon-btn icon-btn--sm" onClick={() => remove(s.name)} aria-label="Delete"><Icon name="trash" size={15} /></button>
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
    onSave({ name: n, aliases: splitList(aliases.toLowerCase()), related, tip: tip.trim() }, skill.name);
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
  const { db, update, notify } = useStore();
  const [skill, setSkill] = useState("All");
  const [editing, setEditing] = useState(null);
  const list = db.config.questions.filter((q) => skill === "All" || q.skill === skill);

  function save(q) {
    update((d) => {
      const i = d.config.questions.findIndex((x) => x.id === q.id);
      if (i >= 0) d.config.questions[i] = q;
      else d.config.questions.push({ ...q, id: uid("q") });
    });
    notify("Question template saved");
    setEditing(null);
  }

  return (
    <>
      <PageHeader kicker="Configuration" title="Question templates" subtitle="Each template targets one skill. Key points feed technical accuracy; the follow-up is asked when an answer is incomplete."
        actions={<button className="btn btn--primary" onClick={() => setEditing({ skill: db.config.skills[0].name, type: "technical", text: "", keywords: [], followUp: "" })}><Icon name="plus" size={16} /> New template</button>} />
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
              <div className="chips"><span className="chip chip--brand">{q.skill}</span><span className="chip">{q.type === "behavioral" ? "Behavioural" : "Technical"}</span></div>
              <div className="btn-row">
                <button className="icon-btn icon-btn--sm" onClick={() => setEditing(q)} aria-label="Edit"><Icon name="edit" size={15} /></button>
                <button className="icon-btn icon-btn--sm" onClick={() => update((d) => { d.config.questions = d.config.questions.filter((x) => x.id !== q.id); })} aria-label="Delete"><Icon name="trash" size={15} /></button>
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
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={() => (form.text.trim().length < 10 ? setError("Write the question.") : onSave({ ...form, text: form.text.trim(), followUp: form.followUp.trim(), keywords: splitList(form.keywords.toLowerCase()) }))}>Save template</button></>}>
      <div className="form">
        <div className="form__grid">
          <div className="field"><label>Skill</label>
            <select className="select" value={form.skill} onChange={set("skill")}>{db.config.skills.map((s) => <option key={s.name}>{s.name}</option>)}</select>
          </div>
          <div className="field"><label>Type</label>
            <Segmented options={[{ value: "technical", label: "Technical" }, { value: "behavioral", label: "Behavioural" }]} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
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
  const { db, update, notify } = useStore();
  const { criteria, rules } = db.config;
  const setRule = (k, v) => update((d) => { d.config.rules[k] = v; });
  const setSuit = (k, v) => update((d) => { d.config.rules.suitability[k] = v; });
  const suitTotal = rules.suitability.cv + rules.suitability.interview + rules.suitability.consistency;

  return (
    <>
      <PageHeader kicker="Configuration" title="Criteria & rules" subtitle="The rubric used to score every answer and the rules behind weakness detection and employer suitability." />
      <div className="grid grid--split">
        <Card title="Evaluation criteria" subtitle="Weights in the answer score">
          <div className="crit-list">
            {criteria.map((c, i) => (
              <div className={`crit ${c.enabled ? "" : "is-off"}`} key={c.key}>
                <div className="crit__main">
                  <strong>{c.label}</strong>
                  <span>{c.appliesTo === "all" ? "All questions" : c.appliesTo === "technical" ? "Technical questions" : "Behavioural questions"}</span>
                </div>
                <Segmented options={[1, 2, 3].map((w) => ({ value: w, label: `×${w}` }))} value={c.weight} onChange={(w) => update((d) => { d.config.criteria[i].weight = w; })} />
                <label className="mini-switch" aria-label={`Enable ${c.label}`}>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => update((d) => { d.config.criteria[i].enabled = e.target.checked; })} />
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
          <Card title="Suitability weights" subtitle={`Total ${suitTotal}% ${suitTotal === 100 ? "" : "· normalised automatically"}`}>
            <NumberRule label="CV skill match" value={rules.suitability.cv} suffix="%" min={0} max={100} step={5} onChange={(v) => setSuit("cv", v)} />
            <NumberRule label="Interview evidence" value={rules.suitability.interview} suffix="%" min={0} max={100} step={5} onChange={(v) => setSuit("interview", v)} />
            <NumberRule label="Practice consistency" value={rules.suitability.consistency} suffix="%" min={0} max={100} step={5} onChange={(v) => setSuit("consistency", v)} />
            <button className="btn btn--text" onClick={() => { update((d) => { d.config.rules.suitability = { cv: 40, interview: 45, consistency: 15 }; }); notify("Weights reset"); }}>Reset to 40 / 45 / 15</button>
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
  const { db } = useStore();
  const [role, setRole] = useState("all");
  const list = db.users.filter((u) => role === "all" || u.role === role);
  return (
    <>
      <PageHeader kicker="Accounts" title="Users" subtitle="Role-based access: candidates, employers and administrators." />
      <div className="toolbar">
        <Segmented options={[{ value: "all", label: "All" }, { value: "candidate", label: "Candidates" }, { value: "employer", label: "Employers" }, { value: "admin", label: "Admins" }]} value={role} onChange={setRole} />
      </div>
      <Card>
        {list.length ? (
          <div className="table table--users" role="table">
            <div className="table__row table__row--head" role="row"><span>User</span><span>Role</span><span>Face login</span><span>Activity</span><span>Joined</span></div>
            {list.map((u) => (
              <div className="table__row" role="row" key={u.id}>
                <span className="user-cell"><span className="avatar avatar--sm">{initials(u.name)}</span><span><strong>{u.name}</strong><small>{u.email}</small></span></span>
                <span><span className={`role-pill role-pill--${u.role}`}>{u.role}</span></span>
                <span>{u.face?.template ? <span className="badge badge--good">Enrolled</span> : <span className="badge badge--muted">Not set</span>}</span>
                <span className="table__muted">
                  {u.role === "candidate" ? plural(db.sessions.filter((s) => s.userId === u.id).length, "session") : u.role === "employer" ? plural(db.jobs.filter((j) => j.employerId === u.id).length, "job") : "—"}
                </span>
                <span className="table__muted">{formatDate(u.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : <Empty icon="users" title="No users" text="Nobody in this group yet." />}
      </Card>
    </>
  );
}
