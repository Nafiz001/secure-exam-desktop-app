import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";

// In Electron the page loads via file:// — "/models" maps to filesystem root, not the app.
// Use document.baseURI so the path resolves relative to index.html in both dev and production.
function getModelUrl() {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return new URL("models", document.baseURI).href;
  }
  return "/models"; // Vite dev server
}

const DETECTION_INTERVAL_MS  = 1500;
const SNAPSHOT_INTERVAL_MS   = 8000;
const CAMERA_WARMUP_MS       = 800;  // wait for camera to stabilize before first detection
const DETECTOR_INPUT_SIZE    = 416;  // TinyFaceDetector input — good match for 640px video
const DETECTOR_SCORE_THRESH  = 0.3;  // lowered from 0.4 — more sensitive in average lighting

// ─── Head pose thresholds ────────────────────────────────────────────────────
// Yaw  (left-right): |nose_x - eye_mid_x| / eye_width
//   Normal ~0.0, looking sideways → exceeds YAW_THRESHOLD
const YAW_THRESHOLD   = 0.20;

// Pitch (up-down):  (nose_y - eye_mid_y) / (chin_y - eye_mid_y)
//   Normal ~0.38-0.48. Looking down (phone) → exceeds PITCH_DOWN_THRESHOLD
//                       Looking up          → below  PITCH_UP_THRESHOLD
const PITCH_DOWN_THRESHOLD = 0.58;
const PITCH_UP_THRESHOLD   = 0.12;

// ─── Head pose from 68 landmarks ────────────────────────────────────────────
// Returns { yaw, pitch } — dimensionless ratios relative to face geometry.
// Upgrade 2: proper geometric calculation replacing the old single-axis heuristic.
function estimateHeadPose(detection) {
  try {
    const pts = detection.landmarks.positions;
    //  pts[36]  outer left-eye corner
    //  pts[45]  outer right-eye corner
    //  pts[30]  nose tip
    //  pts[8]   chin tip
    const leftEye  = pts[36];
    const rightEye = pts[45];
    const noseTip  = pts[30];
    const chin     = pts[8];

    const eyeMidX  = (leftEye.x + rightEye.x) / 2;
    const eyeWidth = Math.abs(rightEye.x - leftEye.x);
    const eyeMidY  = (leftEye.y + rightEye.y) / 2;
    const faceH    = chin.y - eyeMidY;

    if (eyeWidth < 1 || faceH < 1) return { yaw: 0, pitch: 0.40 };

    // Yaw:   positive = nose right of eye centre (looking left from camera POV)
    //        negative = nose left  of eye centre (looking right)
    const yaw   = (noseTip.x - eyeMidX) / eyeWidth;

    // Pitch: ~0.40 when looking straight at screen
    //        > 0.58 when chin drops (looking down at desk/phone)
    //        < 0.12 when head tilts up
    const pitch = (noseTip.y - eyeMidY) / faceH;

    return { yaw, pitch };
  } catch {
    return { yaw: 0, pitch: 0.40 };
  }
}

function classifyFaceStatus(faceCount) {
  if (faceCount === 0) return "violation";
  if (faceCount > 1)  return "violation";
  return "ok";
}

