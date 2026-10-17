import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { averageTemplates, frameToTemplate, motionBetween, similarity } from "./lib";

/** Opens the webcam and keeps the stream bound to a <video>. */
export function useCamera(active = true, { audio = false } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | starting | ready | denied | unavailable

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setStatus("ready");
      })
      .catch((err) => setStatus(err?.name === "NotAllowedError" ? "denied" : "unavailable"));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, audio]);

  return { videoRef, streamRef, status };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Face enrolment / verification step.
 *  mode="enroll": captures 3 samples and returns an averaged template.
 *  mode="verify": captures frames over ~1.2s, checks liveness (movement between
 *                 frames, so a still photo fails) and similarity to `template`.
 */
export function FaceCapture({ mode = "enroll", template, threshold = 0.55, onComplete, onFallback, fallbackLabel }) {
  const { videoRef, status } = useCamera(true);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | capturing | success | fail
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setPhase("capturing");
    setMessage(mode === "enroll" ? "Hold still, then turn your head slightly…" : "Look at the camera and blink…");
    const frames = [];
    const steps = mode === "enroll" ? 3 : 4;
    for (let i = 0; i < steps; i++) {
      await wait(mode === "enroll" ? 650 : 380);
      const t = frameToTemplate(video, canvas);
      if (t) frames.push(t);
      setProgress(Math.round(((i + 1) / steps) * 100));
    }

    if (frames.length < steps || frames[0].contrast < 8) {
      setPhase("fail");
      setMessage("We couldn't see a clear face. Check your lighting and try again.");
      return;
    }

    if (mode === "enroll") {
      const tpl = averageTemplates(frames.map((f) => f.vector));
      setPhase("success");
      setMessage("Face template saved. Only the template is stored — never the photo.");
      await wait(900);
      onComplete({ template: tpl, quality: Math.round(Math.min(100, frames[0].contrast * 1.6)) });
      return;
    }

    const live = motionBetween(frames[0].raw, frames[frames.length - 1].raw);
    const sim = Math.max(...frames.map((f) => similarity(f.vector, template)));
    if (live < 0.8) {
      setPhase("fail");
      setMessage("Liveness check failed — the image didn't move. Blink or move slightly and retry.");
      return;
    }
    if (sim < threshold) {
      setPhase("fail");
      setMessage(`Face didn't match the enrolled template (similarity ${sim.toFixed(2)}, needs ${threshold}).`);
      return;
    }
    setPhase("success");
    setMessage(`Verified · similarity ${sim.toFixed(2)}`);
    await wait(800);
    onComplete({ similarity: sim });
  }, [mode, onComplete, template, threshold, videoRef]);

  const camOk = status === "ready";

  return (
    <div className="facecap">
      <div className={`facecap__stage facecap__stage--${phase}`}>
        <video ref={videoRef} muted playsInline className={camOk ? "" : "is-hidden"} />
        <canvas ref={canvasRef} hidden />
        {!camOk && (
          <div className="facecap__placeholder">
            <Icon name={status === "denied" ? "lock" : "camera"} size={28} />
            <strong>
              {status === "starting" && "Starting camera…"}
              {status === "denied" && "Camera permission denied"}
              {status === "unavailable" && "No camera available"}
              {status === "idle" && "Camera off"}
            </strong>
            {(status === "denied" || status === "unavailable") && <span>Allow camera access in your browser, or use the fallback below.</span>}
          </div>
        )}
        {camOk && <div className="facecap__oval" aria-hidden="true" />}
        {phase === "capturing" && <div className="facecap__scan" aria-hidden="true" />}
        {phase === "success" && <div className="facecap__badge facecap__badge--good"><Icon name="check" size={18} strokeWidth={2.6} /></div>}
        {camOk && <div className="facecap__progress" style={{ width: `${progress}%` }} />}
      </div>

      <p className={`facecap__msg ${phase === "fail" ? "is-bad" : phase === "success" ? "is-good" : ""}`}>
        {message || (mode === "enroll" ? "Centre your face in the oval with even lighting." : "Centre your face in the oval to verify it's you.")}
      </p>

      <div className="facecap__actions">
        <button type="button" className="btn btn--primary btn--block" disabled={!camOk || phase === "capturing" || phase === "success"} onClick={() => { setProgress(0); capture(); }}>
          <Icon name="scan" size={16} />
          {phase === "fail" ? "Try again" : mode === "enroll" ? "Capture face template" : "Verify my face"}
        </button>
        {onFallback && (
          <button type="button" className="btn btn--text facecap__fallback" onClick={onFallback}>
            {fallbackLabel}
          </button>
        )}
      </div>
    </div>
  );
}
