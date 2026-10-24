/*
 * Seed database for the frontend prototype.
 *
 * Everything the proposal calls "database-driven configuration" (domains, job roles,
 * skills, question templates, evaluation criteria and scoring rules) lives in
 * `config` and is editable from the Admin panel. When the FastAPI + PostgreSQL
 * backend is ready, these become the Domain / JobRole / Skill / QuestionTemplate /
 * EvaluationCriteria tables and this file is replaced by API calls.
 */

export const DB_VERSION = 4;

/* ---------------- Configuration ---------------- */

const domains = [
  { id: "tech", name: "Technology" },
  { id: "business", name: "Business" },
  { id: "marketing", name: "Marketing" },
  { id: "hrfin", name: "HR & Finance" },
];

const skills = [
  { name: "React", aliases: ["react", "reactjs", "react.js"], related: ["JavaScript"], tip: "Practise explaining state, props and component re-renders with a small example." },
  { name: "JavaScript", aliases: ["javascript", "js", "es6"], related: ["TypeScript", "React"], tip: "Review scope, closures and async/await, then explain each out loud in two sentences." },
  { name: "TypeScript", aliases: ["typescript", "ts"], related: ["JavaScript"], tip: "Be ready to explain why types catch bugs earlier, with one real example." },
  { name: "HTML", aliases: ["html", "html5", "semantic html"], related: ["CSS"], tip: "Mention semantic tags and accessibility when describing page structure." },
  { name: "CSS", aliases: ["css", "css3", "tailwind", "bootstrap", "sass", "flexbox", "grid"], related: ["HTML"], tip: "Explain responsive layouts with flexbox/grid and media queries step by step." },
  { name: "Git", aliases: ["git", "github", "version control", "pull request"], related: [], tip: "Describe your branch → commit → pull request → review flow in order." },
  { name: "REST APIs", aliases: ["api", "apis", "rest", "restful", "endpoint", "fastapi"], related: ["Node.js", "Python"], tip: "Use one concrete endpoint example and mention status codes and validation." },
  { name: "SQL", aliases: ["sql", "postgresql", "mysql", "query", "database"], related: ["Data analysis"], tip: "Walk through a query with GROUP BY and a JOIN, and say why indexes matter." },
  { name: "Python", aliases: ["python", "pandas", "django", "flask"], related: ["REST APIs"], tip: "Explain error handling with try/except and give a file-reading example." },
  { name: "Node.js", aliases: ["node", "nodejs", "node.js", "express"], related: ["JavaScript", "REST APIs"], tip: "Explain the event loop in simple words and when async matters." },
  { name: "Testing", aliases: ["testing", "jest", "unit test", "unit testing", "qa", "pytest"], related: [], tip: "Give an example of a unit test: what you test, the input, and the expected result." },
  { name: "Figma", aliases: ["figma", "ui/ux", "prototyping", "wireframe", "wireframes"], related: [], tip: "Describe how you move from wireframe to prototype and gather feedback." },
  { name: "Communication", aliases: ["communication", "presentation", "explain", "stakeholder"], related: ["Teamwork"], tip: "Answer in three parts: headline, one example, the result. Keep sentences short." },
  { name: "Teamwork", aliases: ["teamwork", "collaboration", "team", "collaborative"], related: ["Communication", "Leadership"], tip: "Pick a team conflict story and practise it in STAR format." },
  { name: "Problem solving", aliases: ["problem solving", "problem-solving", "analytical", "debugging", "root cause"], related: [], tip: "Show your steps: understand, break down, try, verify. Name the result." },
  { name: "Excel", aliases: ["excel", "spreadsheets", "vlookup", "pivot"], related: ["Data analysis"], tip: "Prepare a pivot-table or lookup example from a real report you made." },
  { name: "Data analysis", aliases: ["data analysis", "analytics", "power bi", "tableau", "insights"], related: ["Excel", "SQL"], tip: "Structure answers as question → data → finding → recommendation." },
  { name: "Leadership", aliases: ["leadership", "mentoring", "lead", "led"], related: ["Teamwork"], tip: "Prepare one story where you took ownership and what changed because of it." },
  { name: "Marketing", aliases: ["marketing", "seo", "social media", "campaign", "campaigns", "engagement"], related: ["Data analysis"], tip: "Always connect campaigns to a measurable goal like reach, CTR or conversions." },
  { name: "Recruitment", aliases: ["recruitment", "talent acquisition", "sourcing", "onboarding", "screening candidates"], related: ["Communication"], tip: "Explain a hiring pipeline stage by stage and how you measure quality of hire." },
  { name: "Accounting", aliases: ["accounting", "bookkeeping", "ledger", "reconciliation", "financial statements"], related: ["Excel"], tip: "Walk through a reconciliation example and how you find discrepancies." },
];

