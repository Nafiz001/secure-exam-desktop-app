import { useCallback, useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl"; // GPU backend — no WASM needed
import * as blazeface from "@tensorflow-models/blazeface";
import { Camera, CameraOff, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Yaw (left-right): (noseTip.x - eyeMid.x) / eyeWidth
// Loosened (was 0.20) so a small natural head turn doesn't fire a violation.
const YAW_THRESHOLD        = 0.32;
// Pitch (up-down):  (noseTip.y - eyeMid.y) / faceHeight
const PITCH_DOWN_THRESHOLD = 0.70;  // head dropped → phone/notes (was 0.58)
const PITCH_UP_THRESHOLD   = 0.05;  // head raised → looking up/away (was 0.12)

// Snapshot upload interval — 3s so teacher sees near-live frames
const SNAPSHOT_INTERVAL_MS = 3000;

// Canvas display size must match the CSS .proctor-cam-video dimensions exactly
const DISPLAY_W = 200;
const DISPLAY_H = 150;

// Per-event throttle — don't resend same event within this window
// (longer window = fewer false positives reaching the teacher)
const EVENT_THROTTLE_MS = 30000;

// Camera warmup — give the sensor and the student time to settle before any
// detection runs. Was 800 ms, but that fired ~3 violations as soon as the
// camera turned on (BlazeFace sees auto-exposure frames or a half-framed face
// during the first second).
const CAMERA_WARMUP_MS = 5000;

// After warmup, also discard the first N detection frames silently so the
// student has a moment to position themselves before any event is reported.
const STABILIZATION_FRAMES = 8;

// ─── Head pose from BlazeFace keypoints ──────────────────────────────────────
// BlazeFace landmark order: 0=rightEye, 1=leftEye, 2=noseTip, 3=mouth,
//                           4=rightEar, 5=leftEar
function estimateHeadPose(prediction) {
  try {
    const lms      = prediction.landmarks; // [[x,y], ...]
    const rightEye = lms[0];
    const leftEye  = lms[1];
    const noseTip  = lms[2];

    const eyeMidX  = (leftEye[0] + rightEye[0]) / 2;
    const eyeMidY  = (leftEye[1] + rightEye[1]) / 2;
    const eyeWidth = Math.abs(rightEye[0] - leftEye[0]);
    const faceH    = prediction.bottomRight[1] - prediction.topLeft[1];

    if (eyeWidth < 1 || faceH < 1) return { yaw: 0, pitch: 0.40 };

    const yaw   = (noseTip[0] - eyeMidX) / eyeWidth; // left-right
    const pitch = (noseTip[1] - eyeMidY) / faceH;    // up-down
    return { yaw, pitch };
  } catch {
    return { yaw: 0, pitch: 0.40 };
  }
}

// ─── Draw live face boxes on overlay canvas ───────────────────────────────────
function drawOverlay(canvas, video, predictions) {
  if (!canvas || !video) return;
  // Always draw at the fixed display resolution — avoids 0×0 from clientWidth
  if (canvas.width !== DISPLAY_W)  canvas.width  = DISPLAY_W;
  if (canvas.height !== DISPLAY_H) canvas.height = DISPLAY_H;
  const ctx    = canvas.getContext("2d");
  const scaleX = DISPLAY_W / (video.videoWidth  || 640);
  const scaleY = DISPLAY_H / (video.videoHeight || 480);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  predictions.forEach((pred) => {
    const [x1, y1] = pred.topLeft;
    const [x2, y2] = pred.bottomRight;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;
    const x = x1 * scaleX;
    const y = y1 * scaleY;

    // Box colour: green = 1 face OK, red = suspicious
    const ok = predictions.length === 1;
    ctx.strokeStyle = ok ? "#22c55e" : "#ef4444";
    ctx.lineWidth   = 2;
    ctx.strokeRect(x, y, w, h);

    // Confidence label
    const score = (pred.probability?.[0] ?? 0);
    ctx.fillStyle = ok ? "#22c55e" : "#ef4444";
    ctx.font      = "bold 10px sans-serif";
    ctx.fillText(`${Math.round(score * 100)}%`, x + 2, y - 3);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProctoringCamera({ token, examId, enabled }) {
  const videoRef          = useRef(null);
  const overlayRef        = useRef(null); // live face-box canvas
  const snapshotCanvasRef = useRef(null); // off-screen snapshot canvas
  const streamRef         = useRef(null);
  const modelRef          = useRef(null);
  const rafRef            = useRef(null);
  const snapshotTimerRef  = useRef(null);
  const isDetectingRef    = useRef(false);
  const cancelledRef      = useRef(false);
  const lastEventRef      = useRef({});   // { eventType: timestamp }
  const lastStatusRef     = useRef({ faceCount: 0, status: "ok" });
  // Counts detection frames since startup; events are suppressed until this
  // exceeds STABILIZATION_FRAMES so the camera/face has time to settle.
  const stabilizationFramesRef = useRef(0);

  // 'loading' | 'ok' | 'denied' | 'model_error' | 'camera_error'
  const [cameraStatus, setCameraStatus] = useState("loading");

  // ── network helpers ───────────────────────────────────────────────────────
  const postEvent = useCallback(async (eventType, details) => {
    const now = Date.now();
    if (lastEventRef.current[eventType] &&
        now - lastEventRef.current[eventType] < EVENT_THROTTLE_MS) return;
    lastEventRef.current[eventType] = now;
    try {
      await fetch(`http://localhost:5000/api/proctoring/${examId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_type: eventType, details })
      });
    } catch { /* never crash the exam */ }
  }, [examId, token]);

  const postSnapshot = useCallback(async (base64, faceCount, status) => {
    try {
      await fetch(`http://localhost:5000/api/proctoring/${examId}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ snapshot_base64: base64, face_count: faceCount, status })
      });
    } catch { /* silent */ }
  }, [examId, token]);

  const captureAndUploadSnapshot = useCallback(() => {
    const video  = videoRef.current;
    const canvas = snapshotCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width  = 320;
    canvas.height = 240;
    canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
    const { faceCount, status } = lastStatusRef.current;
    postSnapshot(canvas.toDataURL("image/jpeg", 0.5), faceCount, status);
  }, [postSnapshot]);

  // ── live detection frame ──────────────────────────────────────────────────
  const runDetectionFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !modelRef.current) return;

    // returnTensors=false → plain JS arrays, no manual tensor cleanup needed
    const predictions = await modelRef.current.estimateFaces(video, false);
    const faceCount   = predictions.length;

    // Draw live face boxes
    drawOverlay(overlayRef.current, video, predictions);

    // Classify state
    let status    = faceCount === 1 ? "ok" : "violation";
    let eventType = null;
    let details   = `faces:${faceCount}`;

    if (faceCount === 0) {
      eventType = "no_face";
    } else if (faceCount > 1) {
      eventType = "multiple_faces";
    } else {
      const { yaw, pitch } = estimateHeadPose(predictions[0]);
      details = `faces:1 yaw:${yaw.toFixed(2)} pitch:${pitch.toFixed(2)}`;

      if (Math.abs(yaw) > YAW_THRESHOLD) {
        eventType = "looking_away";
        status    = "warning";
      } else if (pitch > PITCH_DOWN_THRESHOLD) {
        eventType = "looking_down";
        status    = "warning";
      } else if (pitch < PITCH_UP_THRESHOLD) {
        eventType = "looking_away";
        status    = "warning";
      }
    }

    // Skip event reporting for the first few detection frames so the camera
    // and student have time to settle (else we get a burst of false-positive
    // "no_face" / "looking_away" events as soon as the camera turns on).
    stabilizationFramesRef.current += 1;
    const isStabilized = stabilizationFramesRef.current > STABILIZATION_FRAMES;

    if (eventType && isStabilized) postEvent(eventType, details); // fire-and-forget

    lastStatusRef.current = { faceCount, status };

    // Live debug line (open DevTools → Console to see)
    console.debug(`[Proctoring] ${faceCount} face(s) | ${status}${eventType ? " | " + eventType : ""}`);
  }, [postEvent]);

  // ── RAF loop — runs on every frame, detection gated by isDetectingRef ─────
  const startDetectionLoop = useCallback(() => {
    cancelledRef.current = false;

    function loop() {
      if (cancelledRef.current) return;
      rafRef.current = requestAnimationFrame(loop);

      if (!isDetectingRef.current) {
        isDetectingRef.current = true;
        runDetectionFrame().catch((err) => {
          console.warn("[Proctoring] Frame error:", err.message);
        }).finally(() => {
          isDetectingRef.current = false;
        });
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [runDetectionFrame]);

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Clear overlay
    const canvas = overlayRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;
    cancelledRef.current = false;

    async function init() {
      // Step 1 — init TF.js WebGL backend + load BlazeFace model
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        modelRef.current = await blazeface.load({
          maxFaces: 4,
          scoreThreshold: 0.5,
          iouThreshold: 0.3
        });
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("[Proctoring] Model load failed:", err);
        setCameraStatus("model_error");
        return;
      }

      // Step 2 — camera access
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("getUserMedia not supported"), { name: "NotSupportedError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          // Set overlay canvas to fixed display size immediately
          if (overlayRef.current) {
            overlayRef.current.width  = DISPLAY_W;
            overlayRef.current.height = DISPLAY_H;
          }
        }

        setCameraStatus("ok");

        // Warm-up delay, then start RAF loop + snapshot timer
        setTimeout(() => {
          if (cancelledRef.current) return;
          startDetectionLoop();
          snapshotTimerRef.current = setInterval(captureAndUploadSnapshot, SNAPSHOT_INTERVAL_MS);
        }, CAMERA_WARMUP_MS);

      } catch (err) {
        if (cancelledRef.current) return;
        console.error("[Proctoring] Camera error:", err.name, err.message);
        setCameraStatus(
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
            ? "denied" : "camera_error"
        );
      }
    }

    init();
    return () => stopAll();
  }, [enabled, startDetectionLoop, captureAndUploadSnapshot, stopAll]);

  if (!enabled) return null;

  const statusMessages = {
    loading: "Loading detection model…",
    denied: "Camera access denied. Enable camera permission to continue.",
    model_error: "Failed to load face detection model. Check your internet connection and restart.",
    camera_error: "Could not access camera. Check that no other app is using it.",
  };

  const statusIcons = {
    loading: Loader2,
    denied: CameraOff,
    model_error: ShieldAlert,
    camera_error: CameraOff,
  };

  const StatusIcon = statusIcons[cameraStatus] || Camera;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-border bg-ink shadow-sm"
      style={{ width: DISPLAY_W, height: DISPLAY_H }}
    >
      {/* Off-screen canvas for snapshot capture only */}
      <canvas ref={snapshotCanvasRef} className="hidden" />

      {/* Live video feed */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity",
          cameraStatus === "ok" ? "opacity-100" : "opacity-0"
        )}
        aria-label="Webcam proctoring feed"
      />

      {/* Live face-box overlay — sits on top of video */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full pointer-events-none"
        aria-hidden="true"
      />

      {cameraStatus !== "ok" ? (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs font-medium",
            cameraStatus === "loading"
              ? "bg-ink text-white/90"
              : "bg-danger text-white"
          )}
        >
          <StatusIcon
            className={cn("h-6 w-6", cameraStatus === "loading" && "animate-spin")}
          />
          <span className="leading-tight">
            {statusMessages[cameraStatus] ?? "Initializing…"}
          </span>
        </div>
      ) : (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          Live
        </div>
      )}

      {cameraStatus === "ok" ? (
        <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white">
          <ShieldCheck className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}
