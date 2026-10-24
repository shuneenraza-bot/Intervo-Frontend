/*
 * CV & Job-description analyzer (proposal component 3).
 *
 *  1. extractText(file)  → plain text from PDF (pdf.js), DOCX (built-in reader) or TXT
 *  2. parseCV(text)      → contact, skills, education, experience, projects
 *  3. parseJD(text)      → required skills with weights, experience and education requirements
 *
 * Everything runs in the browser for the prototype. When the FastAPI backend is
 * ready, the same output shape can come from the server (Gemini + validation)
 * and the UI does not need to change.
 */
import { extractSkills } from "./lib";

export const MAX_FILE_MB = 5;
export const ACCEPTED = ".pdf,.docx,.txt";

/* =========================================================
   1. Text extraction
   ========================================================= */

export async function extractText(file, onStep = () => {}) {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new CVError(`The file is larger than ${MAX_FILE_MB} MB.`);
  if (name.endsWith(".doc")) throw new CVError("Old .doc files can't be read. Open it in Word and use Save As → .docx or PDF.");

  onStep("read");
  const buffer = await file.arrayBuffer();

  onStep("extract");
  let text;
  if (name.endsWith(".pdf")) text = await pdfToText(buffer);
  else if (name.endsWith(".docx")) text = await docxToText(buffer);
  else if (name.endsWith(".txt")) text = new TextDecoder().decode(buffer);
  else throw new CVError("Please choose a PDF, DOCX or TXT file.");

  text = cleanText(text);
  if (text.replace(/\s/g, "").length < 60)
    throw new CVError(
      name.endsWith(".pdf")
        ? "This PDF has almost no selectable text — it is probably a scanned image. Export your CV from Word/Google Docs as PDF, or upload the DOCX."
        : "We couldn't find readable text in this file."
    );
  return text;
}

export class CVError extends Error {}

function cleanText(t) {
  return t
    .replace(/\r/g, "")
    .replace(/[    ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------- PDF via pdf.js (loaded only when a PDF is uploaded) ---------- */

let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

async function pdfToText(buffer) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (e) {
    throw new CVError(e?.name === "PasswordException" ? "This PDF is password-protected. Remove the password and try again." : "This PDF could not be opened — it may be damaged.");
  }
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items));
  }
  return pages.join("\n\n");
}

/** Rebuilds reading-order lines from positioned pdf.js text items, with blank lines for big gaps. */
function itemsToLines(items) {
  const parts = items
    .filter((i) => i.str !== undefined)
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || i.height || 10, w: i.width || 0 }));
  if (!parts.length) return "";

  // Group items that share a baseline.
  parts.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of parts) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.45));
    if (line) line.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);

  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b);
  const normalGap = gaps[Math.floor(gaps.length / 2)] || 12;

  const out = [];
  lines.forEach((line, i) => {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let lastEnd = null;
    for (const it of line.items) {
      if (lastEnd !== null && it.x - lastEnd > it.h * 0.15 && !text.endsWith(" ") && !it.s.startsWith(" ")) text += " ";
      text += it.s;
      lastEnd = it.x + it.w;
    }
    if (i > 0 && lines[i - 1].y - line.y > normalGap * 1.6) out.push("");
    if (text.trim()) out.push(text.trim());
  });
  return out.join("\n");
}

/* ---------- DOCX: minimal zip reader + WordprocessingML text ---------- */

async function docxToText(buffer) {
  const xml = await readZipEntry(buffer, "word/document.xml");
  if (!xml) throw new CVError("This DOCX file looks damaged — we couldn't find the document text.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = [...doc.getElementsByTagName("w:p")];
  const lines = paragraphs.map((p) => {
    let t = "";
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeName === "w:t") t += n.textContent;
        else if (n.nodeName === "w:tab") t += " ";
        else if (n.nodeName === "w:br" || n.nodeName === "w:cr") t += "\n";
        else if (n.childNodes?.length) walk(n);
      }
    };
    walk(p);
    const style = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || "";
    const isList = p.getElementsByTagName("w:numPr").length > 0 || /list|bullet/i.test(style);
    return t.trim() ? (isList ? `• ${t.trim()}` : t.trim()) : "";
  });
  return lines.join("\n");
}