const roles = [
  { id: "frontend", title: "Frontend Developer", domainId: "tech", skills: [["React", 3], ["JavaScript", 3], ["CSS", 2], ["HTML", 2], ["Git", 1], ["Testing", 1], ["Communication", 1]] },
  { id: "backend", title: "Backend Developer", domainId: "tech", skills: [["Python", 3], ["SQL", 3], ["REST APIs", 3], ["Git", 1], ["Testing", 2], ["Problem solving", 2]] },
  { id: "analyst", title: "Business Analyst", domainId: "business", skills: [["Data analysis", 3], ["Excel", 3], ["SQL", 2], ["Communication", 3], ["Problem solving", 2]] },
  { id: "marketing", title: "Marketing Associate", domainId: "marketing", skills: [["Marketing", 3], ["Communication", 3], ["Data analysis", 2], ["Teamwork", 2], ["Excel", 1]] },
  { id: "hr", title: "HR Associate", domainId: "hrfin", skills: [["Recruitment", 3], ["Communication", 3], ["Teamwork", 2], ["Excel", 1]] },
  { id: "accounts", title: "Junior Accountant", domainId: "hrfin", skills: [["Accounting", 3], ["Excel", 3], ["Problem solving", 2], ["Communication", 1]] },
].map((r) => ({ ...r, skills: r.skills.map(([name, weight]) => ({ name, weight })) }));

/* Question templates. `keywords` are expected key points used for technical accuracy;
   `followUp` is asked when an answer is incomplete. */
