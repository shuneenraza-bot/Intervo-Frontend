import { Icon } from "./Icons";
import { average, firstName, formatDate, plural, scoreTone } from "./lib";
import { Card, Empty, LineChart, Meter, PageHeader, ScoreRing, Stat } from "./ui";

export default function Overview({ user, db, sessions, profile, applications, performance, gap, go }) {
  const { rules } = db.config;
  const overall = average(sessions.map((s) => s.score));
  const weak = performance.filter((p) => p.weak);
  const [last, prev] = sessions;
  const delta = last && prev ? last.score - prev.score : null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const steps = [
    { done: !!user.face?.template, title: "Enrol your face for secure login", page: "profile" },
    { done: !!profile.result, title: "Analyse your CV against a target role", page: "cv" },
    { done: sessions.length > 0, title: "Complete your first mock interview", page: "interview" },
    { done: sessions.length >= rules.weakMinSessions, title: `Reach ${plural(rules.weakMinSessions, "session")} to detect weaknesses`, page: "interview" },
    { done: applications.length > 0, title: "Apply to a job and share your results", page: "jobs" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const chartPoints = [...sessions].reverse().slice(-8).map((s) => ({ value: s.score, label: formatDate(s.date, { day: "numeric", month: "short" }) }));

  return (
    <>
      <PageHeader
        kicker={`${greeting}, ${firstName(user.name)}`}
        title="Your interview readiness"
        subtitle="CV analysis, practice sessions and the skills that need attention, in one place."
        actions={<button className="btn btn--primary" onClick={() => go("interview")}>Start mock interview <Icon name="arrowRight" size={16} /></button>}
      />

      <section className="hero-card">
        <div className="hero-card__score">
          <ScoreRing value={sessions.length ? overall : null} size={132} stroke={11} label="avg score" />
        </div>
        <div className="hero-card__body">
          <span className="badge badge--brand">{sessions.length ? `${plural(sessions.length, "session")} recorded` : "No sessions yet"}</span>
          <h2>
            {!sessions.length && "Let's get your baseline."}
            {sessions.length > 0 && !weak.length && "You're building a solid foundation."}
            {weak.length > 0 && `${plural(weak.length, "skill")} ${weak.length === 1 ? "needs" : "need"} focused practice.`}
          </h2>
          <p>
            {!sessions.length
              ? "Run a short practice session and Intervo starts tracking your performance skill by skill."
              : weak.length
              ? `${weak.map((w) => w.skill).join(", ")} stayed below ${rules.weakThreshold}% across ${rules.weakMinSessions}+ ${rules.weakMinSessions === 1 ? "session" : "sessions"}. Your next session starts with ${weak.length > 1 ? "them" : "it"}.`
              : "No persistent weaknesses detected yet. Keep practising to strengthen your history."}
          </p>
          <div className="hero-card__actions">
            <button className="btn btn--primary" onClick={() => go("interview")}>{weak.length ? "Practise weak skills" : "Practise now"} <Icon name="arrowRight" size={16} /></button>
            <button className="btn btn--ghost" onClick={() => go("progress")}>View skill history</button>
          </div>
        </div>
        <div className="hero-card__steps">
          <div className="hero-card__steps-head"><span>Getting started</span><b>{doneCount}/{steps.length}</b></div>
          <Meter value={(doneCount / steps.length) * 100} tone="brand" />
          <ul>
            {steps.map((s) => (
              <li key={s.title} className={s.done ? "is-done" : ""}>
                <button onClick={() => go(s.page)}>
                  <span className="step-check">{s.done && <Icon name="check" size={12} strokeWidth={2.6} />}</span>
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="stats">
        <Stat label="Sessions" value={sessions.length} hint="Practice rounds completed" icon="mic" accent="blue" />
        <Stat label="Last score" value={last ? `${last.score}%` : "—"} hint={delta === null ? "Two sessions needed to compare" : `${delta >= 0 ? "+" : ""}${delta} vs previous session`} icon="trend" accent="green" />
        <Stat label="CV match" value={gap ? `${gap.percentage}%` : "—"} hint={profile.result ? profile.result.roleTitle : "Run a skill-gap analysis"} icon="target" accent="violet" />
        <Stat label="Weak skills" value={weak.length} hint={`Below ${rules.weakThreshold}% in ${rules.weakMinSessions}+ sessions`} icon="alert" accent="amber" />
      </section>

      <section className="grid grid--overview">
        <Card title="Score trend" subtitle="Your last sessions against the weakness threshold" action={<button className="btn btn--text" onClick={() => go("progress")}>Details <Icon name="arrowRight" size={14} /></button>}>
          {chartPoints.length ? <LineChart points={chartPoints} threshold={rules.weakThreshold} /> : <Empty icon="chart" title="No sessions yet" text="Your score trend appears after the first mock interview." action="Start practising" onAction={() => go("interview")} />}
        </Card>

        <Card title="Coaching focus" subtitle="Persistent weaknesses and how to fix them">
          {weak.length ? (
            <ul className="coach-list">
              {weak.slice(0, 3).map((w) => (
                <li key={w.skill}>
                  <div className="coach-list__head">
                    <strong>{w.skill}</strong>
                    <span className={`pill pill--${scoreTone(w.avg, rules.weakThreshold)}`}>{w.avg}%</span>
                  </div>
                  <p>{db.config.skills.find((s) => s.name === w.skill)?.tip || "Practise this skill with a concrete project example."}</p>
                </li>
              ))}
            </ul>
          ) : performance.length ? (
            <div className="skill-list">
              {performance.slice(0, 5).map((p) => (
                <div className="skill-row" key={p.skill}>
                  <div className="skill-row__name"><span>{p.skill}</span></div>
                  <Meter value={p.avg} />
                  <b className={`score-text score-text--${scoreTone(p.avg)}`}>{p.avg}%</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="target" title="Nothing flagged yet" text={`Skills are flagged after ${plural(rules.weakMinSessions, "session")} below ${rules.weakThreshold}%.`} />
          )}
        </Card>
      </section>

      <Card title="Recent sessions" subtitle="Latest practice activity" className="mt" action={sessions.length > 0 && <button className="btn btn--text" onClick={() => go("progress")}>All sessions <Icon name="arrowRight" size={14} /></button>}>
        {sessions.length ? (
          <ul className="session-list">
            {sessions.slice(0, 4).map((s) => (
              <li key={s.id}>
                <span className="session-list__icon"><Icon name={s.mode === "video" ? "video" : s.mode === "voice" ? "mic" : "message"} size={16} /></span>
                <div>
                  <strong>{s.roleTitle}</strong>
                  <span>{formatDate(s.date)} · {plural(s.answers.length, "question")} · {s.mode} mode</span>
                </div>
                <span className={`pill pill--${scoreTone(s.score, rules.weakThreshold)}`}>{s.score}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="clock" title="Nothing here yet" text="Sessions you complete will be listed here." />
        )}
      </Card>
    </>
  );
}
