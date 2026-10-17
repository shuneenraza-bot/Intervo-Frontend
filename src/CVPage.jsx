import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { extractSkills, matchSkills } from "./lib";
import { Card, Empty, Note, PageHeader, ScoreRing, Segmented, Weight } from "./ui";

export default function CVPage({ user, db, profile, go }) {
  const { update, notify } = useStore();
  const { skills: skillConfig, roles, domains } = db.config;
  const [fileName, setFileName] = useState(profile.fileName || "");
  const [cvText, setCvText] = useState(profile.cvText ?? (profile.skills || []).join(", "));
  const [domainId, setDomainId] = useState(roles.find((r) => r.id === profile.roleId)?.domainId || domains[0].id);
  const [roleId, setRoleId] = useState(profile.roleId || roles[0].id);
  const [jd, setJd] = useState(profile.jd || "");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const result = profile.result;

  const detected = useMemo(() => extractSkills(cvText, skillConfig), [cvText, skillConfig]);
  const jdSkills = useMemo(() => extractSkills(jd, skillConfig), [jd, skillConfig]);
  const domainRoles = roles.filter((r) => r.domainId === domainId);

  function pickFile(file) {
    if (!file) return;
    if (!/\.(pdf|docx?|txt)$/i.test(file.name)) return setError("Please choose a PDF, DOCX or TXT file.");
    if (file.size > 5 * 1024 * 1024) return setError("The file is larger than 5 MB.");
    setError("");
    setFileName(file.name);
    // Plain-text CVs can be read in the browser; PDF/DOCX parsing runs on the server.
    if (/\.txt$/i.test(file.name)) file.text().then((t) => setCvText(t));
  }

  function analyse(e) {
    e.preventDefault();
    if (!detected.length) return setError("We couldn't find any skills yet. Paste your CV text or list your skills, e.g. React, SQL, Communication.");
    const role = roles.find((r) => r.id === roleId);
    // A pasted JD overrides the role template; role weights are kept where skills overlap.
    const required = jdSkills.length ? jdSkills.map((name) => ({ name, weight: role.skills.find((s) => s.name === name)?.weight ?? 2 })) : role.skills;
    const match = matchSkills(detected, required, skillConfig);
    setError("");
    update((d) => {
      d.profiles[user.id] = {
        ...d.profiles[user.id], fileName, cvText, roleId, jd, skills: detected,
        result: { ...match, roleTitle: role.title, source: jdSkills.length ? "Pasted job description" : "Role template", date: Date.now() },
      };
    });
    notify("Skill-gap analysis saved");
  }

  return (
    <>
      <PageHeader kicker="CV · Job description analysis" title="CV & skill gap" subtitle="Compare the skills in your CV with what a role needs. Gaps are fed straight into your next interview." />

      <div className="grid grid--split">
        <Card title="Your CV" subtitle="Upload a file and confirm the extracted skills" action={<span className="step-num">01</span>}>
          <form className="form" onSubmit={analyse}>
            <label
              className={`dropzone ${dragging ? "is-dragging" : ""} ${fileName ? "has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
            >
              <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => pickFile(e.target.files?.[0])} />
              <span className="dropzone__icon"><Icon name={fileName ? "file" : "upload"} size={22} /></span>
              {fileName ? (
                <><strong>{fileName}</strong><small>Uploaded · click to replace</small></>
              ) : (
                <><strong>Drop your CV here or <u>browse</u></strong><small>PDF, DOCX or TXT · up to 5 MB</small></>
              )}
            </label>

            <div className="field">
              <div className="field__row">
                <label htmlFor="cvtext">CV text or skills</label>
                <span className="field__hint">{detected.length} skills recognised</span>
              </div>
              <textarea id="cvtext" rows={4} data-lenis-prevent placeholder="Paste your CV text, or list skills: React, JavaScript, CSS, Git, teamwork…" value={cvText} onChange={(e) => setCvText(e.target.value)} />
              <div className="detected">
                {detected.length ? detected.map((s) => <span className="chip chip--brand" key={s}>{s}</span>) : <span className="field__hint">Recognised skills appear here as you type.</span>}
              </div>
            </div>

            <div className="field">
              <label>Target domain</label>
              <Segmented options={domains.map((d) => ({ value: d.id, label: d.name }))} value={domainId} onChange={(id) => { setDomainId(id); const first = roles.find((r) => r.domainId === id); if (first) setRoleId(first.id); }} />
            </div>
            <div className="field">
              <label>Target role</label>
              {domainRoles.length ? (
                <Segmented wrap options={domainRoles.map((r) => ({ value: r.id, label: r.title, sub: `${r.skills.length} required skills` }))} value={roleId} onChange={setRoleId} />
              ) : (
                <p className="field__hint">No roles configured for this domain yet.</p>
              )}
            </div>

            <div className="field">
              <div className="field__row">
                <label htmlFor="jd">Job description <span className="optional">optional</span></label>
                {jdSkills.length > 0 && <span className="field__hint">{jdSkills.length} required skills found</span>}
              </div>
              <textarea id="jd" rows={4} data-lenis-prevent placeholder="Paste a job description to compare against it instead of the role template…" value={jd} onChange={(e) => setJd(e.target.value)} />
            </div>

            {error && <p className="form__error"><Icon name="alert" size={15} /> {error}</p>}
            <button className="btn btn--primary" type="submit">Analyse skill gap <Icon name="arrowRight" size={16} /></button>
          </form>
        </Card>

        <Card title="Skill alignment" subtitle={result ? `${result.roleTitle} · ${result.source}` : "Your result appears here"} className="card--sticky" action={<span className="step-num">02</span>}>
          {result ? (
            <div className="result">
              <div className="result__score">
                <ScoreRing value={result.percentage} size={118} stroke={10} label="weighted" />
                <div>
                  <strong>{result.matched.length} matched · {result.partial?.length || 0} partial · {result.missing.length} missing</strong>
                  <p>Skills are weighted by importance (●●● = core). A related skill counts as a partial match at half weight.</p>
                </div>
              </div>
              <SkillGroup tone="good" title="Matched" items={result.matched} icon="check" empty="No direct matches yet." />
              <SkillGroup tone="fair" title="Partially matched" items={result.partial || []} icon="refresh" empty="None." detail={(s) => `via ${s.via}`} />
              <SkillGroup tone="low" title="Missing" items={result.missing} icon="plus" empty="Nothing missing — strong fit." />
              {(result.missing.length > 0 || result.partial?.length > 0) && (
                <button className="btn btn--primary btn--block" onClick={() => go("interview")}>Practise these gaps <Icon name="arrowRight" size={15} /></button>
              )}
            </div>
          ) : (
            <Empty icon="target" title="No analysis yet" text="Add your CV, choose a role and run the analysis to see matched, partial and missing skills." />
          )}
          <Note>Prototype extraction uses the configured skill list. PDF/DOCX parsing with Gemini runs on the FastAPI server once connected.</Note>
        </Card>
      </div>
    </>
  );
}

function SkillGroup({ tone, title, items, icon, empty, detail }) {
  return (
    <div className="result__group">
      <h3><span className={`dot dot--${tone}`} /> {title} <span className="result__count">{items.length}</span></h3>
      <div className="chips">
        {items.length ? items.map((s) => (
          <span className={`chip chip--${tone}`} key={s.name} title={detail?.(s)}>
            <Icon name={icon} size={12} strokeWidth={2.4} /> {s.name}{detail && <small>{detail(s)}</small>}<Weight w={s.weight} />
          </span>
        )) : <span className="field__hint">{empty}</span>}
      </div>
    </div>
  );
}