const questions = [
  { id: "q1", skill: "Communication", type: "behavioral", text: "Tell me about yourself and the strengths you would bring to this role.", keywords: ["experience", "project", "skill", "team", "learned"], followUp: "Which one of those strengths has made the biggest difference in a project, and how?" },
  { id: "q2", skill: "Problem solving", type: "behavioral", text: "Describe a difficult problem you solved. What was the situation and what did you do?", keywords: ["problem", "steps", "tested", "result", "cause"], followUp: "How did you confirm that your solution actually fixed the problem?" },
  { id: "q3", skill: "Teamwork", type: "behavioral", text: "Tell me about a time you disagreed with a teammate. How did you resolve it?", keywords: ["listened", "agreed", "compromise", "discussed", "outcome"], followUp: "Looking back, what would you do differently in that disagreement?" },
  { id: "q4", skill: "React", type: "technical", text: "How do you decide what belongs in component state versus props in a React app?", keywords: ["state", "props", "parent", "child", "re-render", "lift"], followUp: "What happens when two sibling components need the same piece of state?" },
  { id: "q5", skill: "JavaScript", type: "technical", text: "Explain the difference between let, const and var, and when you would use each.", keywords: ["scope", "block", "hoisting", "reassign", "function"], followUp: "Can you give a short example where using var causes a bug?" },
  { id: "q6", skill: "CSS", type: "technical", text: "How would you build a layout that works well on both mobile and desktop screens?", keywords: ["flexbox", "grid", "media", "responsive", "breakpoint", "mobile"], followUp: "Which breakpoints would you choose and why?" },
  { id: "q7", skill: "SQL", type: "technical", text: "How would you find duplicate records in a table, and how would you prevent them?", keywords: ["group by", "having", "count", "unique", "constraint", "index"], followUp: "How would you delete the duplicates but keep one copy of each row?" },
  { id: "q8", skill: "REST APIs", type: "technical", text: "What makes a REST API well designed? Give an example endpoint you would create.", keywords: ["resource", "get", "post", "status", "json", "validation"], followUp: "Which status codes would that endpoint return on success and on errors?" },
  { id: "q9", skill: "Python", type: "technical", text: "How do you handle errors in a Python program that reads data from a file?", keywords: ["try", "except", "finally", "with", "filenotfound", "log"], followUp: "Why is the with statement useful when opening files?" },
  { id: "q10", skill: "Data analysis", type: "technical", text: "Walk me through how you would analyse why sales dropped last month.", keywords: ["data", "compare", "segment", "trend", "cause", "recommend"], followUp: "Which chart would you show a manager to explain your finding?" },
  { id: "q11", skill: "Marketing", type: "technical", text: "How would you measure whether a social media campaign was successful?", keywords: ["goal", "reach", "engagement", "conversion", "ctr", "audience"], followUp: "If engagement was high but conversions were low, what would you change?" },
  { id: "q12", skill: "Git", type: "technical", text: "Describe your Git workflow when working on a feature with other developers.", keywords: ["branch", "commit", "pull request", "review", "merge", "conflict"], followUp: "How do you resolve a merge conflict?" },
  { id: "q13", skill: "HTML", type: "technical", text: "Why does semantic HTML matter, and which tags do you use most?", keywords: ["semantic", "accessibility", "header", "nav", "main", "screen reader"], followUp: "How does semantic HTML help screen-reader users?" },
  { id: "q14", skill: "Testing", type: "technical", text: "How do you decide what to test in a new feature?", keywords: ["unit", "edge case", "input", "expected", "integration", "bug"], followUp: "Give an example of an edge case you would test." },
  { id: "q15", skill: "Excel", type: "technical", text: "How would you summarise a large sales sheet by region and month in Excel?", keywords: ["pivot", "sumifs", "filter", "chart", "region", "month"], followUp: "How would you keep that summary up to date when new rows are added?" },
  { id: "q16", skill: "Recruitment", type: "technical", text: "How would you design a fair screening process for an entry-level role?", keywords: ["criteria", "structured", "bias", "shortlist", "interview", "consistent"], followUp: "How would you check the process is actually fair after a hiring round?" },
  { id: "q17", skill: "Accounting", type: "technical", text: "How would you approach a bank reconciliation that doesn't balance?", keywords: ["statement", "ledger", "difference", "timing", "error", "adjust"], followUp: "What are common causes of timing differences?" },
  { id: "q18", skill: "Leadership", type: "behavioral", text: "Tell me about a time you took the lead on something without being asked.", keywords: ["initiative", "team", "plan", "result", "responsibility"], followUp: "How did the rest of the team respond to you taking the lead?" },
];

/* Evaluation criteria from the proposal. `appliesTo`: all | technical | behavioral */
const criteria = [
  { key: "technical", label: "Technical accuracy", weight: 2, appliesTo: "technical", enabled: true },
  { key: "relevance", label: "Relevance", weight: 2, appliesTo: "all", enabled: true },
  { key: "completeness", label: "Completeness", weight: 2, appliesTo: "all", enabled: true },
  { key: "clarity", label: "Clarity", weight: 1, appliesTo: "all", enabled: true },
  { key: "communication", label: "Communication", weight: 1, appliesTo: "all", enabled: true },
  { key: "star", label: "STAR structure", weight: 2, appliesTo: "behavioral", enabled: true },
];

const rules = {
  weakThreshold: 60, // a skill below this…
  weakMinSessions: 2, // …across at least this many sessions becomes a persistent weakness
  followUpBelow: 55, // completeness below this triggers a follow-up question
  defaultQuestions: 5,
  faceThreshold: 0.55, // prototype face-template similarity threshold
  suitability: { cv: 40, interview: 45, consistency: 15 }, // employer score weights (%)
};

