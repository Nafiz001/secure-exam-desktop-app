// Pure logic, no TensorFlow/DOM/WebGL needed — run with plain `node --test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateHeadPose,
  classifyHeadPose,
  YAW_THRESHOLD,
  PITCH_DOWN_THRESHOLD,
  PITCH_UP_THRESHOLD
} from '../src/features/student/headPose.js';

function landmarks({ rightEye, leftEye, noseTip }) {
  return {
    landmarks: [rightEye, leftEye, noseTip, [0, 0], [0, 0], [0, 0]],
    topLeft: [0, 0],
    bottomRight: [100, 100] // faceH = 100
  };
}

test('estimateHeadPose: face looking straight ahead yields near-zero yaw/pitch', () => {
  // Symmetric eyes, nose centered between them and slightly below -> yaw ~0.
  const pose = estimateHeadPose(landmarks({
    rightEye: [40, 30],
    leftEye: [60, 30],
    noseTip: [50, 45]
  }));
  assert.ok(Math.abs(pose.yaw) < 0.05, `expected near-zero yaw, got ${pose.yaw}`);
});

test('estimateHeadPose: nose shifted toward one eye produces nonzero yaw in that direction', () => {
  const poseRight = estimateHeadPose(landmarks({
    rightEye: [40, 30], leftEye: [60, 30], noseTip: [45, 45] // nose pulled toward rightEye
  }));
  const poseLeft = estimateHeadPose(landmarks({
    rightEye: [40, 30], leftEye: [60, 30], noseTip: [55, 45] // nose pulled toward leftEye
  }));
  assert.ok(poseRight.yaw < 0, `expected negative yaw when nose shifts toward rightEye, got ${poseRight.yaw}`);
  assert.ok(poseLeft.yaw > 0, `expected positive yaw when nose shifts toward leftEye, got ${poseLeft.yaw}`);
  assert.ok(Math.abs(poseRight.yaw) <= 1 && Math.abs(poseLeft.yaw) <= 1);
});

test('estimateHeadPose: degenerate face box (near-zero eyeWidth or faceH) falls back to a safe default', () => {
  const pose = estimateHeadPose({
    landmarks: [[50, 30], [50, 30], [50, 45], [0, 0], [0, 0], [0, 0]], // eyeWidth = 0
    topLeft: [0, 0],
    bottomRight: [100, 100]
  });
  assert.deepEqual(pose, { yaw: 0, pitch: 0.4 });
});

test('estimateHeadPose: malformed prediction (missing landmarks) does not throw', () => {
  const pose = estimateHeadPose({});
  assert.deepEqual(pose, { yaw: 0, pitch: 0.4 });
});

test('classifyHeadPose: within all thresholds is "ok"', () => {
  assert.equal(classifyHeadPose({ yaw: 0, pitch: 0.3 }), 'ok');
});

test('classifyHeadPose: yaw beyond YAW_THRESHOLD (either direction) is "looking_away"', () => {
  assert.equal(classifyHeadPose({ yaw: YAW_THRESHOLD + 0.01, pitch: 0.3 }), 'looking_away');
  assert.equal(classifyHeadPose({ yaw: -(YAW_THRESHOLD + 0.01), pitch: 0.3 }), 'looking_away');
});

test('classifyHeadPose: pitch above PITCH_DOWN_THRESHOLD is "looking_down"', () => {
  assert.equal(classifyHeadPose({ yaw: 0, pitch: PITCH_DOWN_THRESHOLD + 0.01 }), 'looking_down');
});

test('classifyHeadPose: pitch below PITCH_UP_THRESHOLD is "looking_away"', () => {
  assert.equal(classifyHeadPose({ yaw: 0, pitch: PITCH_UP_THRESHOLD - 0.01 }), 'looking_away');
});

test('classifyHeadPose: values exactly at a threshold are not flagged (strict inequality)', () => {
  assert.equal(classifyHeadPose({ yaw: YAW_THRESHOLD, pitch: 0.3 }), 'ok');
  assert.equal(classifyHeadPose({ yaw: 0, pitch: PITCH_DOWN_THRESHOLD }), 'ok');
  assert.equal(classifyHeadPose({ yaw: 0, pitch: PITCH_UP_THRESHOLD }), 'ok');
});
