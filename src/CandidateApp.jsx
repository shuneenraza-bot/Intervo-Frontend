import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useCandidateData, useStore } from "./store";
import { matchSkills, plural, skillPerformance } from "./lib";
import * as api from "./api";
import Overview from "./Overview";
import CVPage from "./CVPage";
import JobsPage from "./JobsPage";
import InterviewPage from "./InterviewPage";
import ProgressPage from "./ProgressPage";
import ProfilePage from "./ProfilePage";

/** Candidate portal: derives shared data once and hands it to each page. */
export default function CandidateApp({ page, go }) {
  const { db, user } = useStore();
  const { sessions, profile, applications } = useCandidateData(user.id);

  // Refresh this candidate's sessions into the store (a no-op read in local mode). With the candidate
  // module it also reloads the server's skill history, and again whenever the candidate changes page
  // (that is how a session finished on the interview page shows up in Overview and Progress).
  const remote = api.uses("candidate");
  const refreshKey = remote ? page : null;
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    api.getSessions(user.id).catch((e) => console.warn("Couldn't load sessions:", e.message));
    api.getProgress().then((p) => p && setProgress(p)).catch((e) => console.warn("Couldn't load progress:", e.message));
  }, [user.id, refreshKey]);
  // The saved CV is read once per sign-in.
  useEffect(() => {
    api.loadSavedCV().catch((e) => console.warn("Couldn't load your CV:", e.message));
  }, [user.id]);
  const localPerformance = useMemo(() => skillPerformance(sessions, db.config.rules), [sessions, db.config.rules]);
  const performance = remote ? progress?.skills ?? [] : localPerformance;
  const targetRole = db.config.roles.find((r) => r.id === profile.roleId) || db.config.roles[0];
  const gap = useMemo(() => profile.result || (profile.skills?.length ? matchSkills(profile.skills, targetRole.skills, db.config.skills) : null), [profile, targetRole, db.config.skills]);

  const ctx = { user, db, sessions, profile, applications, performance, targetRole, gap, go };

  return (
    <>
      {page === "overview" && <Overview {...ctx} />}
      {page === "cv" && <CVPage {...ctx} />}
      {page === "jobs" && <JobsPage {...ctx} />}
      {page === "interview" && <InterviewPage {...ctx} />}
      {page === "progress" && <ProgressPage {...ctx} />}
      {page === "profile" && <ProfilePage {...ctx} />}
    </>
  );
}

export function CandidatePromo({ go, weakCount }) {
  return (
    <div className="sidebar__promo">
      <span className="sidebar__promo-icon"><Icon name="sparkle" size={16} /></span>
      <strong>{weakCount ? `${plural(weakCount, "weak skill")} to work on` : "Ready for a quick round?"}</strong>
      <p>{weakCount ? "Your next session starts with them automatically." : "Five questions, about ten minutes. Weak skills come first."}</p>
      <button className="btn btn--primary btn--sm" onClick={() => go("interview")}>Start practice <Icon name="arrowRight" size={14} /></button>
    </div>
  );
}