/* ---------------- Demo users & data ---------------- */

const DAY = 86400000;
const now = Date.now();

const users = [
  { id: "adm-1", role: "admin", name: "Intervo Admin", email: "admin@intervo.demo", passwordHash: "1ea93fe2f4b5daced96693ae56a56c09618e03169c6365ee412b98583611570e", createdAt: now - 60 * DAY },
  { id: "nsx-1", role: "employer", name: "Hira Malik", company: "Northstar Digital", email: "hr@northstar.demo", passwordHash: "178d93c684c15893cd48dd83e32bc28bddf4d0c8db7e4d5b535f4b3d4fa60875", createdAt: now - 40 * DAY },
  { id: "cand-1", role: "candidate", name: "Ayesha Khan", email: "ayesha@intervo.demo", passwordHash: "c798071dd627e99cc3e68b6c08db521e70ab87ef6d1fee78e3849e0be18ef29c", createdAt: now - 30 * DAY },
  { id: "cand-2", role: "candidate", name: "Bilal Ahmed", email: "bilal@intervo.demo", passwordHash: "265ffee4e9c4aaf60608d0f4f9706f1a921a086201d17cf91068545ad79c531e", createdAt: now - 25 * DAY },
  { id: "cand-3", role: "candidate", name: "Sana Iqbal", email: "sana@intervo.demo", passwordHash: "359b58d58acfd8e93955d0580364cb675d5e9085f09092922a236bb22565745a", createdAt: now - 20 * DAY },
];

const profiles = {
  "cand-1": { skills: ["React", "JavaScript", "HTML", "CSS", "Git", "Communication"], roleId: "frontend", shareWithEmployers: true, fileName: "Ayesha_Khan_CV.pdf" },
  "cand-2": { skills: ["JavaScript", "HTML", "CSS", "Teamwork", "Figma"], roleId: "frontend", shareWithEmployers: true, fileName: "Bilal_Ahmed_CV.pdf" },
  "cand-3": { skills: ["React", "TypeScript", "CSS", "HTML", "Git", "Testing", "Communication"], roleId: "frontend", shareWithEmployers: true, fileName: "Sana_Iqbal_CV.pdf" },
};

function demoSession(userId, roleId, daysAgo, scores) {
  const answers = scores.map(([skill, score]) => {
    const q = questions.find((x) => x.skill === skill) || questions[0];
    const c = (d) => Math.max(20, Math.min(98, score + d));
    return {
      questionId: q.id, question: q.text, skill, type: q.type, score,
      criteria: q.type === "technical"
        ? { technical: c(-2), relevance: c(4), completeness: c(-4), clarity: c(3), communication: c(1) }
        : { relevance: c(4), completeness: c(-4), clarity: c(3), communication: c(1), star: c(-3) },
      answer: "",
    };
  });
  const score = Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length);
  return { id: `s-${userId}-${daysAgo}`, userId, roleId, roleTitle: roles.find((r) => r.id === roleId).title, mode: "text", date: now - daysAgo * DAY, score, answers };
}

const sessions = [
  demoSession("cand-1", "frontend", 12, [["React", 64], ["JavaScript", 70], ["CSS", 58], ["Communication", 66]]),
  demoSession("cand-1", "frontend", 5, [["React", 76], ["CSS", 62], ["Testing", 48], ["Communication", 74]]),
  demoSession("cand-1", "frontend", 1, [["React", 82], ["JavaScript", 79], ["Testing", 55], ["Git", 72]]),
  demoSession("cand-2", "frontend", 8, [["JavaScript", 55], ["CSS", 70], ["Teamwork", 78], ["React", 46]]),
  demoSession("cand-2", "frontend", 2, [["React", 52], ["JavaScript", 60], ["Communication", 69]]),
  demoSession("cand-3", "frontend", 6, [["React", 84], ["Testing", 78], ["CSS", 80], ["Communication", 71]]),
];

