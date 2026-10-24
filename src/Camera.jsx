import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { averageTemplates, frameToTemplate, isLandmarkTemplate, motionBetween, similarity } from "./lib";

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

/* ---------- Face engine: MediaPipe Face Landmarker, shared by every FaceCapture ---------- */

const ENGINE_TIMEOUT = 15000; // past this, fall back to the pixel method
let faceEnginePromise = null;
function loadFaceEngine() {
  if (!faceEnginePromise) {
    faceEnginePromise = Promise.race([
      import("./faceCues").then(async (cues) => ({ cues, landmarker: await cues.createFaceLandmarker({ numFaces: 2 }) })),
      wait(ENGINE_TIMEOUT).then(() => { throw new Error("Face model timed out"); }),
    ]);
    faceEnginePromise.catch(() => { faceEnginePromise = null; }); // retry on the next attempt
  }
  return faceEnginePromise;
}

// detectForVideo needs strictly increasing timestamps.
let lastTs = 0;
const nextTs = () => (lastTs = Math.max(performance.now(), lastTs + 1));

const ENROL_CAPTURES = 3;
const CAPTURE_WINDOW = 2000; // ms to find a usable frame for each enrolment capture
const BLINK_WINDOW = 4000; // ms to blink during verification
const EYES_OPEN = 0.35; // eyeBlink blendshape below this = open
const EYES_CLOSED = 0.55; // above this = closed
const MIN_VERIFY_FRAMES = 5;
const MSG_NO_FACE = "No face found — centre your face in the oval with even lighting.";
const MSG_MANY = "Only one person please — make sure nobody else is in view.";
const MSG_TURN = "Look straight at the camera and keep your head level.";

/* Finds one usable frame: exactly one face, roughly frontal, eyes open. */
async function grabFace({ cues, landmarker }, video) {
  const end = performance.now() + CAPTURE_WINDOW;
  let reason = MSG_NO_FACE;
  while (performance.now() < end) {
    const f = cues.detectFaces(landmarker, video, nextTs());
    if (f.count > 1) return { message: MSG_MANY };
    if (f.count === 1) {
      const features = f.frontal && f.blink < EYES_OPEN ? cues.faceGeometry(f.landmarks, video.videoWidth, video.videoHeight) : null;
      if (features) return { features };
      reason = f.frontal ? "Keep your eyes open while we capture." : MSG_TURN;
    }
    await wait(60);
  }
  return { message: reason };
}

async function landmarkEnroll(engine, video, report) {
  const samples = [];
  for (let i = 0; i < ENROL_CAPTURES; i++) {
    report(`Capture ${i + 1} of ${ENROL_CAPTURES} — hold still and look at the camera…`);
    const shot = await grabFace(engine, video);
    if (!shot.features) return { ok: false, message: shot.message };
    samples.push(shot.features);
    report(null, Math.round(((i + 1) / ENROL_CAPTURES) * 100));
    await wait(400);
  }
  const features = engine.cues.averageGeometry(samples);
  const consistency = Math.min(...samples.map((s) => engine.cues.compareGeometry(s, features)));
  return {
    ok: true,
    message: "Face template saved. Only landmark measurements are stored — never the photo.",
    result: { template: { v: engine.cues.FACE_TEMPLATE_VERSION, method: "landmarks", features }, quality: Math.round(consistency * 100) },
  };
}

/* Blink liveness + landmark comparison. A printed photo can't blink, so it fails. */
async function landmarkVerify({ cues, landmarker }, video, template, threshold, report) {
  report("Look at the camera and blink…");
  const start = performance.now();
  const frames = [];
  let sawOpen = false, blinked = false, sawFace = false;
  while (performance.now() - start < BLINK_WINDOW) {
    const f = cues.detectFaces(landmarker, video, nextTs());
    report(null, Math.min(100, Math.round(((performance.now() - start) / BLINK_WINDOW) * 100)));
    if (f.count > 1) return { ok: false, message: MSG_MANY };
    if (f.count === 1) {
      sawFace = true;
      if (f.blink < EYES_OPEN) {
        sawOpen = true;
        const g = f.frontal && cues.faceGeometry(f.landmarks, video.videoWidth, video.videoHeight);
        if (g) frames.push(g);
      } else if (f.blink > EYES_CLOSED && sawOpen) {
        blinked = true;
      }
      if (blinked && frames.length >= MIN_VERIFY_FRAMES) break;
    }
    await wait(50);
  }
  if (!sawFace) return { ok: false, message: MSG_NO_FACE };
  if (!blinked) return { ok: false, message: "Liveness check failed — no blink detected within 4 seconds. Blink naturally and try again." };
  if (!frames.length) return { ok: false, message: MSG_TURN };

  const sim = cues.compareGeometry(cues.averageGeometry(frames), template.features);
  if (sim < threshold) return { ok: false, message: `Face didn't match the enrolled template (similarity ${sim.toFixed(2)}, needs ${threshold}).` };
  report(null, 100);
  return { ok: true, message: `Verified · blink detected · similarity ${sim.toFixed(2)}`, result: { similarity: sim } };
}

