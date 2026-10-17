/*
 * Business logic for the prototype. Every function is pure and deterministic
 * (apart from question shuffling), so each one maps cleanly onto a FastAPI
 * service later: matching, evaluation, weakness detection, suitability scoring.
 */

/* ---------- Utilities ---------- */

export const wordCount = (t = "") => (t.trim() ? t.trim().split(/\s+/).length : 0);
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const average = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0);
export const uid = (p = "id") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function formatDate(ts, opts = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}
export function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "1 week ago";
  return `${Math.floor(d / 7)} weeks ago`;
}
export const initials = (name = "") => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "U";
export const firstName = (name = "") => name.split(/\s+/)[0] || "there";

export function scoreTone(score, threshold = 60) {
  if (score == null) return "muted";
  if (score >= 75) return "good";
  if (score >= threshold) return "fair";
  return "low";
}

/* Password hashing with Web Crypto. The server will use bcrypt/argon2; this keeps
   plain-text passwords out of localStorage in the prototype. */
export async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function passwordStrength(pw = "") {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong"][s] };
}

/* ---------- Skills: extraction & CV–Job matching ---------- */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finds configured skills mentioned in free text (CV text, skill list or job description). */
export function extractSkills(text = "", skills) {
  const lower = ` ${text.toLowerCase()} `;
  return skills
    .filter(({ name, aliases }) =>
      [name.toLowerCase(), ...aliases].some((a) => new RegExp(`(^|[^a-z0-9])${escapeRe(a)}([^a-z0-9]|$)`).test(lower))
    )
    .map((s) => s.name);
}

/**
 * Weighted CV–Job match with matched, partially matched and missing skills.
 * A skill is "partial" when the candidate has a related skill (configured per skill);
 * partial skills earn half their weight. Returns factor-level detail so the
 * score is explainable.
 */
export function matchSkills(candidateSkills = [], required = [], skillConfig = []) {
  const have = new Set(candidateSkills);
  const matched = [];
  const partial = [];
  const missing = [];
  required.forEach((req) => {
    if (have.has(req.name)) return matched.push(req);
    const cfg = skillConfig.find((s) => s.name === req.name);
    const via = cfg?.related?.find((r) => have.has(r));
    if (via) partial.push({ ...req, via });
    else missing.push(req);
  });
  const total = required.reduce((s, r) => s + r.weight, 0);
  const got = matched.reduce((s, r) => s + r.weight, 0) + partial.reduce((s, r) => s + r.weight * 0.5, 0);
  return { matched, partial, missing, percentage: total ? Math.round((got / total) * 100) : 0 };
}

/* ---------- Answer evaluation (rubric) ---------- */

const STAR_CUES = {
  situation: ["when i", "during", "situation", "at my", "in my", "project", "while", "last year", "semester"],
  task: ["needed to", "had to", "my role", "responsible", "goal", "task", "challenge", "asked to"],
  action: ["i decided", "i created", "i built", "i spoke", "i started", "so i", "i used", "i worked", "i organised", "i organized", "i suggested", "i wrote", "i set up", "i proposed"],
  result: ["as a result", "result", "outcome", "improved", "reduced", "increased", "learned", "finally", "which led", "in the end"],
};
const FILLERS = ["um", "uh", "like", "basically", "actually", "you know", "kind of", "sort of", "literally"];

/**
 * Rule-based rubric scoring used until the Gemini evaluator is connected.
 * Criteria and their weights come from the admin configuration.
 */
