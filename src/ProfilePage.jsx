import { useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { formatDate, initials } from "./lib";
import { Card, Modal, PageHeader, Switch } from "./ui";
import { FaceCapture } from "./Camera";

export default function ProfilePage({ user, db, profile, sessions, applications }) {
  const { update, notify, logout } = useStore();
  const [name, setName] = useState(user.name);
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // "history" | "account"

  function saveName(e) {
    e.preventDefault();
    if (name.trim().length < 3) return;
    update((d) => { d.users.find((u) => u.id === user.id).name = name.trim(); });
    notify("Profile updated");
  }

  function setShare(on) {
    update((d) => { d.profiles[user.id] = { ...d.profiles[user.id], shareWithEmployers: on }; });
    notify(on ? "Employers you apply to can see your results" : "Sharing paused for all employers");
  }

  function toggleConsent(appId, on) {
    update((d) => { d.applications.find((a) => a.id === appId).consent = on; });
  }

  function exportData() {
    const data = { user: { ...user, passwordHash: undefined, face: user.face ? { enrolledAt: user.face.enrolledAt } : null }, profile, sessions, applications };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "intervo-my-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doDelete() {
    if (confirm === "history") {
      update((d) => { d.sessions = d.sessions.filter((s) => s.userId !== user.id); });
      notify("Interview history deleted");
    } else {
      update((d) => {
        d.sessions = d.sessions.filter((s) => s.userId !== user.id);
        d.applications = d.applications.filter((a) => a.candidateId !== user.id);
        delete d.profiles[user.id];
        d.users = d.users.filter((u) => u.id !== user.id);
      });
      logout();
    }
    setConfirm(null);
  }

  return (
    <>
      <PageHeader kicker="Account" title="Profile & privacy" subtitle="Control your face login, what employers can see, and the data Intervo keeps about you." />

      <div className="grid grid--split">
        <div className="stack">
          <Card title="Account">
            <div className="profile-head">
              <span className="avatar avatar--lg">{initials(user.name)}</span>
              <div><strong>{user.name}</strong><span>{user.email}</span><span>Member since {formatDate(user.createdAt)}</span></div>
            </div>
            <form className="form form--inline" onSubmit={saveName}>
              <div className="field">
                <label htmlFor="pname">Display name</label>
                <div className="input"><Icon name="user" size={17} /><input id="pname" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              <button className="btn btn--ghost" type="submit" disabled={name.trim() === user.name}>Save</button>
            </form>
          </Card>

          <Card title="Employer visibility" subtitle="Candidate-consented evidence only">
            <Switch checked={profile.shareWithEmployers !== false} onChange={setShare} label="Share results with employers I apply to" description="Turning this off hides your suitability evidence from every employer at once." />
            <div className="consent-list">
              <span className="field__hint">Per application</span>
              {applications.length ? applications.map((a) => {
                const job = db.jobs.find((j) => j.id === a.jobId);
                return (
                  <Switch key={a.id} checked={a.consent} onChange={(on) => toggleConsent(a.id, on)} label={job ? `${job.title} · ${job.company}` : "Removed job"} description={`Applied ${formatDate(a.date)}`} />
                );
              }) : <p className="muted">You haven't applied to any jobs yet.</p>}
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Face verification" subtitle="Second step at every sign-in">
            <div className={`face-status ${user.face?.template ? "is-on" : ""}`}>
              <span className="face-status__icon"><Icon name={user.face?.template ? "shield" : "scan"} size={22} /></span>
              <div>
                <strong>{user.face?.template ? "Enabled" : "Not set up"}</strong>
                <span>{user.face?.template ? `Template enrolled ${formatDate(user.face.enrolledAt)}` : "Sign-in currently uses your password only."}</span>
                {user.lastLogin && <span>Last sign-in: {formatDate(user.lastLogin.at)} via {user.lastLogin.method.replace(/\+/g, " + ")}</span>}
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn--primary btn--sm" onClick={() => setEnrolOpen(true)}><Icon name="scan" size={15} /> {user.face?.template ? "Re-enrol face" : "Set up face login"}</button>
              {user.face?.template && (
                <button className="btn btn--ghost btn--sm" onClick={() => { update((d) => { d.users.find((u) => u.id === user.id).face = null; }); notify("Face template deleted"); }}>
                  Delete template
                </button>
              )}
            </div>
            <p className="field__hint">Only a numeric template is stored — never your photo.</p>
          </Card>

          <Card title="Your data" subtitle="Retention and deletion">
            <ul className="data-list">
              <li><span>Interview sessions</span><b>{sessions.length}</b></li>
              <li><span>Answers stored</span><b>{sessions.reduce((n, s) => n + s.answers.length, 0)}</b></li>
              <li><span>Applications</span><b>{applications.length}</b></li>
              <li><span>CV on file</span><b>{profile.fileName || "None"}</b></li>
            </ul>
            <div className="btn-row">
              <button className="btn btn--ghost btn--sm" onClick={exportData}><Icon name="upload" size={15} /> Download my data</button>
              <button className="btn btn--ghost btn--sm btn--danger-outline" onClick={() => setConfirm("history")} disabled={!sessions.length}>Delete history</button>
              <button className="btn btn--ghost btn--sm btn--danger-outline" onClick={() => setConfirm("account")}>Delete account</button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={enrolOpen} onClose={() => setEnrolOpen(false)} title="Face enrolment" subtitle="Centre your face in the oval with even lighting">
        {enrolOpen && (
          <FaceCapture
            mode="enroll"
            onComplete={({ template }) => {
              update((d) => { d.users.find((u) => u.id === user.id).face = { template, enrolledAt: Date.now() }; });
              setEnrolOpen(false);
              notify("Face login enabled");
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "account" ? "Delete your account?" : "Delete interview history?"}
        footer={<><button className="btn btn--ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn--danger-solid" onClick={doDelete}>Delete permanently</button></>}
      >
        <p className="muted">
          {confirm === "account"
            ? "Your account, face template, CV analysis, sessions and applications will be removed. This cannot be undone."
            : `All ${sessions.length} sessions and your per-skill history will be removed. Weakness detection starts again from zero.`}
        </p>
      </Modal>
    </>
  );
}
