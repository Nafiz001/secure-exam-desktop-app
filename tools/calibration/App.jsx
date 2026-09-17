import { useCallback, useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as blazeface from "@tensorflow-models/blazeface";
import { estimateHeadPose, YAW_THRESHOLD, PITCH_DOWN_THRESHOLD, PITCH_UP_THRESHOLD } from "../../renderer/src/features/student/headPose";

// Dev/research tool — collects labeled (yaw, pitch) samples from a live
// webcam using the exact same estimateHeadPose() the shipping app uses, so
// the numbers this produces are about the real detector, not a re-implementation.
// Never bundled into the Electron app: run via `npm run calibrate`.

const LABELS = [
  { key: "straight", title: "Looking straight at screen", hint: "Normal exam posture -- the negative class." },
  { key: "left", title: "Looking left (away)", hint: "Turn head/eyes toward the left edge of your screen." },
  { key: "right", title: "Looking right (away)", hint: "Turn head/eyes toward the right edge of your screen." },
  { key: "down", title: "Looking down (phone/notes)", hint: "Tilt head down as if reading something in your lap." },
  { key: "up", title: "Looking up/away", hint: "Tilt head up or look above the screen." }
];

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(samples, key, metric) {
  const values = samples.filter((s) => s.label === key).map((s) => s[metric]).sort((a, b) => a - b);
  if (values.length === 0) return null;
  return {
    n: values.length,
    min: values[0],
    max: values[values.length - 1],
    p05: percentile(values, 0.05),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95)
  };
}

