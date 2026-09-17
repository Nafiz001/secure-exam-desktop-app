// Head-pose estimation from BlazeFace keypoints — pure math, no TensorFlow
// dependency, so it lives in its own module and can be unit-tested without
// loading tfjs/WebGL (see renderer/test/headPose.test.js).
//
// BlazeFace landmark order: 0=rightEye, 1=leftEye, 2=noseTip, 3=mouth,
//                           4=rightEar, 5=leftEar

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Yaw (left-right): (noseTip.x - eyeMid.x) / eyeWidth
export const YAW_THRESHOLD = 0.32;
// Pitch (up-down):  (noseTip.y - eyeMid.y) / faceHeight
export const PITCH_DOWN_THRESHOLD = 0.70; // head dropped -> phone/notes
export const PITCH_UP_THRESHOLD = 0.05;   // head raised -> looking up/away

/**
 * @param {{landmarks: number[][], topLeft: number[], bottomRight: number[]}} prediction
 *   A BlazeFace prediction: landmarks is [[x,y], ...] for the 6 keypoints above,
 *   topLeft/bottomRight are the face bounding box corners.
 * @returns {{yaw: number, pitch: number}}
 */
export function estimateHeadPose(prediction) {
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

/**
 * Classifies a head-pose reading into the same event types
 * runDetectionFrame() in ProctoringCamera.jsx derives inline, so the
 * classification boundaries are covered by fast, dependency-free tests.
 * @returns {'ok'|'looking_away'|'looking_down'} 'ok' means no violation.
 */
export function classifyHeadPose({ yaw, pitch }) {
  if (Math.abs(yaw) > YAW_THRESHOLD) return "looking_away";
  if (pitch > PITCH_DOWN_THRESHOLD) return "looking_down";
  if (pitch < PITCH_UP_THRESHOLD) return "looking_away";
  return "ok";
}