/* ---------- Pixel fallback (used when MediaPipe can't load) ---------- */

async function pixelCapture(video, canvas, steps, gap, report) {
  const frames = [];
  for (let i = 0; i < steps; i++) {
    await wait(gap);
    const t = frameToTemplate(video, canvas);
    if (t) frames.push(t);
    report(null, Math.round(((i + 1) / steps) * 100));
  }
  return frames.length < steps || frames[0].contrast < 8 ? null : frames;
}

async function pixelEnroll(video, canvas, report) {
  report("Hold still, then turn your head slightly…");
  const frames = await pixelCapture(video, canvas, 3, 650, report);
  if (!frames) return { ok: false, message: "We couldn't see a clear face. Check your lighting and try again." };
  return {
    ok: true,
    message: "Face template saved (basic mode). Only the template is stored — never the photo.",
    result: { template: averageTemplates(frames.map((f) => f.vector)), quality: Math.round(Math.min(100, frames[0].contrast * 1.6)) },
  };
}

async function pixelVerify(video, canvas, template, threshold, report) {
  report("Look at the camera and blink…");
  const frames = await pixelCapture(video, canvas, 4, 380, report);
  if (!frames) return { ok: false, message: "We couldn't see a clear face. Check your lighting and try again." };
  const live = motionBetween(frames[0].raw, frames[frames.length - 1].raw);
  const sim = Math.max(...frames.map((f) => similarity(f.vector, template)));
  if (live < 0.8) return { ok: false, message: "Liveness check failed — the image didn't move. Blink or move slightly and retry." };
  if (sim < threshold) return { ok: false, message: `Face didn't match the enrolled template (similarity ${sim.toFixed(2)}, needs ${threshold}).` };
  return { ok: true, message: `Verified (basic mode) · similarity ${sim.toFixed(2)}`, result: { similarity: sim } };
}

/**
 * Face enrolment / verification step.
 *  mode="enroll": requires exactly one face, captures 3 samples and returns an
 *                 averaged landmark-geometry template.
 *  mode="verify": blink liveness within 4s, then compares live geometry to `template`.
 *                 An older pixel template is replaced by re-enrolling once
 *                 (onComplete then receives a new `template`).
 * If MediaPipe can't load, the older pixel method is used instead.
 */
export function FaceCapture({ mode = "enroll", template, threshold = 0.55, onComplete, onFallback, fallbackLabel }) {
  const { videoRef, status } = useCamera(true);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | capturing | success | fail
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  // Start downloading the model as soon as the step opens.
  useEffect(() => { loadFaceEngine().catch(() => {}); }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setPhase("capturing");
    setMessage("Loading face model…");
    const report = (msg, pct) => {
      if (msg) setMessage(msg);
      if (pct != null) setProgress(pct);
    };

    const engine = await loadFaceEngine().catch(() => null);
    let r;
    try {
      if (mode === "enroll") {
        r = engine ? await landmarkEnroll(engine, video, report) : await pixelEnroll(video, canvas, report);
      } else if (isLandmarkTemplate(template)) {
        r = engine
          ? await landmarkVerify(engine, video, template, threshold, report)
          : { ok: false, message: "The face model couldn't load, so face verification isn't available right now. Try again or use the password fallback below." };
      } else if (engine) {
        // Older pixel template: re-enrol once with landmarks.
        report("Face login was upgraded — we'll re-enrol your face once.");
        await wait(1200);
        r = await landmarkEnroll(engine, video, report);
      } else {
        r = await pixelVerify(video, canvas, template, threshold, report);
      }
    } catch {
      r = { ok: false, message: "Face check failed unexpectedly. Please try again." };
    }

    if (!r.ok) {
      setPhase("fail");
      setMessage(r.message);
      return;
    }
    setPhase("success");
    setMessage(r.message);
    await wait(900);
    onComplete(r.result);
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