async function readZipEntry(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new CVError("This file is not a valid DOCX document.");
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(off, true) !== 0x02014b50) break;
    const method = view.getUint16(off + 10, true);
    const size = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const local = view.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.slice(start, start + size);
      if (method === 0) return dec.decode(data);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return dec.decode(await new Response(stream).arrayBuffer());
      }
      throw new CVError("Unsupported DOCX compression.");
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/* =========================================================
   2. CV parsing
   ========================================================= */

const HEADINGS = {
  summary: ["summary", "profile", "objective", "about me", "career objective", "professional summary", "personal statement"],
  education: ["education", "academic", "academics", "academic background", "academic qualifications", "qualifications", "educational background"],
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "internship", "internships", "internship experience"],
  projects: ["projects", "academic projects", "personal projects", "key projects", "final year project", "project experience", "selected projects"],
  skills: ["skills", "technical skills", "core skills", "key skills", "skills summary", "competencies", "core competencies", "tools", "technologies", "tools and technologies", "soft skills", "expertise"],
  certifications: ["certifications", "certificates", "courses", "training", "achievements", "awards", "honors", "certifications and courses"],
  other: ["languages", "interests", "hobbies", "references", "contact", "personal information", "personal details", "extracurricular activities", "activities", "volunteering"],
};

const BULLET = /^[•●▪■◦‣\-–*·>✓]\s*/;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s*,?\\s*)?(?:\\d{1,2}[/.-])?(?:19|20)\\d{2}`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|till|until)\\s*(${DATE}|present|current|now|ongoing|date)`, "i");
const SINGLE_YEAR = /\b(19|20)\d{2}\b/;
const DEGREE = /\b(ph\.?d|doctorate|master'?s?|m\.?s\.?c?|m\.?phil|mba|bachelor'?s?|b\.?s\.?c?|b\.?e|b\.?tech|bs|bsc|bba|bcs|be|intermediate|f\.?sc|fsc|ics|i\.?com|a[- ]levels?|o[- ]levels?|matric(?:ulation)?|ssc|hssc|diploma|associate degree)\b/i;
const INSTITUTE = /\b(university|college|institute|school|academy|campus|polytechnic|board)\b/i;

