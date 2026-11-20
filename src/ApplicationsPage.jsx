import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { formatDate } from "./lib";
import * as api from "./api";
import { Card, Empty, Modal, Note, PageHeader } from "./ui";

const STATUS_LABEL = {
  applied: "Applied",
  shortlisted: "Waiting for your response",
  accepted: "Accepted",
  declined_by_candidate: "Declined",
  not_progressing: "Not progressing",
};
const BADGE = { applied: "muted", shortlisted: "warn", accepted: "good", declined_by_candidate: "low", not_progressing: "muted" };

/** Applied → Shortlisted → Accepted / Declined. A stopped application stays at "Applied". */
function steps(status) {
  const third = status === "accepted" ? ["Accepted", "is-done"] : status === "declined_by_candidate" ? ["Declined", "is-declined"] : ["Your decision", ""];
  const second = status === "applied" || status === "not_progressing" ? ["Shortlisted", ""] : ["Shortlisted", status === "shortlisted" ? "is-current" : "is-done"];
  const first = ["Applied", status === "applied" ? "is-current" : "is-done"];
  return [first, second, third];
}

export default function ApplicationsPage({ go }) {
  const { db, notify } = useStore();
  const remote = api.uses("employer");
  const [fetched, setFetched] = useState(null);
  const [asking, setAsking] = useState(null); // { app, decision }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const local = useMemo(() => api.getMyApplicationsSync(db), [db]);
  const apps = remote ? fetched : local;

  const load = useCallback(() => {
    if (remote) api.getMyApplications().then(setFetched).catch((e) => notify(e.message, "bad"));
  }, [remote, notify]);
  useEffect(load, [load]);

  function ask(app, decision) {
    setAsking({ app, decision });
    setNote("");
  }

  async function confirm() {
    const { app, decision } = asking;
    setBusy(true);
    try {
      await api.respondToApplication(app.id, decision, note);
      notify(decision === "accept" ? `You accepted — ${app.company} can now contact you` : "You declined this shortlist");
      setAsking(null);
    } catch (e) {
      notify(e.message, "bad");
      setAsking(null);
    } finally {
      setBusy(false);
      load(); // a failed answer (already answered, say) shows the real status
    }
  }

  const accepting = asking?.decision === "accept";

  return (
    <>
      <PageHeader kicker="Applications" title="My Applications" subtitle="Where each application stands. When an employer shortlists you, you decide whether to share your contact details." />

      {apps === null ? (
        <Card><p className="muted">Loading your applications…</p></Card>
      ) : apps.length ? (
        <div className="app-list">
          {apps.map((app) => (
            <Card key={app.id} className="app-card">
              <div className="app-card__head">
                <div>
                  <h3>{app.jobTitle}</h3>
                  <p className="muted">{app.company} · Applied {formatDate(app.appliedAt)}</p>
                </div>
                <span className={`badge badge--${BADGE[app.status]}`}>{STATUS_LABEL[app.status]}</span>
              </div>

              <ol className="stepper stepper--card" aria-label="Application progress">
                {steps(app.status).map(([label, state]) => (
                  <li key={label} className={`stepper__item ${state}`}>
                    <span>{state === "is-done" ? <Icon name="check" size={12} strokeWidth={2.8} /> : state === "is-declined" ? <Icon name="x" size={12} strokeWidth={2.8} /> : null}</span>
                    {label}
                  </li>
                ))}
              </ol>
              {app.status === "not_progressing" && <p className="field__hint">The employer isn't moving forward with this application.</p>}

              {app.employerMessage && (
                <blockquote className="app-quote"><small>Message from {app.company}</small>{app.employerMessage}</blockquote>
              )}
              {app.candidateNote && (
                <blockquote className="app-quote app-quote--you"><small>Your note</small>{app.candidateNote}</blockquote>
              )}

              {app.status === "shortlisted" && (
                <div className="app-card__actions">
                  <p className="field__hint">Accepting shares your name, email and phone number (from your CV, if you have one) with {app.company}. Declining shares nothing.</p>
                  <div className="btn-row">
                    <button className="btn btn--primary" onClick={() => ask(app, "accept")}><Icon name="check" size={15} /> Accept</button>
                    <button className="btn btn--ghost btn--danger-outline" onClick={() => ask(app, "decline")}>Decline</button>
                  </div>
                </div>
              )}

              {app.status === "accepted" && app.employer && (
                <div className="contact-card">
                  <h4><Icon name="building" size={15} /> {app.company} contact</h4>
                  <ul>
                    <li><Icon name="user" size={15} /> {app.employer.name}</li>
                    {app.employer.company && <li><Icon name="building" size={15} /> {app.employer.company}</li>}
                    <li><Icon name="mail" size={15} /> <a href={`mailto:${app.employer.email}`}>{app.employer.email}</a></li>
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card><Empty icon="clipboard" title="No applications yet" text="Apply to a job and its progress will show up here." action="Browse jobs" onAction={() => go("jobs")} /></Card>
      )}
      <Note>Employers only see your contact details after you accept a shortlist. Interview results are never shared.</Note>

      <Modal
        open={!!asking}
        title={accepting ? "Accept this shortlist?" : "Decline this shortlist?"}
        subtitle={asking ? `${asking.app.jobTitle} · ${asking.app.company}` : ""}
        onClose={() => !busy && setAsking(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setAsking(null)} disabled={busy}>Cancel</button>
            <button className={`btn ${accepting ? "btn--primary" : "btn--danger-solid"}`} onClick={confirm} disabled={busy}>
              {busy ? "Sending…" : accepting ? "Yes, accept" : "Yes, decline"}
            </button>
          </>
        }
      >
        <p>{accepting
          ? `${asking?.app.company} will see your name, email and phone number, and you'll see theirs. You can't change this answer afterwards.`
          : "No contact details will be shared and the employer is told you declined. You can't change this answer afterwards."}</p>
        <div className="field">
          <label htmlFor="resp-note">Note to the employer (optional)</label>
          <textarea id="resp-note" rows={3} maxLength={500} data-lenis-prevent value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="field__hint">{note.length}/500</span>
        </div>
      </Modal>
    </>
  );
}