export default function ProctoringCamera({ token, examId, enabled }) {
  const videoRef            = useRef(null);
  const canvasRef           = useRef(null);
  const streamRef           = useRef(null);
  const modelsLoadedRef     = useRef(false);
  const detectionTimerRef   = useRef(null);
  const snapshotTimerRef    = useRef(null);
  const lastEventRef        = useRef({}); // keyed by event type for per-type throttle

  // 'loading' | 'ok' | 'denied' | 'model_error' | 'camera_error'
  const [cameraStatus, setCameraStatus] = useState("loading");

  // ── network helpers ──────────────────────────────────────────────────────
  const postEvent = useCallback(
    async (eventType, details) => {
      // Per-type throttle: don't resend the same event within 10s
      const now = Date.now();
      if (lastEventRef.current[eventType] && now - lastEventRef.current[eventType] < 10000) return;
      lastEventRef.current[eventType] = now;

      try {
        await fetch(`http://localhost:5000/api/proctoring/${examId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event_type: eventType, details })
        });
      } catch { /* silent — never crash the exam */ }
    },
    [examId, token]
  );

  const postSnapshot = useCallback(
    async (base64, faceCount, status) => {
      try {
        await fetch(`http://localhost:5000/api/proctoring/${examId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snapshot_base64: base64, face_count: faceCount, status })
        });
      } catch { /* silent */ }
    },
    [examId, token]
  );

  // ── snapshot capture ─────────────────────────────────────────────────────
  const captureSnapshot = useCallback((faceCount, status) => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = 320;
    canvas.height = 240;
    canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
    postSnapshot(canvas.toDataURL("image/jpeg", 0.5), faceCount, status);
  }, [postSnapshot]);

  // ── detection loop ───────────────────────────────────────────────────────
  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !modelsLoadedRef.current) return;

    try {
      // Use full landmark model (faceLandmark68Net) for accurate pose estimation
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: DETECTOR_INPUT_SIZE,
          scoreThreshold: DETECTOR_SCORE_THRESH
        }))
        .withFaceLandmarks(); // ← full 68-point net

      const faceCount = detections.length;
      let status    = classifyFaceStatus(faceCount);
      let eventType = null;
      let details   = `faces:${faceCount}`;

      if (faceCount === 0) {
        eventType = "no_face";
      } else if (faceCount > 1) {
        eventType = "multiple_faces";
      } else {
        // Single face — check head pose
        const { yaw, pitch } = estimateHeadPose(detections[0]);
        details = `faces:1 yaw:${yaw.toFixed(2)} pitch:${pitch.toFixed(2)}`;

        if (Math.abs(yaw) > YAW_THRESHOLD) {
          eventType = "looking_away";
          status    = "warning";
        } else if (pitch > PITCH_DOWN_THRESHOLD) {
          eventType = "looking_down"; // head tilted down — likely looking at phone/notes
          status    = "warning";
        } else if (pitch < PITCH_UP_THRESHOLD) {
          eventType = "looking_away"; // tilted up / away from screen
          status    = "warning";
        }
      }

      if (eventType) await postEvent(eventType, details);

      // Persist status on the video element for the snapshot timer to read
      video._proctoringStatus    = status;
      video._proctoringFaceCount = faceCount;

      // Debug — open DevTools (Ctrl+Shift+I) to see this
      console.debug(`[Proctoring] faces:${faceCount} status:${status}${eventType ? " event:" + eventType : ""}`);
    } catch (err) {
      console.warn("[Proctoring] Detection error:", err.message);
    }
  }, [postEvent]);

  // ── loops ────────────────────────────────────────────────────────────────
  const startDetectionLoop = useCallback(() => {
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    if (snapshotTimerRef.current)  clearInterval(snapshotTimerRef.current);

    detectionTimerRef.current = setInterval(runDetection, DETECTION_INTERVAL_MS);

    snapshotTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      captureSnapshot(
        video._proctoringFaceCount ?? 0,
        video._proctoringStatus    ?? "ok"
      );
    }, SNAPSHOT_INTERVAL_MS);
  }, [captureSnapshot, runDetection]);

  const stopAll = useCallback(() => {
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    if (snapshotTimerRef.current)  clearInterval(snapshotTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function init() {
      // Step 1 — load face detection models
      try {
        if (!modelsLoadedRef.current) {
          const url = getModelUrl();
          await faceapi.nets.tinyFaceDetector.loadFromUri(url);
          await faceapi.nets.faceLandmark68Net.loadFromUri(url); // ← full model (upgrade 2)
          modelsLoadedRef.current = true;
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[Proctoring] Model load failed:", err);
        setCameraStatus("model_error");
        return;
      }

      // Step 2 — access camera
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("getUserMedia not supported"), { name: "NotSupportedError" });
        }

        // Request higher resolution — more pixels = easier face detection.
        // Don't specify facingMode; some webcams silently fail that constraint.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });

        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraStatus("ok");

        // Give the camera sensor time to adjust exposure/white-balance
        // before the first detection runs — prevents false "no face" events.
        setTimeout(startDetectionLoop, CAMERA_WARMUP_MS);
      } catch (err) {
        if (cancelled) return;
        console.error("[Proctoring] Camera error:", err.name, err.message);
        setCameraStatus(
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
            ? "denied"
            : "camera_error"
        );
      }
    }

    init();
    return () => { cancelled = true; stopAll(); };
  }, [enabled, startDetectionLoop, stopAll]);

  if (!enabled) return null;

  const statusMessages = {
    loading:      "Loading camera...",
    denied:       "Camera access denied. Enable camera permission to continue.",
    model_error:  "Failed to load face detection models. Please restart the app.",
    camera_error: "Could not access camera. Check that no other app is using it."
  };

  return (
    <div className="proctor-cam-wrap">
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {cameraStatus !== "ok" ? (
        <div className={`proctor-cam-status ${cameraStatus !== "loading" ? "proctor-cam-denied" : ""}`}>
          {statusMessages[cameraStatus] ?? "Initializing..."}
        </div>
      ) : null}

      <video
        ref={videoRef}
        muted
        playsInline
        className={`proctor-cam-video ${cameraStatus === "ok" ? "proctor-cam-visible" : ""}`}
        aria-label="Webcam proctoring preview"
      />

      {cameraStatus === "ok" ? (
        <div className="proctor-cam-badge">Proctored</div>
      ) : null}
    </div>
  );
}
