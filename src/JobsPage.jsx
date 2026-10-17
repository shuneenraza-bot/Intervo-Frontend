import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { matchSkills, timeAgo, uid, initials } from "./lib";
import { Card, Empty, Meter, Modal, PageHeader, Segmented } from "./ui";

export default function JobsPage({ user, db, profile, applications, go }) {
  const { update, notify } = useStore();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("All");
  const [show, setShow] = useState("all");
  const [applying, setApplying] = useState(null);
  const [consent, setConsent] = useState(true);
  const skills = profile.skills || [];
  const saved = profile.savedJobs || [];
  const appliedIds = applications.map((a) => a.jobId);

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.jobs
      .filter((j) => j.status === "open")
      .map((j) => ({ ...j, match: skills.length ? matchSkills(skills, j.skills, db.config.skills) : null }))
      .filter((j) => level === "All" || j.level === level)
      .filter((j) => show === "all" || (show === "saved" ? saved.includes(j.id) : appliedIds.includes(j.id)))
      .filter((j) => !q || `${j.title} ${j.company} ${j.location} ${j.skills.map((s) => s.name).join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => (b.match?.percentage ?? 0) - (a.match?.percentage ?? 0));
  }, [db.jobs, db.config.skills, skills, level, show, saved, appliedIds, query]);

  function toggleSave(id) {
    const on = !saved.includes(id);
    update((d) => {
      const p = (d.profiles[user.id] ??= {});
      p.savedJobs = on ? [...(p.savedJobs || []), id] : (p.savedJobs || []).filter((x) => x !== id);
    });
    notify(on ? "Saved to your shortlist" : "Removed from shortlist");
  }

  function apply() {
    update((d) => {
      d.applications.push({ id: uid("app"), jobId: applying.id, candidateId: user.id, date: Date.now(), consent });
      if (consent) d.profiles[user.id] = { ...d.profiles[user.id], shareWithEmployers: true };
    });
    notify(consent ? `Applied — ${applying.company} can now see your results` : "Application sent without sharing results");
    setApplying(null);
  }

  function withdraw(jobId) {
    update((d) => { d.applications = d.applications.filter((a) => !(a.jobId === jobId && a.candidateId === user.id)); });
    notify("Application withdrawn");
  }

  return (
    <>
      <PageHeader kicker="Opportunities" title="Job matches" subtitle={skills.length ? "Ranked by weighted match with the skills from your CV analysis." : "Run a CV analysis to see your match on every role."} />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={17} />
          <input placeholder="Search role, company, city or skill" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search jobs" />
          {query && <button className="icon-btn icon-btn--sm" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="x" size={15} /></button>}
        </div>
        <Segmented label="Level" options={["All", "Entry level", "Internship"]} value={level} onChange={setLevel} />
        <Segmented label="Show" options={[{ value: "all", label: "All" }, { value: "saved", label: `Saved ${saved.length}` }, { value: "applied", label: `Applied ${appliedIds.length}` }]} value={show} onChange={setShow} />
      </div>

      {!skills.length && (
        <div className="banner">
          <Icon name="info" size={18} />
          <span>Match scores need your skills.</span>
          <button className="btn btn--text" onClick={() => go("cv")}>Analyse CV <Icon name="arrowRight" size={14} /></button>
        </div>
      )}

      <div className="jobs">
        {jobs.map((job, i) => {
          const isSaved = saved.includes(job.id);
          const applied = appliedIds.includes(job.id);
          return (
            <article className="job" key={job.id}>
              <div className="job__head">
                <span className="job__logo" data-tone={i % 4}>{initials(job.company)}</span>
                <div className="job__title"><h3>{job.title}</h3><p>{job.company}</p></div>
                <button className={`icon-btn job__save ${isSaved ? "is-saved" : ""}`} onClick={() => toggleSave(job.id)} aria-pressed={isSaved} aria-label={isSaved ? "Remove from saved" : "Save job"}>
                  <Icon name="bookmark" size={17} filled={isSaved} />
                </button>
              </div>
              <div className="job__meta">
                <span><Icon name="pin" size={14} /> {job.location}</span>
                <span><Icon name="building" size={14} /> {job.mode}</span>
                <span><Icon name="clock" size={14} /> {timeAgo(job.createdAt)}</span>
              </div>
              <p className="job__desc">{job.description}</p>
              <div className="chips">
                {job.skills.map((s) => {
                  const has = skills.includes(s.name);
                  const part = job.match?.partial.some((p) => p.name === s.name);
                  return <span key={s.name} className={`chip ${has ? "chip--good" : part ? "chip--fair" : ""}`}>{has && <Icon name="check" size={11} strokeWidth={2.6} />} {s.name}</span>;
                })}
              </div>
              <div className="job__foot">
                {job.match ? (
                  <div className="job__match"><Meter value={job.match.percentage} /><span><b>{job.match.percentage}%</b> match</span></div>
                ) : (
                  <span className="badge badge--muted">{job.level} · {job.type}</span>
                )}
                {applied ? (
                  <div className="job__applied">
                    <span className="badge badge--good"><Icon name="check" size={12} strokeWidth={2.6} /> Applied</span>
                    <button className="btn btn--text" onClick={() => withdraw(job.id)}>Withdraw</button>
                  </div>
                ) : (
                  <button className="btn btn--primary btn--sm" onClick={() => { setApplying(job); setConsent(true); }}>Apply <Icon name="arrowRight" size={14} /></button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!jobs.length && <Card><Empty icon="search" title="No roles found" text="Try a different search term or clear the filters." /></Card>}

      <Modal
        open={!!applying}
        onClose={() => setApplying(null)}
        title={`Apply to ${applying?.title}`}
        subtitle={applying?.company}
        footer={<><button className="btn btn--ghost" onClick={() => setApplying(null)}>Cancel</button><button className="btn btn--primary" onClick={apply}>Submit application <Icon name="arrowRight" size={15} /></button></>}
      >
        {applying && (
          <>
            <p className="muted">The employer will see a suitability score built from three factors. Nothing is shared unless you agree.</p>
            <ul className="share-list">
              <li><Icon name="file" size={16} /> Skills from your CV analysis</li>
              <li><Icon name="mic" size={16} /> Per-skill interview scores (not your raw answers)</li>
              <li><Icon name="chart" size={16} /> Number of sessions and improvement trend</li>
            </ul>
            <label className="check check--box">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="check__box"><Icon name="check" size={12} strokeWidth={2.6} /></span>
              <span>I agree to share this evidence with <b>{applying.company}</b>. I can withdraw at any time from Profile & Privacy.</span>
            </label>
            {!consent && <p className="field__hint">Without consent the employer only sees that you applied.</p>}
          </>
        )}
      </Modal>
    </>
  );
}