export function evaluateAnswer(answer, question, config) {
  const { criteria, skills, rules } = config;
  const text = answer.trim();
  const lower = ` ${text.toLowerCase()} `;
  const words = wordCount(text);
  const tokens = lower.match(/[a-z']+/g) ?? [];
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const avgSentence = sentences.length ? words / sentences.length : words;

  const keywords = question.keywords ?? [];
  const keyHits = keywords.filter((k) => lower.includes(k.toLowerCase()));
  const aliases = skills.find((s) => s.name === question.skill)?.aliases ?? [];
  const qTerms = question.text.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  const relHits = [...new Set([...aliases, ...qTerms])].filter((t) => lower.includes(t)).length;
  const hasExample = /\b(for example|for instance|e\.g\.|such as|in my|when i)\b/.test(lower);
  const fillerCount = FILLERS.reduce((n, f) => n + (lower.match(new RegExp(`\\b${f}\\b`, "g"))?.length ?? 0), 0);
  const variety = tokens.length ? new Set(tokens).size / tokens.length : 0;
  const starParts = Object.entries(STAR_CUES).filter(([, cues]) => cues.some((c) => lower.includes(c))).map(([k]) => k);

  const raw = {
    technical: clamp(Math.round(30 + (keywords.length ? keyHits.length / keywords.length : 0.4) * 62 + (hasExample ? 6 : 0)), 25, 97),
    relevance: clamp(42 + relHits * 11 + (hasExample ? 8 : 0), 30, 96),
    completeness: clamp(Math.round(28 + Math.min(words, 170) * 0.4 + (hasExample ? 6 : 0)), 22, 96),
    clarity: clamp(Math.round(93 - Math.abs(avgSentence - 17) * 2.2), 35, 95),
    communication: clamp(Math.round(55 + variety * 45 - fillerCount * 6 + (words > 40 ? 6 : 0)), 30, 95),
    star: clamp(32 + starParts.length * 16, 32, 96),
  };

  const applicable = criteria.filter((c) => c.enabled && (c.appliesTo === "all" || c.appliesTo === question.type));
  const scores = Object.fromEntries(applicable.map((c) => [c.key, raw[c.key]]));
  const totalW = applicable.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round(applicable.reduce((s, c) => s + raw[c.key] * c.weight, 0) / totalW);

  const tips = [];
  if (scores.technical !== undefined && scores.technical < 60)
    tips.push(`Cover the key points: ${keywords.filter((k) => !keyHits.includes(k)).slice(0, 4).join(", ")}.`);
  if (scores.completeness < 60) tips.push("Add a concrete example from a project and say what the outcome was.");
  if (scores.relevance !== undefined && scores.relevance < 60) tips.push(`Tie the answer back to ${question.skill.toLowerCase()} more directly.`);
  if (scores.clarity < 60) tips.push("Use shorter sentences so each point lands clearly.");
  if (scores.communication !== undefined && fillerCount > 1) tips.push(`Cut filler words (found ${fillerCount}).`);
  if (scores.star !== undefined && starParts.length < 4)
    tips.push(`Missing STAR parts: ${["situation", "task", "action", "result"].filter((p) => !starParts.includes(p)).join(", ")}.`);
  if (!tips.length) tips.push("Strong answer. Next time, quantify the result if you can.");

  return {
    score, criteria: scores, words, starParts, keyHits, tips,
    needsFollowUp: raw.completeness < rules.followUpBelow || (question.type === "technical" && raw.technical < 50),
  };
}

/* ---------- Skill history, persistent weaknesses & adaptive selection ---------- */

/**
 * Per-skill history across sessions (oldest → newest). A skill is a persistent
 * weakness when it appears in at least `weakMinSessions` sessions and its
 * average stays below `weakThreshold`.
 */
export function skillPerformance(sessions, rules) {
  const map = {};
  [...sessions].sort((a, b) => a.date - b.date).forEach((s) =>
    s.answers.forEach((a) => {
      const e = (map[a.skill] ??= { scores: [], sessionIds: new Set() });
      e.scores.push(a.score);
      e.sessionIds.add(s.id);
    })
  );
  return Object.entries(map)
    .map(([skill, { scores, sessionIds }]) => {
      const avg = average(scores);
      return {
        skill, scores, avg,
        sessions: sessionIds.size,
        latest: scores[scores.length - 1],
        trend: scores.length > 1 ? scores[scores.length - 1] - scores[0] : 0,
        weak: sessionIds.size >= rules.weakMinSessions && avg < rules.weakThreshold,
      };
    })
    .sort((a, b) => a.avg - b.avg);
}

/**
 * Chooses questions for a role: persistent weaknesses first, then CV gaps,
 * then the role's highest-weighted skills, and always one general/behavioural question.
 */
export function selectQuestions({ role, performance, missingSkills = [], questions, count }) {
  const roleSkills = role.skills.slice().sort((a, b) => b.weight - a.weight).map((s) => s.name);
  const weak = performance.filter((p) => p.weak).map((p) => p.skill);
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  const reason = (q) => (weak.includes(q.skill) ? "weakness" : missingSkills.includes(q.skill) ? "gap" : roleSkills.includes(q.skill) ? "role" : "general");
  const rank = { weakness: 0, gap: 1, role: 2, general: 3 };
  const pool = questions.filter((q) => roleSkills.includes(q.skill) || weak.includes(q.skill) || q.type === "behavioral");

  const ordered = shuffle(pool).sort((a, b) => rank[reason(a)] - rank[reason(b)] || roleSkills.indexOf(a.skill) - roleSkills.indexOf(b.skill));
  const picked = [];
  const usedSkills = new Set();
  for (const q of ordered) {
    if (picked.length >= count) break;
    if (usedSkills.has(q.skill)) continue;
    picked.push(q);
    usedSkills.add(q.skill);
  }
  // guarantee at least one behavioural question
  if (!picked.some((q) => q.type === "behavioral")) {
    const b = pool.find((q) => q.type === "behavioral" && !usedSkills.has(q.skill));
    if (b) picked[picked.length - 1] = b;
  }
  return picked.map((q) => ({ ...q, reason: reason(q) }));
}

/* ---------- Employer: transparent suitability score ---------- */

/**
 * Weighted suitability = CV skill match + interview evidence on the job's skills
 * + practice consistency. Returns every factor so the employer sees why.
 */
export function suitability({ job, profile, sessions, config }) {
  const { rules, skills } = config;
  const w = rules.suitability;
  const cv = matchSkills(profile?.skills ?? [], job.skills, skills);
  const perf = skillPerformance(sessions, rules);

  const evidence = job.skills.map((js) => ({ ...js, perf: perf.find((p) => p.skill === js.name) }));
  const withData = evidence.filter((e) => e.perf);
  const evW = withData.reduce((s, e) => s + e.weight, 0);
  const interview = evW ? Math.round(withData.reduce((s, e) => s + e.perf.avg * e.weight, 0) / evW) : 0;
  const coverage = job.skills.length ? Math.round((withData.length / job.skills.length) * 100) : 0;

  const trend = perf.length ? average(perf.map((p) => p.trend)) : 0;
  const consistency = sessions.length ? clamp(Math.round(40 + sessions.length * 12 + trend), 0, 100) : 0;

  const total = Math.round((cv.percentage * w.cv + interview * w.interview + consistency * w.consistency) / (w.cv + w.interview + w.consistency));
  const avgScore = average(sessions.map((s) => s.score));
  return {
    total,
    factors: [
      { key: "cv", label: "CV skill match", value: cv.percentage, weight: w.cv, detail: `${cv.matched.length} matched, ${cv.partial.length} partial, ${cv.missing.length} missing` },
      { key: "interview", label: "Interview evidence", value: interview, weight: w.interview, detail: withData.length ? `Scored on ${withData.length} of ${job.skills.length} required skills (${coverage}% coverage)` : "No interview answers on this job's skills yet" },
      { key: "consistency", label: "Practice consistency", value: consistency, weight: w.consistency, detail: `${sessions.length} session${sessions.length === 1 ? "" : "s"}, average trend ${trend >= 0 ? "+" : ""}${trend}` },
    ],
    cv, evidence, avgScore,
    meetsCriteria: avgScore >= (job.success?.minScore ?? 0) && cv.percentage >= (job.success?.minMatch ?? 0),
    weak: perf.filter((p) => p.weak).map((p) => p.skill),
  };
}

/* ---------- Face template (prototype) ----------
 * The production system uses MediaPipe on the server and stores an encrypted
 * template. Here a centred, downscaled, z-normalised grayscale patch acts as
 * the template so enrolment → verification → threshold can be demonstrated
 * end-to-end without storing a raw image.
 */
const T = 24;

export function frameToTemplate(video, canvas) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const side = Math.min(vw, vh) * 0.62;
  canvas.width = T;
  canvas.height = T;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2 - side * 0.05, side, side, 0, 0, T, T);
  const { data } = ctx.getImageData(0, 0, T, T);
  const gray = [];
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  const sd = Math.sqrt(gray.reduce((a, b) => a + (b - mean) ** 2, 0) / gray.length) || 1;
  return { vector: gray.map((g) => +((g - mean) / sd).toFixed(3)), raw: gray, brightness: mean, contrast: sd };
}

export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / a.length; // Pearson correlation of z-normalised vectors
}

export function averageTemplates(list) {
  const n = list[0].length;
  const out = new Array(n).fill(0);
  list.forEach((v) => v.forEach((x, i) => (out[i] += x / list.length)));
  return out.map((x) => +x.toFixed(3));
}

export function motionBetween(a, b) {
  if (!a || !b) return 0;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}
