/* =========================================================
   Face cues (MediaPipe Face Landmarker) — loaded lazily, only in video mode.
   Produces observable presentation cues: eye-contact consistency and
   facial expressiveness. Not a measure of confidence or personality.
   ========================================================= */

import { FaceLandmarker } from "@mediapipe/tasks-vision";
// Wasm runtime is served from our own bundle so it always matches the JS version.
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

const MODEL_URL =
  import.meta.env.VITE_FACE_MODEL_URL ||
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const MAX_YAW = 20; // degrees
const MAX_PITCH = 20;
const IRIS_CENTER = [0.35, 0.65]; // iris position between eye corners, 0 = outer, 1 = inner
const MIN_FACE_FRAMES = 5;

/** Creates a Face Landmarker in VIDEO mode, preferring GPU and falling back to CPU.
 *  Face login asks for 2 faces so it can reject frames with more than one person. */
export async function createFaceLandmarker({ numFaces = 1 } = {}) {
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numFaces,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

/** Runs the landmarker on one video frame and reduces it to a small sample. */
export function sampleFace(landmarker, video, timestamp) {
  const res = landmarker.detectForVideo(video, timestamp);
  const lm = res.faceLandmarks?.[0];
  if (!lm) return { face: false };

  const { yaw, pitch } = headPose(res.facialTransformationMatrixes?.[0]);
  const w = video.videoWidth || 1, h = video.videoHeight || 1;
  const irisA = irisRatio(lm, 468, 33, 133, w, h);
  const irisB = irisRatio(lm, 473, 263, 362, w, h);
  const iris = irisA != null && irisB != null ? (irisA + irisB) / 2 : irisA ?? irisB;

  const headOk = yaw != null ? Math.abs(yaw) <= MAX_YAW && Math.abs(pitch) <= MAX_PITCH : true;
  const irisOk = iris == null || (iris >= IRIS_CENTER[0] && iris <= IRIS_CENTER[1]);

  const b = Object.fromEntries((res.faceBlendshapes?.[0]?.categories || []).map((c) => [c.categoryName, c.score]));
  const smile = ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2;
  const brow = (b.browInnerUp || 0) + ((b.browOuterUpLeft || 0) + (b.browOuterUpRight || 0)) / 2 - ((b.browDownLeft || 0) + (b.browDownRight || 0)) / 2;

  return { face: true, facing: headOk && irisOk, smile, brow };
}

/** Summarises samples into 0–100 cues, or nulls if there is too little face data. */
export function summariseFace(samples) {
  const faces = samples.filter((s) => s.face);
  if (samples.length < MIN_FACE_FRAMES || faces.length < MIN_FACE_FRAMES) return { eyeContact: null, expressiveness: null };
  const eyeContact = Math.round((faces.filter((s) => s.facing).length / samples.length) * 100);
  // Typical speaking variation sits around 0.05–0.15 per signal; 0.2 combined maps to 100.
  const variation = stdDev(faces.map((s) => s.smile)) + stdDev(faces.map((s) => s.brow));
  const expressiveness = Math.round(Math.min(100, (variation / 0.2) * 100));
  return { eyeContact, expressiveness };
}

/* =========================================================
   Face login: landmark geometry template.
   The template is the set of pairwise 3D distances between rigid key points,
   divided by the distance between the eye centres so it doesn't depend on how
   far the user sits from the camera. Only these numbers are stored.
   ========================================================= */

export const FACE_TEMPLATE_VERSION = 2;

// Eye corners (first four, used for scale), nose, mouth corners, cheekbones,
// jaw, chin, forehead and outer brows. Eyelids and lips are left out so that
// blinking and small mouth movements barely change the template.
const KEY_POINTS = [33, 133, 362, 263, 168, 6, 1, 2, 98, 327, 61, 291, 116, 345, 234, 454, 132, 361, 172, 397, 152, 10, 70, 300];
const MAX_LOGIN_ANGLE = 15; // degrees; captures must be roughly frontal
const GEOMETRY_SCALE = 0.12; // mean distance difference (in eye-distance units) that maps to similarity 0

/** Detects faces in one frame. Returns the face count, and for a single face its landmarks, pose and blink score. */
export function detectFaces(landmarker, video, timestamp) {
  const res = landmarker.detectForVideo(video, timestamp);
  const faces = res.faceLandmarks || [];
  if (faces.length !== 1) return { count: faces.length };
  const { yaw, pitch } = headPose(res.facialTransformationMatrixes?.[0]);
  const b = Object.fromEntries((res.faceBlendshapes?.[0]?.categories || []).map((c) => [c.categoryName, c.score]));
  return {
    count: 1,
    landmarks: faces[0],
    frontal: yaw == null || (Math.abs(yaw) <= MAX_LOGIN_ANGLE && Math.abs(pitch) <= MAX_LOGIN_ANGLE),
    blink: ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)) / 2,
  };
}

/** Normalised geometry vector for one face, or null if key points are missing. */
export function faceGeometry(lm, w, h) {
  const pts = KEY_POINTS.map((i) => lm[i] && [lm[i].x * w, lm[i].y * h, lm[i].z * w]);
  if (pts.some((p) => !p)) return null;
  const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
  const eyes = dist(mid(pts[0], pts[1]), mid(pts[2], pts[3]));
  if (!eyes) return null;
  const out = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) out.push(dist(pts[i], pts[j]) / eyes);
  return out;
}

/** 0–1 similarity between two geometry vectors (1 = identical). */
export function compareGeometry(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return Math.max(0, 1 - d / a.length / GEOMETRY_SCALE);
}

export function averageGeometry(list) {
  const out = new Array(list[0].length).fill(0);
  list.forEach((v) => v.forEach((x, i) => (out[i] += x / list.length)));
  return out.map((x) => +x.toFixed(4));
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/* Yaw/pitch in degrees from the 4×4 column-major facial transformation matrix. */
function headPose(m) {
  if (!m?.data || m.data.length < 16) return { yaw: null, pitch: null };
  const d = m.data;
  const r02 = d[8], r12 = d[9], r22 = d[10];
  const deg = 180 / Math.PI;
  return { yaw: Math.atan2(r02, r22) * deg, pitch: Math.asin(Math.max(-1, Math.min(1, -r12))) * deg };
}

/* Iris centre projected onto the corner-to-corner line of one eye (in pixel space). */
function irisRatio(lm, iris, outer, inner, w, h) {
  const p = lm[iris], a = lm[outer], b = lm[inner];
  if (!p || !a || !b) return null;
  const ex = (b.x - a.x) * w, ey = (b.y - a.y) * h;
  const len2 = ex * ex + ey * ey;
  if (!len2) return null;
  return (((p.x - a.x) * w) * ex + ((p.y - a.y) * h) * ey) / len2;
}

function stdDev(xs) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}