export default function App() {
  const videoRef = useRef(null);
  const modelRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const latestPoseRef = useRef(null);

  const [status, setStatus] = useState("loading"); // loading | ready | denied | error
  const [errorMsg, setErrorMsg] = useState("");
  const [livePose, setLivePose] = useState(null);
  const [faceCount, setFaceCount] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState("straight");
  const [samples, setSamples] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        modelRef.current = await blazeface.load({ maxFaces: 1, scoreThreshold: 0.5, iouThreshold: 0.3 });
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("Model load failed: " + err.message);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus(err.name === "NotAllowedError" ? "denied" : "error");
        setErrorMsg(err.message);
      }
    }

    init();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return undefined;
    let stopped = false;

    async function loop() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && modelRef.current) {
        try {
          const predictions = await modelRef.current.estimateFaces(video, false);
          setFaceCount(predictions.length);
          if (predictions.length === 1) {
            const pose = estimateHeadPose(predictions[0]);
            latestPoseRef.current = pose;
            setLivePose(pose);
          } else {
            latestPoseRef.current = null;
            setLivePose(null);
          }
        } catch {
          // ignore transient frame errors
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status]);

  const captureSample = useCallback(() => {
    const pose = latestPoseRef.current;
    if (!pose) return;
    setSamples((prev) => [
      ...prev,
      { label: selectedLabel, yaw: pose.yaw, pitch: pose.pitch, t: Date.now() }
    ]);
  }, [selectedLabel]);

  const clearSamples = useCallback(() => setSamples([]), []);

  const removeLast = useCallback(() => setSamples((prev) => prev.slice(0, -1)), []);

  const exportCsv = useCallback(() => {
    const header = "label,yaw,pitch,timestamp_ms\n";
    const rows = samples.map((s) => `${s.label},${s.yaw},${s.pitch},${s.t}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `headpose-calibration-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [samples]);

  const yawSummaries = LABELS.reduce((acc, l) => {
    acc[l.key] = summarize(samples, l.key, "yaw");
    return acc;
  }, {});
  const pitchSummaries = LABELS.reduce((acc, l) => {
    acc[l.key] = summarize(samples, l.key, "pitch");
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 24, color: "#1e293b" }}>
      <h1>Head-Pose Threshold Calibration</h1>
      <p style={{ color: "#475569" }}>
        Collects labeled (yaw, pitch) samples from <code>estimateHeadPose()</code> -- the exact function
        <code> ProctoringCamera.jsx</code> uses -- against known head positions, so the detection thresholds
        can be set from data instead of by inspection. Sit at your normal exam distance from the camera before
        collecting samples. Aim for at least 20-30 samples per label, ideally from more than one person.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
        <div>
          <video ref={videoRef} muted playsInline width={320} height={240} style={{ background: "#000", borderRadius: 8 }} />
          <div style={{ marginTop: 8, fontSize: 14 }}>
            Status: <strong>{status}</strong>
            {errorMsg ? <span style={{ color: "#b91c1c" }}> -- {errorMsg}</span> : null}
            <br />
            Faces detected: <strong>{faceCount}</strong>
            <br />
            Live yaw: <strong>{livePose ? livePose.yaw.toFixed(3) : "--"}</strong>
            {"  "}
            Live pitch: <strong>{livePose ? livePose.pitch.toFixed(3) : "--"}</strong>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <h2 style={{ fontSize: 18 }}>1. Choose the pose you are holding</h2>
          {LABELS.map((l) => (
            <label key={l.key} style={{ display: "block", marginBottom: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="label"
                value={l.key}
                checked={selectedLabel === l.key}
                onChange={() => setSelectedLabel(l.key)}
              />{" "}
              <strong>{l.title}</strong>
              <span style={{ color: "#64748b" }}> -- {l.hint}</span>
            </label>
          ))}

          <h2 style={{ fontSize: 18, marginTop: 16 }}>2. Hold the pose, then capture</h2>
          <button
            type="button"
            onClick={captureSample}
            disabled={!livePose}
            style={{ padding: "10px 20px", fontSize: 16, cursor: livePose ? "pointer" : "not-allowed" }}
          >
            Capture sample ({samples.filter((s) => s.label === selectedLabel).length} collected for "{selectedLabel}")
          </button>
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={removeLast} disabled={samples.length === 0}>Undo last</button>{" "}
            <button type="button" onClick={clearSamples} disabled={samples.length === 0}>Clear all</button>{" "}
            <button type="button" onClick={exportCsv} disabled={samples.length === 0}>Export CSV</button>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>3. Per-label summary (n / min / p05 / median / p95 / max)</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
            <th style={{ padding: "4px 8px" }}>Label</th>
            <th colSpan={6} style={{ padding: "4px 8px" }}>yaw</th>
            <th colSpan={6} style={{ padding: "4px 8px" }}>pitch</th>
          </tr>
        </thead>
        <tbody>
          {LABELS.map((l) => {
            const y = yawSummaries[l.key];
            const p = pitchSummaries[l.key];
            const fmt = (v) => (v === null || v === undefined ? "--" : v.toFixed(3));
            return (
              <tr key={l.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "4px 8px" }}>{l.key}</td>
                <td style={{ padding: "4px 8px" }}>{y ? y.n : 0}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(y?.min)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(y?.p05)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(y?.p50)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(y?.p95)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(y?.max)}</td>
                <td style={{ padding: "4px 8px" }}>{p ? p.n : 0}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(p?.min)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(p?.p05)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(p?.p50)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(p?.p95)}</td>
                <td style={{ padding: "4px 8px" }}>{fmt(p?.max)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>4. Current thresholds vs. this session's data</h2>
      <p style={{ color: "#475569" }}>
        Current shipped values: <code>YAW_THRESHOLD = {YAW_THRESHOLD}</code>,{" "}
        <code>PITCH_DOWN_THRESHOLD = {PITCH_DOWN_THRESHOLD}</code>,{" "}
        <code>PITCH_UP_THRESHOLD = {PITCH_UP_THRESHOLD}</code>.
      </p>
      <p style={{ color: "#475569" }}>
        A reasonable data-driven choice sets each threshold between the 95th percentile of the
        "straight" class and the 5th percentile of the corresponding deviation class (minimizing
        both false positives on straight-ahead gaze and false negatives on genuine deviation). Collect
        enough samples per label above, then compute that midpoint from the exported CSV -- this page
        intentionally does not auto-suggest a number from a single short session, since one person's few
        dozen samples under one lighting condition is not enough to justify replacing the shipped constants.
      </p>

      <h2 style={{ marginTop: 24 }}>Raw samples ({samples.length})</h2>
      <details>
        <summary>Show table</summary>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginTop: 8 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
              <th style={{ padding: "2px 8px" }}>#</th>
              <th style={{ padding: "2px 8px" }}>label</th>
              <th style={{ padding: "2px 8px" }}>yaw</th>
              <th style={{ padding: "2px 8px" }}>pitch</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, i) => (
              <tr key={s.t + "-" + i}>
                <td style={{ padding: "2px 8px" }}>{i + 1}</td>
                <td style={{ padding: "2px 8px" }}>{s.label}</td>
                <td style={{ padding: "2px 8px" }}>{s.yaw.toFixed(3)}</td>
                <td style={{ padding: "2px 8px" }}>{s.pitch.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
