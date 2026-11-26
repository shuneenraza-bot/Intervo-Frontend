import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { average, frameToTemplate, motionBetween, plural, recentQuestionIds, scoreTone, selectQuestions, wordCount } from "./lib";
import * as api from "./api";
import { Card, GeneratedBadge, Meter, Note, PageHeader, ProviderBadge, ScoreRing, Segmented } from "./ui";
import { useCamera } from "./Camera";
import { useSpeech } from "./useSpeech";

const MODES = [
  { id: "text", icon: "message", title: "Text", text: "Type your answers" },
  { id: "voice", icon: "mic", title: "Voice", text: "Speak — live transcript" },
  { id: "video", icon: "video", title: "Video", text: "Camera + voice, with presentation cues" },
];

const REASON = {
  weakness: { label: "Weak skill", tone: "warn", icon: "target" },
  gap: { label: "CV gap", tone: "violet", icon: "file" },
  role: { label: "Role skill", tone: "brand", icon: "briefcase" },
  general: { label: "General", tone: "muted", icon: "message" },
};

export default function InterviewPage({ user, db, profile, performance, gap, targetRole, go }) {
  const { notify } = useStore();
  const { config } = db;
  const [stage, setStage] = useState("setup"); // setup | live | summary
  const [roleId, setRoleId] = useState(targetRole.id);
  const [mode, setMode] = useState("text");
  const [count, setCount] = useState(config.rules.defaultQuestions);
  const [planSeed, setPlanSeed] = useState(0);
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState(null);
  const remote = api.uses("candidate"); // the server picks the questions and evaluates the answers
  const [interviewId, setInterviewId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const roles = config.roles.filter((r) => r.active !== false);
  const role = roles.find((r) => r.id === roleId) || roles[0];
  const missing = useMemo(() => (gap ? [...gap.missing, ...(gap.partial || [])].map((s) => s.name) : []), [gap]);
  const plan = useMemo(
    () => selectQuestions({ role, performance, missingSkills: missing, questions: config.questions, count, recentIds: recentQuestionIds(db.sessions, user.id) }),
    // planSeed lets the user reshuffle
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, performance, missing, config.questions, count, planSeed]
  );
  const [questions, setQuestions] = useState([]);

  async function begin() {
    if (!remote) {
      setQuestions(plan);
      setResults([]);
      return setStage("live");
    }
    setStarting(true);
    setStartError("");
    try {
      const started = await api.startInterview({ roleId: role.id, mode, count });
      setInterviewId(started.id);
      setQuestions(started.questions);
      setResults([]);
      setStage("live");
    } catch (e) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  }

  async function finish(all) {
    if (remote) {
      try {
        setSaved(await api.finishInterview(interviewId));
        setStage("summary");
        notify("Session saved to your skill history");
      } catch (e) {
        notify(e.message, "bad");
      }
      return;
    }
    const session = {
      userId: user.id, roleId: role.id, roleTitle: role.title, mode, date: Date.now(),
      score: average(all.map((r) => r.score)),
      answers: all.map((r) => ({
        questionId: r.questionId, question: r.question, skill: r.skill, type: r.type, score: r.score, criteria: r.criteria,
        answer: r.answer, followUp: r.followUp || null, indicators: r.indicators || null, reason: r.reason,
      })),
    };
    try {
      setSaved(await api.saveSession(session));
      setStage("summary");
      notify("Session saved to your skill history");
    } catch (e) {
      notify(e.message, "bad");
    }
  }

  /* ---------- Setup ---------- */
  if (stage === "setup") {
    return (
      <>
        <PageHeader kicker="Adaptive practice" title="Mock interview" subtitle="Questions are chosen from your weaknesses, CV gaps and the role's key skills. All three modes share one evaluation pipeline." />
        <div className="grid grid--split">
          <Card title="Set up your session" subtitle="About two minutes per question">
            <div className="form">
              <div className="field">
                <label>Target role</label>
                <Segmented wrap options={roles.map((r) => ({ value: r.id, label: r.title, sub: config.domains.find((d) => d.id === r.domainId)?.name }))} value={roleId} onChange={setRoleId} />
                {role?.responsibilities?.length > 0 && (
                  <div className="role-duties">
                    <strong>What this role does</strong>
                    <ul>{role.responsibilities.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Interview mode</label>
                <div className="modes">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" className={`mode ${mode === m.id ? "is-active" : ""}`} onClick={() => setMode(m.id)}>
                      <span className="mode__icon"><Icon name={m.icon} size={19} /></span>
                      <strong>{m.title}</strong>
                      <small>{m.text}</small>
                      {mode === m.id && <span className="mode__check"><Icon name="check" size={12} strokeWidth={2.8} /></span>}
                    </button>
                  ))}
                </div>
                {mode !== "text" && <p className="field__hint">{mode === "video" ? "Needs camera and microphone permission." : "Needs microphone permission."} Works best in Chrome or Edge.</p>}
              </div>
              <div className="field">
                <label>Number of questions</label>
                <Segmented options={[3, 4, 5, 6].map((n) => ({ value: n, label: `${n}` }))} value={count} onChange={setCount} />
              </div>
              <button className="btn btn--primary btn--lg" onClick={begin} disabled={starting}>
                {starting ? <><span className="spinner" /> Preparing your questions…</> : <>Begin interview <Icon name="arrowRight" size={17} /></>}
              </button>
              {startError && <p className="form__error"><Icon name="alert" size={15} /> {startError}</p>}
            </div>
          </Card>

          <Card title="Your session plan" subtitle="Why each question was picked" action={remote ? null : <button className="btn btn--text" onClick={() => setPlanSeed((s) => s + 1)}><Icon name="refresh" size={14} /> Shuffle</button>}>
            <ol className="plan">
              {plan.map((q, i) => {
                const r = REASON[q.reason];
                return (
                  <li key={q.id}>
                    <span className="plan__num">{i + 1}</span>
                    <div>
                      <strong>{q.skill}</strong>
                      <span>{q.type === "behavioral" ? "Behavioural" : "Technical"} question</span>
                    </div>
                    <span className={`badge badge--${r.tone}`}><Icon name={r.icon} size={12} /> {r.label}</span>
                  </li>
                );
              })}
            </ol>
            <Note>{remote
              ? "A preview from your saved history. The server picks the final questions when you begin, from your weak skills, CV gaps and the role's key skills."
              : `Weak skills come from your history (below ${config.rules.weakThreshold}% in ${config.rules.weakMinSessions}+ sessions). CV gaps come from your latest skill-gap analysis.`}</Note>
          </Card>
        </div>
      </>
    );
  }

  /* ---------- Summary ---------- */
  if (stage === "summary" && saved) {
    const bySkill = saved.answers;
    const indicators = saved.answers.filter((a) => a.indicators).map((a) => a.indicators);
    return (
      <>
        <PageHeader
          kicker={`Session complete · ${saved.mode} mode`}
          title={`${saved.roleTitle} · ${saved.score}%`}
          subtitle="Each answer below is now part of your per-skill history."
          actions={<><button className="btn btn--ghost" onClick={() => go("progress")}>View progress</button><button className="btn btn--primary" onClick={() => setStage("setup")}>New session <Icon name="refresh" size={15} /></button></>}
        />
        <div className="summary">
          <div className="stack">
            <Card className="summary__score">
              <ScoreRing value={saved.score} size={150} stroke={12} label="session score" />
              <p className="muted">{saved.score >= 75 ? "Strong round — keep the momentum." : saved.score >= config.rules.weakThreshold ? "Good base. Tighten structure and examples." : "Practise the flagged skills and try again."}</p>
            </Card>
            {indicators.length > 0 && <IndicatorCard indicators={averageIndicators(indicators)} />}
          </div>
          <Card title="Answer breakdown">
            <ol className="breakdown">
              {bySkill.map((r, i) => (
                <li key={i}>
                  <span className="breakdown__num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="breakdown__body">
                    <strong>{r.question}</strong>
                    <div className="chips"><span className="chip">{r.skill}</span>{r.followUp && <span className="chip chip--fair">Follow-up answered</span>}<GeneratedBadge origin={r.questionOrigin} /></div>
                    <div className="breakdown__criteria">
                      {config.criteria.filter((c) => r.criteria[c.key] !== undefined).map((c) => <span key={c.key}>{c.label} <b>{r.criteria[c.key]}</b></span>)}
                    </div>
                  </div>
                  <span className={`pill pill--${scoreTone(r.score, config.rules.weakThreshold)}`}>{r.score}%</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </>
    );
  }

  /* ---------- Live ---------- */
  return (
    <LiveInterview
      key={questions.map((q) => q.id).join()}
      role={role}
      mode={mode}
      remote={remote}
      interviewId={interviewId}
      questions={questions}
      config={config}
      results={results}
      setResults={setResults}
      onFinish={finish}
      onExit={() => setStage("setup")}
    />
  );
}

/* =========================================================
   Live interview: question → answer → evaluation → optional follow-up
   ========================================================= */

function LiveInterview({ role, mode, remote, interviewId, questions, config, results, setResults, onFinish, onExit }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("answer"); // answer | feedback | followup
  const [answer, setAnswer] = useState("");
  const [followAnswer, setFollowAnswer] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [evaluating, setEvaluating] = useState(false); // waiting for the server's evaluation
  const [finishing, setFinishing] = useState(false);
  const [retryable, setRetryable] = useState(false); // the last error was a timeout or the server being offline
  const q = questions[index];
  const current = results[index];
  const usesVoice = mode !== "text";
  const isFollow = phase === "followup";

  /* Speech-to-text writes into whichever field is active */
  const append = useCallback((text) => {
    const add = (prev) => (prev ? `${prev.trim()} ${text}` : text);
    if (isFollow) setFollowAnswer(add);
    else setAnswer(add);
  }, [isFollow]);
  const speech = useSpeech({ onFinal: append });
  // The audio itself goes to the server (Whisper) in backend mode; the browser transcript is the live preview and the fallback.
  const recorder = useRecorder(remote && usesVoice);
  const live = speech.listening || recorder.recording;

  /* Video: camera preview + presentation cues sampled every 500ms while recording */
  const cam = useCamera(mode === "video");
  const samples = useRef([]);
  const faceSamples = useRef([]);
  const canvasRef = useRef(null);
  const face = useFaceLandmarker(mode === "video");

  /* Face cues: ~5 frames per second through MediaPipe, when the model loaded */
  useEffect(() => {
    if (mode !== "video" || !live || face.status !== "ready") return;
    const t = setInterval(() => {
      const video = cam.videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        faceSamples.current.push(face.cues.sampleFace(face.landmarker, video, performance.now()));
      } catch {
        face.fail(); // never break the interview — eye contact just shows as unavailable
      }
    }, 200);
    return () => clearInterval(t);
  }, [mode, live, cam.videoRef, face]);
  useEffect(() => {
    if (mode !== "video" || !live) return;
    const prev = { raw: null };
    const t = setInterval(() => {
      const video = cam.videoRef.current;
      if (!video || !canvasRef.current) return;
      const f = frameToTemplate(video, canvasRef.current);
      if (!f) return;
      samples.current.push({ brightness: f.brightness, contrast: f.contrast, motion: prev.raw ? motionBetween(prev.raw, f.raw) : 0 });
      prev.raw = f.raw;
    }, 500);
    return () => clearInterval(t);
  }, [mode, live, cam.videoRef]);

  /* Answer timer */
  useEffect(() => {
    if (phase === "feedback") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase, index]);

  const text = isFollow ? followAnswer : answer;
  const words = wordCount(text);

  const busy = useRef(false);
  const startTalking = () => { speech.start(); recorder.start(); };
  const stopTalking = () => { speech.stop(); recorder.pause(); };

  async function submit(e) {
    e?.preventDefault();
    if (busy.current) return;
    busy.current = true;
    stopTalking();
    try {
      const audio = remote && usesVoice ? await recorder.finish() : null; // kept for a retry after a failure
      // With audio the server transcribes it (and rejects silence), so the browser preview may be empty.
      if (words < 12 && !audio) return setError(usesVoice ? "We need a little more — record at least two or three sentences." : "Write at least two or three sentences so the answer can be evaluated.");
      setError("");
      setRetryable(false);
      const indicators = mode === "video" ? summariseIndicators(samples.current, face.status === "ready" ? face.cues.summariseFace(faceSamples.current) : null) : null;
      setEvaluating(true);
      try {
        if (remote) await submitRemote(audio, indicators);
        else await submitLocal(indicators);
      } catch (err) {
        setRetryable(!!err.retryable);
        return setError(err.message);
      } finally {
        setEvaluating(false);
      }
      recorder.reset();
      samples.current = [];
      faceSamples.current = [];
      setPhase("feedback");
    } finally {
      busy.current = false;
    }
  }

  async function submitLocal(indicators) {
    if (isFollow) {
      // Re-evaluate the original answer together with the follow-up.
      const combined = `${answer.trim()} ${followAnswer.trim()}`;
      const ev = await api.evaluateAnswer(combined, q);
      setResults((r) => {
        const next = [...r];
        next[index] = { ...next[index], ...ev, answer: combined, followUp: { question: q.followUp, answer: followAnswer, before: next[index].score }, indicators: indicators || next[index].indicators, needsFollowUp: false };
        return next;
      });
    } else {
      const ev = await api.evaluateAnswer(answer, q);
      setResults((r) => {
        const next = [...r];
        next[index] = { ...ev, answer, questionId: q.id, question: q.text, skill: q.skill, type: q.type, reason: q.reason, indicators };
        return next;
      });
    }
  }

  async function submitRemote(audio, indicators) {
    if (isFollow) {
      const ev = await api.submitFollowUp({ interviewId, questionId: q.id, answerId: current.answerId, answer: followAnswer, indicators, audio });
      if (ev.followAnswer) setFollowAnswer(ev.followAnswer); // what Whisper heard
      setResults((r) => {
        const next = [...r];
        const before = next[index];
        next[index] = {
          ...before, ...ev, followUpQuestion: before.followUpQuestion, needsFollowUp: false, indicators: indicators || before.indicators,
          followUp: ev.followUp || { question: before.followUpQuestion, answer: ev.followAnswer, before: before.score },
          words: wordCount(`${before.answer} ${ev.followAnswer}`), transcript: ev.followAnswer && audio ? ev.followAnswer : before.transcript,
        };
        return next;
      });
    } else {
      const ev = await api.submitAnswer({ interviewId, questionId: q.id, answer, indicators, mode, audio });
      if (ev.transcript) setAnswer(ev.transcript); // what Whisper heard, in the answer box
      setResults((r) => {
        const next = [...r];
        next[index] = { ...ev, words: wordCount(ev.answer || answer), questionId: q.id, question: q.text, skill: q.skill, type: q.type, reason: q.reason, indicators };
        return next;
      });
    }
  }

  async function next() {
    if (index + 1 < questions.length) {
      recorder.reset();
      setIndex((i) => i + 1);
      setAnswer("");
      setFollowAnswer("");
      setElapsed(0);
      setError("");
      setPhase("answer");
    } else {
      setFinishing(true);
      try {
        await onFinish(results);
      } finally {
        setFinishing(false);
      }
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <>
      <PageHeader
        kicker={`${role.title} · ${mode} mode`}
        title="Mock interview"
        actions={<button className="btn btn--ghost" onClick={() => { stopTalking(); recorder.reset(); onExit(); }}><Icon name="x" size={15} /> End session</button>}
      />
      <div className="grid grid--interview">
        <Card className="live">
          <div className="live__progress">
            <span>Question {index + 1} of {questions.length}</span>
            <div className="steps-bar">
              {questions.map((_, i) => <i key={i} className={i < index || (i === index && current && phase === "feedback") ? "done" : i === index ? "current" : ""} />)}
            </div>
            <span className="live__timer"><Icon name="clock" size={14} /> {mm}:{ss}</span>
          </div>

          <div className="question">
            <div className="question__tags">
              <span className="chip chip--brand">{q.skill}</span>
              <span className="chip">{q.type === "behavioral" ? "Behavioural · use STAR" : "Technical"}</span>
              {q.reason === "weakness" && <span className="chip chip--warn"><Icon name="target" size={12} /> Targeting a weak skill</span>}
              {q.reason === "gap" && <span className="chip chip--violet"><Icon name="file" size={12} /> From your CV gap</span>}
              <GeneratedBadge origin={q.origin} />
            </div>
            <h2>{q.text}</h2>
          </div>

          {isFollow && (
            <div className="followup-q">
              <span className="followup-q__label"><Icon name="message" size={14} /> Follow-up question</span>
              <p>{current?.followUpQuestion ?? q.followUp}</p>
            </div>
          )}

          {mode === "video" && phase !== "feedback" && (
            <div className="video-box">
              <video ref={cam.videoRef} muted playsInline className={cam.status === "ready" ? "" : "is-hidden"} />
              <canvas ref={canvasRef} hidden />
              {cam.status !== "ready" && <div className="video-box__msg"><Icon name="camera" size={22} /> {cam.status === "denied" ? "Camera permission denied — you can still answer by voice." : cam.status === "unavailable" ? "No camera found — continue with voice." : "Starting camera…"}</div>}
              {live && <span className="video-box__rec"><i /> REC {mm}:{ss}</span>}
              {cam.status === "ready" && <span className="video-box__face">{face.status === "loading" ? "Loading face cues…" : face.status === "ready" ? "Face cues on" : "Eye contact unavailable"}</span>}
            </div>
          )}

          {phase !== "feedback" ? (
            <form className="form" onSubmit={submit}>
              {usesVoice && (
                <div className={`voice ${live ? "is-live" : ""}`}>
                  <button type="button" className="voice__btn" onClick={live ? stopTalking : startTalking} disabled={evaluating} aria-label={live ? "Stop recording" : "Start recording"}>
                    <Icon name={live ? "stop" : "mic"} size={20} filled={live} />
                  </button>
                  <div className="voice__text">
                    <strong>{live ? "Listening… speak naturally" : "Tap to start speaking"}</strong>
                    <span>{speech.interim || (live ? "Your words will appear below." : "Your speech is transcribed into the answer box. You can edit it before submitting.")}</span>
                  </div>
                  {live && <div className="voice__wave" aria-hidden="true">{[...Array(5)].map((_, i) => <i key={i} />)}</div>}
                </div>
              )}
              {speech.error && <p className="form__error"><Icon name="alert" size={15} /> {speech.error}</p>}
              <div className="field">
                <label htmlFor="answer">{isFollow ? "Your follow-up answer" : usesVoice ? "Transcript" : "Your answer"}</label>
                <textarea
                  id="answer" rows={usesVoice ? 5 : 8} data-lenis-prevent
                  placeholder={q.type === "behavioral" ? "Situation → Task → Action → Result…" : "Explain your approach and give an example…"}
                  value={text}
                  onChange={(e) => (isFollow ? setFollowAnswer(e.target.value) : setAnswer(e.target.value))}
                />
              </div>
              <div className="answer-bar">
                <span className={`word-count ${words >= 60 ? "is-good" : ""}`}>{plural(words, "word")} <small>· aim for 60–150</small></span>
                <button className="btn btn--primary" type="submit" disabled={evaluating}>
                  {evaluating ? <><span className="spinner" /> Evaluating your answer…</> : <>{isFollow ? "Submit follow-up" : "Submit answer"} <Icon name="arrowRight" size={16} /></>}
                </button>
              </div>
              {error && (
                <p className="form__error">
                  <Icon name="alert" size={15} /> {error}
                  {retryable && <> <button type="button" className="btn btn--ghost btn--sm" onClick={submit} disabled={evaluating}><Icon name="refresh" size={14} /> Try again</button></>}
                </p>
              )}
            </form>
          ) : (
            <Feedback
              result={current}
              config={config}
              question={q}
              onFollowUp={() => { setPhase("followup"); setElapsed(0); }}
              onRetry={remote ? null : () => { setResults((r) => r.slice(0, index)); setPhase("answer"); }}
              onNext={next}
              busy={finishing}
              remote={remote}
              isLast={index + 1 === questions.length}
            />
          )}
        </Card>

        <div className="stack card--sticky">
          <Card title="Session plan">
            <ol className="mini-steps">
              {questions.map((qq, i) => (
                <li key={qq.id} className={i === index ? "is-current" : results[i] ? "is-done" : ""}>
                  <span className="mini-steps__dot">{results[i] && i !== index ? <Icon name="check" size={11} strokeWidth={2.8} /> : i + 1}</span>
                  <div>
                    <strong>{qq.skill}</strong>
                    <span>{results[i] ? `${results[i].score}%${results[i].followUp ? " · follow-up" : ""}` : i === index ? "In progress" : REASON[qq.reason].label}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          {q.type === "behavioral" && phase !== "feedback" && (
            <Card title="STAR reminder">
              <ul className="star-list">
                <li><b>S</b> Situation — where and when</li>
                <li><b>T</b> Task — what you had to achieve</li>
                <li><b>A</b> Action — what <em>you</em> did</li>
                <li><b>R</b> Result — the outcome, ideally measured</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Feedback({ result, config, question, onFollowUp, onRetry, onNext, isLast, busy = false, remote = false }) {
  const applicable = config.criteria.filter((c) => result.criteria[c.key] !== undefined);
  const askFollow = result.needsFollowUp && !result.followUp && (result.followUpQuestion ?? question.followUp);
  return (
    <div className="feedback">
      <div className="feedback__head">
        <ScoreRing value={result.score} size={84} stroke={8} />
        <div>
          <strong>{result.followUp ? "Answer re-evaluated with follow-up" : "Answer evaluated"}</strong>
          <p>
            {plural(result.words, "word")}
            {result.starParts && (question.type === "behavioral" ? ` · STAR parts ${result.starParts.length}/4` : ` · key points ${result.keyHits.length}/${question.keywords?.length || 0}`)}
            {result.followUp && ` · was ${result.followUp.before}%`}
          </p>
          {result.provider && <ProviderBadge provider={result.provider} verb="Evaluated" />}
        </div>
      </div>
      <div className="criteria">
        {applicable.map((c) => (
          <div className="criteria__row" key={c.key}>
            <span>{c.label} <small>×{c.weight}</small></span>
            <Meter value={result.criteria[c.key]} />
            <b>{result.criteria[c.key]}</b>
          </div>
        ))}
      </div>
      {result.transcript && (
        <div className="tips">
          <span className="tips__title"><Icon name="mic" size={14} /> Transcript</span>
          <p>{result.transcript}</p>
        </div>
      )}
      {result.indicators && <IndicatorCard indicators={result.indicators} compact />}
      <div className="tips">
        <span className="tips__title"><Icon name="sparkle" size={14} /> Suggestions</span>
        <ul>{result.tips.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      {askFollow && (
        <div className="follow-up">
          <Icon name="message" size={16} />
          <span><b>Your answer looks incomplete.</b> The interviewer has a follow-up question to help you add detail.</span>
          <button className="btn btn--primary btn--sm" onClick={onFollowUp}>Answer follow-up</button>
        </div>
      )}
      <div className="feedback__actions">
        {onRetry && <button className="btn btn--ghost" onClick={onRetry}><Icon name="refresh" size={15} /> Retry question</button>}
        <button className={`btn ${askFollow ? "btn--ghost" : "btn--primary"}`} onClick={onNext} disabled={busy}>
          {busy ? <><span className="spinner" /> Saving…</> : <>{isLast ? "Finish session" : askFollow ? "Skip follow-up" : "Next question"} <Icon name="arrowRight" size={16} /></>}
        </button>
      </div>
      <Note>{remote
        ? "Scored on the server: each criterion is rated (by Gemini when available), and the overall score is calculated with your admin-set weights. Scores are assistive, not ground truth."
        : "Prototype rule-based rubric. The Gemini evaluator with JSON validation replaces it on the backend; scores are assistive, not ground truth."}</Note>
    </div>
  );
}

/* ---------- Audio recording (sent to the server for Whisper) ---------- */

const AUDIO_EXT = [["webm", "webm"], ["ogg", "ogg"], ["mp4", "m4a"], ["wav", "wav"], ["mpeg", "mp3"]];

/**
 * Records the microphone with MediaRecorder while the candidate answers. start/pause toggle one
 * continuous recording per answer; finish() stops it and resolves with { blob, ext } (the same
 * result again if asked twice, so a failed submit can be retried); reset() throws it away.
 */
const MAX_RECORD_MS = 180_000; // the server refuses recordings over about 3 minutes
function useRecorder(enabled) {
  const usedMs = useRef(0); // recorded time so far (paused time doesn't count)
  const startedAt = useRef(0);
  const limitTimer = useRef(null);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunks = useRef([]);
  const final = useRef(null);
  const [recording, setRecording] = useState(false);

  const release = useCallback(() => {
    clearTimeout(limitTimer.current);
    usedMs.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunks.current = [];
    setRecording(false);
  }, []);
  const reset = useCallback(() => { final.current = null; release(); }, [release]);

  const start = useCallback(async () => {
    if (!enabled || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      final.current = null; // recording again replaces an earlier take
      if (recRef.current?.state === "paused") {
        if (usedMs.current >= MAX_RECORD_MS) return; // at the limit: this take is complete
        recRef.current.resume();
        startedAt.current = Date.now();
        limitTimer.current = setTimeout(stopAtLimit, MAX_RECORD_MS - usedMs.current);
        return setRecording(true);
      }
      if (recRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.start();
      streamRef.current = stream;
      recRef.current = rec;
      startedAt.current = Date.now();
      limitTimer.current = setTimeout(stopAtLimit, MAX_RECORD_MS);
      setRecording(true);
    } catch {
      /* no microphone access: the live browser transcript is still used */
    }
  }, [enabled]);

  // Reaching the 3-minute limit pauses the recording; finish() then saves what was recorded.
  const stopAtLimit = useCallback(() => {
    usedMs.current = MAX_RECORD_MS;
    if (recRef.current?.state === "recording") recRef.current.pause();
    setRecording(false);
  }, []);

  const pause = useCallback(() => {
    if (recRef.current?.state === "recording") {
      clearTimeout(limitTimer.current);
      usedMs.current += Date.now() - startedAt.current;
      recRef.current.pause();
    }
    setRecording(false);
  }, []);

  const finish = useCallback(() => new Promise((resolve) => {
    if (final.current) return resolve(final.current);
    const rec = recRef.current;
    if (!rec) return resolve(null);
    const done = () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      final.current = blob.size ? { blob, ext: (AUDIO_EXT.find(([k]) => type.includes(k)) || ["", "webm"])[1] } : null;
      release();
      resolve(final.current);
    };
    if (rec.state === "inactive") return done();
    rec.onstop = done;
    rec.stop();
  }), [release]);

  useEffect(() => release, [release]);
  return { recording, start, pause, finish, reset };
}

/* ---------- Video presentation indicators ---------- */

/* MediaPipe is loaded once, on first use in video mode, and shared across sessions. */
let faceCuesPromise = null;
function loadFaceCues() {
  if (!faceCuesPromise) {
    faceCuesPromise = import("./faceCues").then(async (cues) => ({ cues, landmarker: await cues.createFaceLandmarker() }));
    faceCuesPromise.catch(() => { faceCuesPromise = null; });
  }
  return faceCuesPromise;
}

function useFaceLandmarker(enabled) {
  const [state, setState] = useState({ status: enabled ? "loading" : "off" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadFaceCues().then(
      ({ cues, landmarker }) => alive && setState({ status: "ready", cues, landmarker }),
      () => alive && setState({ status: "unavailable" })
    );
    return () => { alive = false; };
  }, [enabled]);
  const fail = useCallback(() => {
    faceCuesPromise = null; // retry on the next session
    setState({ status: "unavailable" });
  }, []);
  return useMemo(() => ({ ...state, fail }), [state, fail]);
}

const INDICATOR_KEYS = ["lighting", "framing", "steadiness", "eyeContact", "expressiveness"];

function summariseIndicators(samples, faceCues) {
  if (!samples.length) return null;
  const lit = samples.filter((s) => s.brightness > 70 && s.brightness < 200).length / samples.length;
  const present = samples.filter((s) => s.contrast > 14).length / samples.length;
  const moves = samples.slice(1).map((s) => s.motion);
  const avgMove = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;
  return {
    lighting: Math.round(lit * 100),
    framing: Math.round(present * 100),
    steadiness: Math.round(Math.max(0, Math.min(100, 100 - (avgMove - 2) * 6))),
    eyeContact: faceCues?.eyeContact ?? null,
    expressiveness: faceCues?.expressiveness ?? null,
  };
}

function averageIndicators(list) {
  return Object.fromEntries(INDICATOR_KEYS.map((k) => {
    const vals = list.map((i) => i[k]).filter((v) => typeof v === "number");
    return [k, vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null];
  }));
}

function IndicatorCard({ indicators, compact = false }) {
  const rows = [
    ["Lighting", indicators.lighting, "Face evenly lit"],
    ["Framing", indicators.framing, "Face visible in frame"],
    ["Steadiness", indicators.steadiness, "Limited camera / head movement"],
    ["Eye contact", indicators.eyeContact, "Share of sampled frames facing the camera (head angle + iris position)"],
    ["Expressiveness", indicators.expressiveness, "Variation in smile and brow movement across the answer"],
  ];
  const content = (
    <>
      <div className="criteria">
        {rows.map(([label, v, hint]) => typeof v === "number" ? (
          <div className="criteria__row" key={label} title={hint}>
            <span>{label}</span><Meter value={v} /><b>{v}</b>
          </div>
        ) : (
          <div className="criteria__row criteria__row--muted" key={label} title={hint}>
            <span>{label}</span><span className="field__hint">unavailable</span><b>—</b>
          </div>
        ))}
      </div>
      <p className="field__hint">Observable presentation cues only — not a measure of confidence or personality.</p>
    </>
  );
  return compact ? (
    <div className="indicators"><span className="tips__title"><Icon name="video" size={14} /> Presentation cues</span>{content}</div>
  ) : (
    <Card title="Presentation cues" subtitle="Averaged over your video answers">{content}</Card>
  );
}
