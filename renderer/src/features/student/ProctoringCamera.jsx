import { useCallback, useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl"; // GPU backend — no WASM needed
import * as blazeface from "@tensorflow-models/blazeface";
import { apiRequest } from "../../api";

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Yaw (left-right): (noseTip.x - eyeMid.x) / eyeWidth
const YAW_THRESHOLD = 0.32;
// Pitch (up-down):  (noseTip.y - eyeMid.y) / faceHeight
const PITCH_DOWN_THRESHOLD = 0.70; // head dropped -> phone/notes
const PITCH_UP_THRESHOLD = 0.05;   // head raised -> looking up/away

// Snapshot upload interval — 3s so teacher sees near-live frames
const SNAPSHOT_INTERVAL_MS = 3000;

// Canvas display size must match the CSS .proctor-cam-video dimensions exactly
const DISPLAY_W = 200;
const DISPLAY_H = 150;

// Per-event throttle — don't resend same event within this window
const EVENT_THROTTLE_MS = 30000;

// Camera warmup — give the sensor and the student time to settle before any
// detection runs, otherwise BlazeFace sees auto-exposure/half-framed frames
// and fires false-positive violations immediately.
const CAMERA_WARMUP_MS = 5000;

// After warmup, also discard the first N detection frames silently so the
// student has a moment to position themselves before any event is reported.
const STABILIZATION_FRAMES = 8;

// ─── Head pose from BlazeFace keypoints ──────────────────────────────────────
// BlazeFace landmark order: 0=rightEye, 1=leftEye, 2=noseTip, 3=mouth,
//                           4=rightEar, 5=leftEar
function estimateHeadPose(prediction) {
  try {
    const lms = prediction.landmarks; // [[x,y], ...]
    const rightEye = lms[0];
    const leftEye = lms[1];
    const noseTip = lms[2];

    const eyeMidX = (leftEye[0] + rightEye[0]) / 2;
    const eyeMidY = (leftEye[1] + rightEye[1]) / 2;
    const eyeWidth = Math.abs(rightEye[0] - leftEye[0]);
    const faceH = prediction.bottomRight[1] - prediction.topLeft[1];

    if (eyeWidth < 1 || faceH < 1) return { yaw: 0, pitch: 0.4 };

    const yaw = (noseTip[0] - eyeMidX) / eyeWidth; // left-right
    const pitch = (noseTip[1] - eyeMidY) / faceH; // up-down
    return { yaw, pitch };
  } catch {
    return { yaw: 0, pitch: 0.4 };
  }
}

const STATUS_MESSAGES = {
  loading: "Loading detection model...",
  denied: "Camera access denied. Enable camera permission to continue.",
  model_error: "Failed to load face detection model. Check your internet connection and restart.",
  camera_error: "Could not access camera. Check that no other app is using it."
};

export default function ProctoringCamera({ token, examId, enabled }) {
  const videoRef = useRef(null);
  const snapshotCanvasRef = useRef(null); // off-screen snapshot canvas
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const rafRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const isDetectingRef = useRef(false);
  const cancelledRef = useRef(false);
  const lastEventRef = useRef({}); // { eventType: timestamp }
  const lastStatusRef = useRef({ faceCount: 0, status: "ok" });
  // Counts detection frames since startup; events are suppressed until this
  // exceeds STABILIZATION_FRAMES so the camera/face has time to settle.
  const stabilizationFramesRef = useRef(0);

  // 'loading' | 'ok' | 'denied' | 'model_error' | 'camera_error'
  const [cameraStatus, setCameraStatus] = useState("loading");

  const postEvent = useCallback(
    async (eventType, details) => {
      const now = Date.now();
      if (lastEventRef.current[eventType] && now - lastEventRef.current[eventType] < EVENT_THROTTLE_MS) return;
      lastEventRef.current[eventType] = now;
      try {
        await apiRequest(
          `/proctoring/${examId}/event`,
          { method: "POST", body: JSON.stringify({ event_type: eventType, details }) },
          token
        );
      } catch {
        // never crash the exam over a proctoring network hiccup
      }
    },
    [examId, token]
  );

  const postSnapshot = useCallback(
    async (base64, faceCount, status) => {
      try {
        await apiRequest(
          `/proctoring/${examId}/snapshot`,
          { method: "POST", body: JSON.stringify({ snapshot_base64: base64, face_count: faceCount, status }) },
          token
        );
      } catch {
        // silent
      }
    },
    [examId, token]
  );

  const captureAndUploadSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = snapshotCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
    const { faceCount, status } = lastStatusRef.current;
    postSnapshot(canvas.toDataURL("image/jpeg", 0.5), faceCount, status);
  }, [postSnapshot]);

  const runDetectionFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !modelRef.current) return;

    const predictions = await modelRef.current.estimateFaces(video, false);
    const faceCount = predictions.length;

    let status = faceCount === 1 ? "ok" : "violation";
    let eventType = null;
    let details = `faces:${faceCount}`;

    if (faceCount === 0) {
      eventType = "no_face";
    } else if (faceCount > 1) {
      eventType = "multiple_faces";
    } else {
      const { yaw, pitch } = estimateHeadPose(predictions[0]);
      details = `faces:1 yaw:${yaw.toFixed(2)} pitch:${pitch.toFixed(2)}`;

      if (Math.abs(yaw) > YAW_THRESHOLD) {
        eventType = "looking_away";
        status = "warning";
      } else if (pitch > PITCH_DOWN_THRESHOLD) {
        eventType = "looking_down";
        status = "warning";
      } else if (pitch < PITCH_UP_THRESHOLD) {
        eventType = "looking_away";
        status = "warning";
      }
    }

    stabilizationFramesRef.current += 1;
    const isStabilized = stabilizationFramesRef.current > STABILIZATION_FRAMES;

    if (eventType && isStabilized) postEvent(eventType, details); // fire-and-forget

    lastStatusRef.current = { faceCount, status };
  }, [postEvent]);

  const startDetectionLoop = useCallback(() => {
    cancelledRef.current = false;

    function loop() {
      if (cancelledRef.current) return;
      rafRef.current = requestAnimationFrame(loop);

      if (!isDetectingRef.current) {
        isDetectingRef.current = true;
        runDetectionFrame()
          .catch((err) => {
            console.warn("[Proctoring] Frame error:", err.message);
          })
          .finally(() => {
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
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    cancelledRef.current = false;

    async function init() {
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

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("getUserMedia not supported"), { name: "NotSupportedError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        setCameraStatus("ok");

        setTimeout(() => {
          if (cancelledRef.current) return;
          startDetectionLoop();
          snapshotTimerRef.current = setInterval(captureAndUploadSnapshot, SNAPSHOT_INTERVAL_MS);
        }, CAMERA_WARMUP_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("[Proctoring] Camera error:", err.name, err.message);
        setCameraStatus(err.name === "NotAllowedError" || err.name === "PermissionDeniedError" ? "denied" : "camera_error");
      }
    }

    init();
    return () => stopAll();
  }, [enabled, startDetectionLoop, captureAndUploadSnapshot, stopAll]);

  if (!enabled) return null;

  return (
    <div className="proctor-cam" style={{ width: DISPLAY_W, height: DISPLAY_H }}>
      <canvas ref={snapshotCanvasRef} style={{ display: "none" }} />

      <video
        ref={videoRef}
        muted
        playsInline
        className="proctor-cam-video"
        style={{ opacity: cameraStatus === "ok" ? 1 : 0 }}
        aria-label="Webcam proctoring feed"
      />

      {cameraStatus !== "ok" ? (
        <div className={`proctor-cam-status ${cameraStatus === "loading" ? "proctor-cam-status-loading" : "proctor-cam-status-error"}`}>
          <span>{STATUS_MESSAGES[cameraStatus] ?? "Initializing..."}</span>
        </div>
      ) : (
        <div className="proctor-cam-live-badge">
          <span className="proctor-cam-live-dot" /> Live
        </div>
      )}
    </div>
  );
}