function headingOf(line) {
  const clean = line.toLowerCase().replace(/[:•|_\-–—#*]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 38 || /\d{3,}|@/.test(clean)) return null;
  for (const [key, words] of Object.entries(HEADINGS)) {
    if (words.some((w) => clean === w || (clean.startsWith(w + " ") && clean.split(" ").length <= 4))) return key;
  }
  return null;
}

/** Splits a section into entries: header lines followed by bullet points. */
function splitEntries(lines) {
  const entries = [];
  let cur = null;
  const close = () => { if (cur && (cur.head.length || cur.bullets.length)) entries.push(cur); cur = null; };
  for (const raw of lines) {
    if (!raw.trim()) { close(); continue; }
    const isBullet = BULLET.test(raw);
    const line = raw.replace(BULLET, "").trim();
    if (!line) continue;
    if (isBullet) {
      cur ??= { head: [], bullets: [] };
      cur.bullets.push(line);
    } else {
      // A new non-bullet line after bullets, or a 4th header line, starts a new entry.
      const looksLikeDetail = /[.;]$/.test(line) && line.length > 40 && !DATE_RANGE.test(line);
      if (cur && !looksLikeDetail && (cur.bullets.length || cur.head.length >= 3 || (DATE_RANGE.test(line) && cur.head.some((h) => DATE_RANGE.test(h))))) close();
      cur ??= { head: [], bullets: [] };
      // Sentence-like lines after a header are descriptions, not headers (CVs written without bullets).
      if (cur.head.length >= 1 && (line.length > 90 || (/[.;]$/.test(line) && line.length > 40 && !DATE_RANGE.test(line)))) cur.bullets.push(line);
      else cur.head.push(line);
    }
  }
  close();
  return entries;
}

const stripDates = (s) => s.replace(DATE_RANGE, "").replace(/\(\s*\)|\|\s*$|,\s*$|-\s*$|–\s*$/g, "").replace(/\s{2,}/g, " ").trim();

function findDates(text) {
  const m = text.match(DATE_RANGE);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  const y = text.match(SINGLE_YEAR);
  return y ? y[0] : "";
}

export function monthsBetween(range) {
  const m = range.match(DATE_RANGE);
  if (!m) return 0;
  const toDate = (s) => {
    if (/present|current|now|ongoing|date/i.test(s)) return new Date();
    const year = +s.match(/(19|20)\d{2}/)[0];
    const mm = s.match(new RegExp(MONTH, "i"));
    const month = mm ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(mm[0].slice(0, 3).toLowerCase()) : 0;
    return new Date(year, Math.max(0, month), 1);
  };
  const diff = (toDate(m[2]) - toDate(m[1])) / (1000 * 60 * 60 * 24 * 30.4);
  return Math.max(0, Math.round(diff));
}

function parseEducation(entry) {
  const all = [...entry.head, ...entry.bullets];
  const text = all.join(" | ");
  const degreeLine = all.find((l) => DEGREE.test(l)) || entry.head[0] || "";
  const instLine = all.find((l) => INSTITUTE.test(l) && l !== degreeLine) || (INSTITUTE.test(degreeLine) ? "" : entry.head.find((l) => l !== degreeLine)) || "";
  const score = text.match(/\b(c?gpa)\s*[:\-]?\s*([\d.]+)\s*(?:\/\s*([\d.]+))?/i) || text.match(/\b(\d{2,3}(?:\.\d+)?)\s*%/);
  return {
    degree: stripDates(degreeLine.split(/\s+[|,–-]\s+(?=[A-Z][a-z]+ (?:University|College|Institute))/)[0]),
    institution: stripDates(instLine),
    dates: findDates(text),
    score: score ? (score[2] ? `${score[1].toUpperCase()} ${score[2]}${score[3] ? ` / ${score[3]}` : ""}` : `${score[1]}%`) : "",
  };
}

function parseExperience(entry) {
  const dates = findDates(entry.head.join(" ")) || findDates(entry.bullets.join(" "));
  const heads = entry.head.map(stripDates).filter(Boolean);
  let title = heads[0] || "";
  let company = heads[1] || "";
  if (!company) {
    const split = title.split(/\s+(?:at|@)\s+|\s*[|,]\s*|\s+[–—-]\s+/);
    if (split.length > 1) [title, company] = [split[0], split.slice(1).join(", ")];
  }
  return { title, company, dates, months: monthsBetween(dates), details: entry.bullets.join("\n") || heads.slice(2).join("\n") };
}

function parseProject(entry, skillConfig) {
  const first = stripDates(entry.head[0] || entry.bullets[0] || "").replace(/^(project|fyp)\s*[:\-–]\s*/i, "");
  const [name, ...rest] = first.length > 70 ? first.split(/\s+[|–—]\s+|:\s+/) : first.split(/\s+\|\s+/);
  const details = [...rest, ...entry.head.slice(1), ...entry.bullets].join("\n");
  return { name: name.trim(), tech: extractSkills(`${first} ${details}`, skillConfig), details: details.trim() };
}

function parseContact(headerLines, fullText) {
  const email = fullText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || "";
  const phone = (fullText.match(/(?:\+92[\s-]?|0)3\d{2}[\s-]?\d{7}/) || fullText.match(/\+?\d[\d\s()-]{8,15}\d/))?.[0]?.trim() || "";
  const linkedin = fullText.match(/linkedin\.com\/in\/[\w-]+/i)?.[0] || "";
  const github = fullText.match(/github\.com\/[\w-]+/i)?.[0] || "";
  const name =
    headerLines.find((l) => !/[@\d/]|http|www\.|linkedin|github/i.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5 && l.length < 40) ||
    headerLines[0] || "";
  const location = headerLines.find((l) => /(lahore|karachi|islamabad|rawalpindi|gujrat|faisalabad|multan|peshawar|quetta|sialkot|pakistan)/i.test(l))?.match(/[A-Za-z ]*(lahore|karachi|islamabad|rawalpindi|gujrat|faisalabad|multan|peshawar|quetta|sialkot)[A-Za-z ,]*(pakistan)?/i)?.[0]?.trim() || "";
  return { name: name.replace(/\s*[|,].*$/, "").trim(), email, phone, linkedin, github, location };
}

export function parseCV(text, skillConfig) {
  const lines = text.split("\n");
  const sections = { header: [] };
  let current = "header";
  for (const line of lines) {
    const h = headingOf(line);
    if (h) { current = h; sections[h] ??= []; continue; }
    (sections[current] ??= []).push(line);
  }

  const skills = extractSkills(text, skillConfig);
  const known = new Set(skillConfig.flatMap((s) => [s.name.toLowerCase(), ...s.aliases]));
  const otherSkills = [...new Set(
    (sections.skills || [])
      .flatMap((l) => l.replace(BULLET, "").replace(/^[^:]{2,25}:\s*/, "").split(/[,|;•/]| and /))
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter((s) => s.length >= 2 && s.length <= 28 && s.split(" ").length <= 3 && !known.has(s.toLowerCase()))
  )].slice(0, 16);

  const education = splitEntries(sections.education || []).map(parseEducation).filter((e) => e.degree || e.institution);
  const experience = splitEntries(sections.experience || []).map(parseExperience).filter((e) => e.title);
  const projects = splitEntries(sections.projects || []).map((e) => parseProject(e, skillConfig)).filter((p) => p.name);
  const summary = (sections.summary || []).filter(Boolean).join(" ").slice(0, 600);
  const certifications = (sections.certifications || []).map((l) => l.replace(BULLET, "").trim()).filter(Boolean).slice(0, 10);
  const totalMonths = experience.reduce((s, e) => s + (e.months || 0), 0);

  const found = Object.keys(sections).filter((k) => k !== "header" && sections[k].some((l) => l.trim()));
  const warnings = [];
  if (!found.length) warnings.push("No section headings (Education, Experience, Skills…) were found, so only skills were extracted. Add the details below if needed.");
  if (!skills.length) warnings.push("No skills from the skill library were recognised. Add them manually below.");

  return {
    contact: parseContact(sections.header.filter((l) => l.trim()).slice(0, 8), text),
    summary,
    skills,
    otherSkills,
    education,
    experience,
    projects,
    certifications,
    experienceYears: Math.round((totalMonths / 12) * 2) / 2,
    sectionsFound: found,
    warnings,
  };
}

/* =========================================================
   3. Job description parsing
   ========================================================= */

export function parseJD(text, skillConfig, roleSkills = []) {
  const lines = text.split(/\n|(?<=\.)\s+/);
  const skills = extractSkills(text, skillConfig).map((name) => {
    const lineFor = lines.filter((l) => extractSkills(l, skillConfig).includes(name)).join(" ").toLowerCase();
    let weight = roleSkills.find((s) => s.name === name)?.weight ?? 2;
    if (/must|required|requirement|strong|essential|proficien|expert|solid/.test(lineFor)) weight = 3;
    else if (/nice to have|preferred|plus|bonus|familiar|desirable|good to have/.test(lineFor)) weight = 1;
    return { name, weight };
  });
  const years = text.match(/(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)/i);
  const degree = text.match(/\b(bachelor'?s?|master'?s?|bs|ms|bsc|msc|mba|bba|ph\.?d)\b[^.\n]{0,60}/i);
  const title = text.split("\n").map((l) => l.trim()).find((l) => l && l.length < 70 && !/:$/.test(l)) || "";
  return {
    title,
    skills,
    minYears: years ? +years[1] : 0,
    education: degree ? degree[0].trim().replace(/[,;]$/, "") : "",
    fresherFriendly: /fresh|graduate|intern|entry[- ]level|0\s*-\s*1 years?/i.test(text),
  };
}

/** Simple education level for comparing CV against a JD requirement. */
export function educationLevel(s = "") {
  if (/ph\.?d|doctorate/i.test(s)) return 4;
  if (/master|\bms\b|m\.?sc|m\.?phil|mba/i.test(s)) return 3;
  if (/bachelor|\bbs\b|b\.?sc|\bbe\b|b\.?tech|bba|bcs/i.test(s)) return 2;
  if (/intermediate|f\.?sc|ics|a[- ]level|hssc|diploma/i.test(s)) return 1;
  return 0;
}
