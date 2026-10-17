import { useMemo } from "react";
import { Icon } from "./Icons";
import { useCandidateData, useStore } from "./store";
import { matchSkills, skillPerformance } from "./lib";
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
  const performance = useMemo(() => skillPerformance(sessions, db.config.rules), [sessions, db.config.rules]);
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
      <strong>{weakCount ? `${weakCount} weak skill${weakCount > 1 ? "s" : ""} to work on` : "Ready for a quick round?"}</strong>
      <p>{weakCount ? "Your next session starts with them automatically." : "Five questions, about ten minutes. Weak skills come first."}</p>
      <button className="btn btn--primary btn--sm" onClick={() => go("interview")}>Start practice <Icon name="arrowRight" size={14} /></button>
    </div>
  );
}
