import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

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

const ENGINE_TIMEOUT = 15000; // past this, face verification reports the model as unavailable
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

/* Blink liveness, then the live geometry. A printed photo can't blink, so it fails here.
 * Matching against the enrolled template is done by the caller (api.completeFace — on the server in backend mode). */
async function landmarkLiveness({ cues, landmarker }, video, report) {
  report("Look at the camera and blink…");
  const start = performance.now();
  const frames = [];
  const samples = []; // { t, v }: every frame's blink score, so the server can re-check the blink
  let sawOpen = false, blinked = false, sawFace = false;
  while (performance.now() - start < BLINK_WINDOW) {
    const f = cues.detectFaces(landmarker, video, nextTs());
    report(null, Math.min(100, Math.round(((performance.now() - start) / BLINK_WINDOW) * 100)));
    if (f.count > 1) return { ok: false, message: MSG_MANY };
    if (f.count === 1) {
      sawFace = true;
      const t = Math.round(performance.now() - start);
      if (!samples.length || t > samples[samples.length - 1].t) samples.push({ t, v: +f.blink.toFixed(3) });
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
  report(null, 100);
  return { ok: true, template: { v: cues.FACE_TEMPLATE_VERSION, method: "landmarks", features: cues.averageGeometry(frames) }, liveness: { samples } };
}

const MSG_NO_CAMERA = "A camera is required to sign in. Allow camera access, or ask an admin to reset your face.";
const MSG_NO_MODEL = "The face model couldn't load, so face verification isn't available right now. Check your connection and try again.";

/**
 * Face enrolment / verification step (required to sign in, no skip).
 *  mode="enroll": requires exactly one face, captures 3 samples and returns an
 *                 averaged landmark-geometry template via onComplete({ template, quality }).
 *  mode="verify": blink liveness within 4s, then passes the live template and the blink
 *                 evidence to the async `verify(template, liveness)`. Its resolved value goes to onComplete; if it throws,
 *                 the error message is shown.
 * Every failed attempt calls onFail(error) — sign-in uses it to count attempts.
 */
export function FaceCapture({ mode = "enroll", verify, onComplete, onFail }) {
  const { videoRef, status } = useCamera(true);
  const [phase, setPhase] = useState("idle"); // idle | capturing | success | fail
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  // Start downloading the model as soon as the step opens.
  useEffect(() => { loadFaceEngine().catch(() => {}); }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setPhase("capturing");
    setMessage("Loading face model…");
    const report = (msg, pct) => {
      if (msg) setMessage(msg);
      if (pct != null) setProgress(pct);
    };

    const engine = await loadFaceEngine().catch(() => null);
    let r;
    try {
      if (!engine) r = { ok: false, message: MSG_NO_MODEL };
      else if (mode === "enroll") r = await landmarkEnroll(engine, video, report);
      else {
        const live = await landmarkLiveness(engine, video, report);
        if (!live.ok) r = live;
        else {
          report("Blink detected · checking your face…");
          try {
            r = { ok: true, message: "Verified · blink detected", result: await verify(live.template, live.liveness) };
          } catch (err) {
            r = { ok: false, message: err.message, error: err };
          }
        }
      }
    } catch {
      r = { ok: false, message: "Face check failed unexpectedly. Please try again." };
    }

    if (!r.ok) {
      setPhase("fail");
      setMessage(r.message);
      onFail?.(r.error || new Error(r.message));
      return;
    }
    setPhase("success");
    setMessage(r.message);
    await wait(900);
    onComplete(r.result);
  }, [mode, onComplete, onFail, verify, videoRef]);

  const camOk = status === "ready";

  return (
    <div className="facecap">
      <div className={`facecap__stage facecap__stage--${phase}`}>
        <video ref={videoRef} muted playsInline className={camOk ? "" : "is-hidden"} />
        {!camOk && (
          <div className="facecap__placeholder">
            <Icon name={status === "denied" ? "lock" : "camera"} size={28} />
            <strong>
              {status === "starting" && "Starting camera…"}
              {status === "denied" && "Camera permission denied"}
              {status === "unavailable" && "No camera available"}
              {status === "idle" && "Camera off"}
            </strong>
            {(status === "denied" || status === "unavailable") && <span>{MSG_NO_CAMERA}</span>}
          </div>
        )}
        {camOk && <div className="facecap__oval" aria-hidden="true" />}
        {phase === "capturing" && <div className="facecap__scan" aria-hidden="true" />}
        {phase === "success" && <div className="facecap__badge facecap__badge--good"><Icon name="check" size={18} strokeWidth={2.6} /></div>}
        {camOk && <div className="facecap__progress" style={{ width: `${progress}%` }} />}
      </div>

      <p className={`facecap__msg ${phase === "fail" ? "is-bad" : phase === "success" ? "is-good" : ""}`}>
        {message || (mode === "enroll" ? "Centre your face in the oval with even lighting." : "Centre your face in the oval, then blink when asked.")}
      </p>

      <div className="facecap__actions">
        <button type="button" className="btn btn--primary btn--block" disabled={!camOk || phase === "capturing" || phase === "success"} onClick={() => { setProgress(0); capture(); }}>
          <Icon name="scan" size={16} />
          {phase === "fail" ? "Try again" : mode === "enroll" ? "Set up face verification" : "Verify my face"}
        </button>
      </div>
    </div>
  );
}