const jobs = [
  {
    id: "job-1", employerId: "nsx-1", company: "Northstar Digital", title: "Junior Frontend Developer", roleId: "frontend",
    location: "Lahore", mode: "Remote", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 9 * DAY,
    description: "Build accessible, responsive interfaces alongside a small product team shipping weekly.",
    skills: [{ name: "React", weight: 3 }, { name: "JavaScript", weight: 3 }, { name: "CSS", weight: 2 }, { name: "Git", weight: 1 }, { name: "Testing", weight: 1 }],
    success: { minScore: 65, minMatch: 60, notes: "Comfortable explaining component design and responsive layouts." },
  },
  {
    id: "job-2", employerId: "nsx-1", company: "Northstar Digital", title: "Web Developer Intern", roleId: "frontend",
    location: "Lahore", mode: "Hybrid", level: "Internship", type: "Internship", status: "open", createdAt: now - 4 * DAY,
    description: "Pair with senior developers on client websites and learn a production review workflow.",
    skills: [{ name: "HTML", weight: 2 }, { name: "CSS", weight: 2 }, { name: "JavaScript", weight: 2 }, { name: "Git", weight: 1 }],
    success: { minScore: 55, minMatch: 50, notes: "Eagerness to learn and clear communication." },
  },
  {
    id: "job-3", employerId: null, company: "Vertex Systems", title: "Junior Software Engineer", roleId: "backend",
    location: "Karachi", mode: "On-site", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 7 * DAY,
    description: "Contribute to features, tests and maintenance for internal business applications.",
    skills: [{ name: "Python", weight: 3 }, { name: "SQL", weight: 3 }, { name: "REST APIs", weight: 2 }, { name: "Problem solving", weight: 2 }],
    success: { minScore: 65, minMatch: 60, notes: "" },
  },
  {
    id: "job-4", employerId: null, company: "Crescent Analytics", title: "Associate Business Analyst", roleId: "analyst",
    location: "Lahore", mode: "Hybrid", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 3 * DAY,
    description: "Turn stakeholder questions into clear reports and help teams make data-backed decisions.",
    skills: [{ name: "Data analysis", weight: 3 }, { name: "Excel", weight: 3 }, { name: "SQL", weight: 2 }, { name: "Communication", weight: 2 }],
    success: { minScore: 60, minMatch: 60, notes: "" },
  },
  {
    id: "job-5", employerId: null, company: "Indus Media Co.", title: "Marketing Trainee", roleId: "marketing",
    location: "Gujrat", mode: "On-site", level: "Internship", type: "Internship", status: "open", createdAt: now - 1 * DAY,
    description: "Support campaign planning, social content and performance tracking for regional brands.",
    skills: [{ name: "Marketing", weight: 3 }, { name: "Communication", weight: 2 }, { name: "Teamwork", weight: 1 }],
    success: { minScore: 55, minMatch: 50, notes: "" },
  },
];

const applications = [
  { id: "app-1", jobId: "job-1", candidateId: "cand-1", date: now - 2 * DAY, consent: true },
  { id: "app-2", jobId: "job-1", candidateId: "cand-2", date: now - 3 * DAY, consent: true },
  { id: "app-3", jobId: "job-1", candidateId: "cand-3", date: now - 1 * DAY, consent: true },
  { id: "app-4", jobId: "job-2", candidateId: "cand-2", date: now - 1 * DAY, consent: true },
];

export function seedDB() {
  return structuredClone({
    version: DB_VERSION,
    config: { domains, skills, roles, questions, criteria, rules },
    users,
    profiles,
    sessions,
    jobs,
    applications,
  });
}

export const DEMO_ACCOUNTS = [
  { role: "candidate", email: "ayesha@intervo.demo", password: "Demo@1234" },
  { role: "employer", email: "hr@northstar.demo", password: "Demo@1234" },
  { role: "admin", email: "admin@intervo.demo", password: "Admin@1234" },
];
