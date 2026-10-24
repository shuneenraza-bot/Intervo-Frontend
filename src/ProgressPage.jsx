import { useState } from "react";
import { Icon } from "./Icons";
import { average, formatDate, plural, scoreTone } from "./lib";
import { Card, Empty, LineChart, Meter, PageHeader, Sparkline, Stat } from "./ui";

export default function ProgressPage({ db, sessions, performance, go }) {
  const { rules, skills, criteria } = db.config;
  const [openId, setOpenId] = useState(null);
  const scores = sessions.map((s) => s.score);
  const weak = performance.filter((p) => p.weak);
  const improved = performance.filter((p) => p.scores.length > 1).sort((a, b) => b.trend - a.trend)[0];
  const chart = [...sessions].reverse().slice(-10).map((s) => ({ value: s.score, label: formatDate(s.date, { day: "numeric", month: "short" }) }));

  return (
    <>
      <PageHeader
        kicker="Skill-level history"
        title="Progress"
        subtitle={`A skill becomes a persistent weakness when its average stays below ${rules.weakThreshold}% across ${rules.weakMinSessions} or more sessions.`}
        actions={<button className="btn btn--primary" onClick={() => go("interview")}>Practise again <Icon name="arrowRight" size={16} /></button>}
      />

      <section className="stats">
        <Stat label="Sessions" value={sessions.length} hint="Completed practice rounds" icon="mic" accent="blue" />
        <Stat label="Average" value={sessions.length ? `${average(scores)}%` : "—"} hint="Across all sessions" icon="chart" accent="green" />
        <Stat label="Most improved" value={improved ? improved.skill : "—"} hint={improved ? `${improved.trend >= 0 ? "+" : ""}${improved.trend} points since first answer` : "Needs 2+ answers on a skill"} icon="trend" accent="violet" />
        <Stat label="Weaknesses" value={weak.length} hint={`${plural(performance.length, "skill")} tracked`} icon="target" accent="amber" />
      </section>

      <section className="grid grid--overview">
        <Card title="Session scores" subtitle="Latest 10 sessions">
          {chart.length ? <LineChart points={chart} threshold={rules.weakThreshold} /> : <Empty icon="chart" title="No sessions yet" text="Complete a mock interview to start your history." action="Start a session" onAction={() => go("interview")} />}
        </Card>
        <Card title="Weakness profile" subtitle="Prioritised in your next session">
          {weak.length ? (
            <ul className="coach-list">
              {weak.map((w) => (
                <li key={w.skill}>
                  <div className="coach-list__head">
                    <strong>{w.skill}</strong>
                    <span className="field__hint">{plural(w.sessions, "session")}</span>
                    <span className="pill pill--low">{w.avg}%</span>
                  </div>
                  <p>{skills.find((s) => s.name === w.skill)?.tip}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="checkCircle" title="No persistent weaknesses" text={performance.length ? "Every tracked skill is above the threshold or still collecting data." : "Weaknesses are detected once you have history."} />
          )}
        </Card>
      </section>

      <Card title="Skill performance" subtitle="Lowest average first" className="mt">
        {performance.length ? (
          <div className="table" role="table">
            <div className="table__row table__row--head" role="row">
              <span role="columnheader">Skill</span><span role="columnheader">Average</span><span role="columnheader">Trend</span><span role="columnheader">Sessions</span><span role="columnheader">Status</span>
            </div>
            {performance.map((p) => (
              <div className="table__row" role="row" key={p.skill}>
                <span role="cell" className="table__skill">{p.skill}</span>
                <span role="cell" className="table__avg"><Meter value={p.avg} tone={scoreTone(p.avg, rules.weakThreshold)} /><b>{p.avg}%</b></span>
                <span role="cell" className="table__trend">
                  <Sparkline values={p.scores} />
                  {p.scores.length > 1 && <small className={p.trend >= 0 ? "up" : "down"}>{p.trend >= 0 ? "+" : ""}{p.trend}</small>}
                </span>
                <span role="cell">{p.sessions}</span>
                <span role="cell">
                  {p.weak ? <span className="badge badge--warn">Weakness</span> : p.sessions < rules.weakMinSessions ? <span className="badge badge--muted">Collecting</span> : <span className="badge badge--good">On track</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="layers" title="No skills tracked yet" text="Your per-skill scores appear after your first session." />
        )}
      </Card>

      <Card title="Session history" subtitle={plural(sessions.length, "session")} className="mt">
        {sessions.length ? (
          <ul className="history">
            {sessions.map((s) => {
              const open = openId === s.id;
              return (
                <li key={s.id} className={open ? "is-open" : ""}>
                  <button className="history__row" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>
                    <span className="session-list__icon"><Icon name={s.mode === "video" ? "video" : s.mode === "voice" ? "mic" : "message"} size={16} /></span>
                    <div>
                      <strong>{s.roleTitle}</strong>
                      <span>{formatDate(s.date)} · {plural(s.answers.length, "question")} · {s.mode} mode</span>
                    </div>
                    <span className={`pill pill--${scoreTone(s.score, rules.weakThreshold)}`}>{s.score}%</span>
                    <Icon name="chevronRight" size={16} className="history__chev" />
                  </button>
                  {open && (
                    <div className="history__detail">
                      {s.answers.map((a, i) => (
                        <div key={i} className="history__answer">
                          <div className="history__answer-main">
                            <div className="chips"><span className="chip">{a.skill}</span>{a.followUp && <span className="chip chip--fair">Follow-up</span>}</div>
                            <p>{a.question}</p>
                            <div className="breakdown__criteria">
                              {criteria.filter((c) => a.criteria?.[c.key] !== undefined).map((c) => <span key={c.key}>{c.label} <b>{a.criteria[c.key]}</b></span>)}
                            </div>
                          </div>
                          <b className={`score-text score-text--${scoreTone(a.score, rules.weakThreshold)}`}>{a.score}%</b>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon="clock" title="No sessions yet" text="Completed sessions are listed here." />
        )}
      </Card>
    </>
  );
}
