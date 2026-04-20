// NOTE:
// Always-on-top is enabled ONLY during exam mode.
// Application-level window dominance cannot override
// kernel-level or admin overlays.

console.log("[MAIN] ====== main.js loading ======");

const { app, BrowserWindow, ipcMain, globalShortcut, session, screen } = require("electron");
const psList = require("ps-list");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

console.log("[MAIN] Electron modules loaded");
console.log("[MAIN] psList type:", typeof psList);
console.log("[MAIN] psList.default type:", typeof psList.default);

let mainWindow = null;
let violationCount = 0;
let examRunning = false;
let processScanInterval = null;
let focusEnforceInterval = null;
let blurStartAt = null;
let applyingLockState = false;
let lastHardFullscreenAt = 0;
let examDisplayId = null;
let currentUser = null; // Store logged-in user data
let backendProcess = null;
const REACT_RENDERER_PATH = path.join(__dirname, "renderer", "dist", "index.html");

const sessionLog = [];
const REFOCUS_INTERVAL_MS = 500;
const LONG_FOCUS_LOSS_MS = 3000;
const HARD_FULLSCREEN_COOLDOWN_MS = 1500;
const violationLastLoggedAt = new Map();

// Browsers handled via blur (focus loss)
const FORBIDDEN_PROCESSES = [
  "obs",
  "bandicam",
  "anydesk",
  "teamviewer"
];

/* =========================
   LOGGING
========================= */
function logEvent(type, severity = "info", meta = {}) {
  const entry = {
    type,
    severity,
    timestamp: new Date().toISOString()
  };
  if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }
  sessionLog.push(entry);
}

function getViolationDedupeKey(type, meta = {}) {
  if (type === "FORBIDDEN_PROCESS") {
    return `${type}:${String(meta.processName || "unknown").toLowerCase()}`;
  }
  if (type === "SHORTCUT_BLOCKED") {
    return `${type}:${String(meta.shortcut || "unknown")}`;
  }
  return type;
}

function getViolationCooldownMs(type) {
  if (type === "FORBIDDEN_PROCESS") return 5000;
  if (type === "WINDOW_MOVE_ATTEMPT" || type === "WINDOW_RESIZE_ATTEMPT") return 1500;
  if (type === "WINDOW_BLUR") return 1000;
  return 800;
}

function logViolation(type, meta = {}, severity = "medium") {
  if (!examRunning) return;

  const now = Date.now();
  const dedupeKey = getViolationDedupeKey(type, meta);
  const lastAt = violationLastLoggedAt.get(dedupeKey) || 0;
  const cooldownMs = getViolationCooldownMs(type);
  if (now - lastAt < cooldownMs) {
    return;
  }
  violationLastLoggedAt.set(dedupeKey, now);

  violationCount += 1;
  logEvent(type, severity, meta);

  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("violation", {
      type,
      severity,
      count: violationCount,
      timestamp: new Date(now).toISOString(),
      ...meta
    });
  }
}

function getShortcutFromInput(input) {
  if (!input) return null;
  const key = String(input.key || "").toUpperCase();
  const ctrlOrCmd = input.control || input.meta;
  const alt = input.alt;
  const shift = input.shift;

  if (key === "F12") return "F12";
  if (key === "F11") return "F11";
  if (key === "F4" && alt) return "Alt+F4";
  if (ctrlOrCmd && shift && key === "I") return "Ctrl/Cmd+Shift+I";
  if (ctrlOrCmd && shift && key === "J") return "Ctrl/Cmd+Shift+J";
  if (ctrlOrCmd && shift && key === "C") return "Ctrl/Cmd+Shift+C";
  if (ctrlOrCmd && key === "ESCAPE") return "Ctrl/Cmd+Esc";
  return null;
}

function withLockStateGuard(callback) {
  applyingLockState = true;
  try {
    callback();
  } finally {
    applyingLockState = false;
  }
}

function getCurrentDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return screen.getPrimaryDisplay();

  if (examRunning && examDisplayId !== null) {
    const lockedDisplay = screen.getAllDisplays().find((display) => display.id === examDisplayId);
    if (lockedDisplay) return lockedDisplay;
  }

  const bounds = mainWindow.getBounds();
  return screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
}

function pickExamDisplayForStart() {
  if (!mainWindow || mainWindow.isDestroyed()) return screen.getPrimaryDisplay();

  const cursorPoint = screen.getCursorScreenPoint();
  const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const windowBounds = mainWindow.getBounds();
  const windowDisplay = screen.getDisplayMatching(windowBounds);

  // Prefer the display where the cursor is when the teacher/student starts exam mode.
  if (cursorDisplay) return cursorDisplay;
  if (windowDisplay) return windowDisplay;
  return screen.getPrimaryDisplay();
}

function boundsWithinTolerance(currentBounds, targetBounds, tolerance = 2) {
  return Math.abs((currentBounds?.x || 0) - (targetBounds?.x || 0)) <= tolerance
    && Math.abs((currentBounds?.y || 0) - (targetBounds?.y || 0)) <= tolerance
    && Math.abs((currentBounds?.width || 0) - (targetBounds?.width || 0)) <= tolerance
    && Math.abs((currentBounds?.height || 0) - (targetBounds?.height || 0)) <= tolerance;
}

function needsHardFullscreenReset(targetBounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!mainWindow.isKiosk() || !mainWindow.isFullScreen()) return true;
  const currentBounds = mainWindow.getBounds();
  return !boundsWithinTolerance(currentBounds, targetBounds);
}

function applyHardExamFullscreen(targetBounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  withLockStateGuard(() => {
    // Hard reset avoids Windows cases where fullscreen is "true" but taskbar still visible.
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setVisibleOnAllWorkspaces(false);

    mainWindow.setBounds(targetBounds, false);

    mainWindow.setKiosk(true);
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setSkipTaskbar(true);
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);

    mainWindow.moveTop();
    mainWindow.show();
    mainWindow.focus();
  });
}

function enforceExamWindowLock({ forceBounds = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  withLockStateGuard(() => {
    const display = getCurrentDisplay();
    const targetBounds = display.bounds;
    const now = Date.now();

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    if (needsHardFullscreenReset(targetBounds) && now - lastHardFullscreenAt >= HARD_FULLSCREEN_COOLDOWN_MS) {
      lastHardFullscreenAt = now;
      applyHardExamFullscreen(targetBounds);
      return;
    }

    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setSkipTaskbar(true);
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);

    if (forceBounds) {
      mainWindow.setBounds(targetBounds, false);
    }

    if (!mainWindow.isFullScreen()) {
      mainWindow.setBounds(targetBounds, false);
      mainWindow.setFullScreen(true);
    }

    mainWindow.moveTop();
    mainWindow.show();
    mainWindow.focus();
  });
}

function startFocusEnforcer() {
  if (focusEnforceInterval) {
    clearInterval(focusEnforceInterval);
    focusEnforceInterval = null;
  }

  focusEnforceInterval = setInterval(() => {
    if (!examRunning || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    enforceExamWindowLock();
  }, REFOCUS_INTERVAL_MS);
}

function stopFocusEnforcer() {
  if (focusEnforceInterval) {
    clearInterval(focusEnforceInterval);
    focusEnforceInterval = null;
  }
}

function getBackendPort() {
  return Number(process.env.BACKEND_PORT || process.env.PORT || 5000);
}

function getBackendServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "server.js");
  }
  return path.join(__dirname, "backend", "server.js");
}

function getBackendWorkingDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }
  return path.join(__dirname, "backend");
}

function isBackendResponsive(port = getBackendPort()) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: 1200
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackendReady(port = getBackendPort(), timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await isBackendResponsive(port);
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startBackendServer() {
  const port = getBackendPort();
  const alreadyRunning = await isBackendResponsive(port);
  if (alreadyRunning) {
    console.log(`[BACKEND] Existing backend detected on port ${port}. Reusing it.`);
    return;
  }

  const serverPath = getBackendServerPath();
  const backendCwd = getBackendWorkingDir();

  if (!fs.existsSync(serverPath)) {
    console.error("[BACKEND] server.js not found at:", serverPath);
    return;
  }

  console.log("[BACKEND] Starting backend from:", serverPath);
  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: backendCwd,
    env: {
      ...process.env,
      PORT: String(port),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  backendProcess.stdout.on("data", (data) => {
    process.stdout.write(`[BACKEND] ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    process.stderr.write(`[BACKEND_ERR] ${data}`);
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`[BACKEND] exited with code=${code} signal=${signal}`);
    backendProcess = null;
  });

  const ready = await waitForBackendReady(port, 15000);
  if (!ready) {
    console.warn("[BACKEND] Did not become ready within timeout. UI will still open.");
  } else {
    console.log(`[BACKEND] Ready on port ${port}`);
  }
}

function stopBackendServer() {
  if (!backendProcess || backendProcess.killed) {
    return;
  }

  console.log("[BACKEND] Stopping backend process...");
  backendProcess.kill();
}

/* =========================
   WINDOW CREATION
========================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: false,
    autoHideMenuBar: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  console.log("[MAIN] Window created, preload:", path.join(__dirname, "preload.js"));

  if (fs.existsSync(REACT_RENDERER_PATH)) {
    console.log("[MAIN] Loading React renderer:", REACT_RENDERER_PATH);
    mainWindow.loadFile(REACT_RENDERER_PATH);
  } else {
    console.error("[MAIN] React renderer was not found at:", REACT_RENDERER_PATH);
    mainWindow.loadURL("data:text/html,<h2>Renderer build is missing. Run npm run build:renderer and restart the app.</h2>");
  }

  // Detect focus loss (browser / overlay usage) - ONLY during exam
  mainWindow.on("blur", () => {
    if (!examRunning) return;
    if (!blurStartAt) {
      blurStartAt = Date.now();
    }
    logViolation("WINDOW_BLUR", {}, "medium");
    refocusIfExam();
  });

  // Detect focus restore and measure focus-loss duration
  mainWindow.on("focus", () => {
    if (!examRunning) {
      blurStartAt = null;
      return;
    }

    if (blurStartAt) {
      const durationMs = Date.now() - blurStartAt;
      if (durationMs > LONG_FOCUS_LOSS_MS) {
        logViolation("LONG_FOCUS_LOSS", { durationMs }, "high");
      }
      blurStartAt = null;
    }
  });

  // Detect fullscreen exit - ONLY during exam
  mainWindow.on("leave-full-screen", () => {
    if (!examRunning) return;
    logViolation("FULLSCREEN_EXIT", {}, "high");
    enforceExamWindowLock({ forceBounds: true });
    refocusIfExam();
  });

  mainWindow.on("minimize", (event) => {
    if (!examRunning) return;
    event.preventDefault();
    logViolation("WINDOW_MINIMIZE_ATTEMPT", {}, "high");
    enforceExamWindowLock({ forceBounds: true });
  });

  mainWindow.on("move", () => {
    if (!examRunning || applyingLockState) return;
    logViolation("WINDOW_MOVE_ATTEMPT", {}, "medium");
    enforceExamWindowLock({ forceBounds: true });
  });

  mainWindow.on("resize", () => {
    if (!examRunning || applyingLockState) return;
    logViolation("WINDOW_RESIZE_ATTEMPT", {}, "medium");
    enforceExamWindowLock({ forceBounds: true });
  });

  // Block common devtools shortcuts during exam mode
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!examRunning) return;

    const shortcut = getShortcutFromInput(input);
    if (!shortcut) return;

    event.preventDefault();
    logViolation("SHORTCUT_BLOCKED", { shortcut }, shortcut === "Alt+F4" ? "high" : "medium");
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    }
    refocusIfExam();
  });

  // Force-close devtools if opened while exam is running
  mainWindow.webContents.on("devtools-opened", () => {
    if (!examRunning) return;
    mainWindow.webContents.closeDevTools();
    logViolation("SHORTCUT_BLOCKED", { shortcut: "DevTools" }, "high");
    refocusIfExam();
  });
}

/* =========================
   EXAM MODE CONTROL
========================= */
function enableExamMode() {
  console.log("[EXAM MODE] ========================================");
  console.log("[EXAM MODE] ENABLING EXAM MODE");
  console.log("[EXAM MODE] ========================================");

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  examRunning = true;
  blurStartAt = null;
  violationLastLoggedAt.clear();
  lastHardFullscreenAt = 0;
  const examDisplay = pickExamDisplayForStart();
  examDisplayId = examDisplay.id;

  // First, force lock primitives (kiosk/fullscreen/top) before UI locks
  console.log("[EXAM MODE] Current fullscreen state:", mainWindow.isFullScreen());
  const startupBounds = examDisplay.bounds;
  console.log("[EXAM MODE] Target display:", examDisplay.id, startupBounds);
  applyHardExamFullscreen(startupBounds);
  console.log("[EXAM MODE] Kiosk/fullscreen/always-on-top enforced");

  // NOW lock window controls AFTER fullscreen is set
  mainWindow.setResizable(false);
  mainWindow.setMinimizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setClosable(false);
  console.log("[EXAM MODE] Window controls locked AFTER fullscreen");

  // Force focus again
  enforceExamWindowLock();
  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  }

  startFocusEnforcer();

  if (processScanInterval) {
    clearInterval(processScanInterval);
  }
  processScanInterval = setInterval(detectForbiddenProcesses, 1000);

  // Check after a delay
  setTimeout(() => {
    if (!examRunning || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const isFullScreenAfterDelay = mainWindow.isFullScreen();
    console.log("[EXAM MODE] ========================================");
    console.log("[EXAM MODE] FULLSCREEN STATUS AFTER 500ms:", isFullScreenAfterDelay);
    console.log("[EXAM MODE] ========================================");

    if (!isFullScreenAfterDelay) {
      console.log("[EXAM MODE] WARNING: Fullscreen was not set! Trying again...");
      enforceExamWindowLock({ forceBounds: true });
    }
  }, 500);
  
  console.log("[EXAM MODE] Exam mode setup complete");
}

function disableExamMode() {
  examRunning = false;
  blurStartAt = null;
  examDisplayId = null;
  stopFocusEnforcer();

  if (processScanInterval) {
    clearInterval(processScanInterval);
    processScanInterval = null;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // Restore window controls and window mode after exam
  withLockStateGuard(() => {
    mainWindow.setResizable(true);
    mainWindow.setMinimizable(true);
    mainWindow.setMaximizable(true);
    mainWindow.setClosable(true);
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setAutoHideMenuBar(false);
    mainWindow.setMenuBarVisibility(true);
  });
}

function refocusIfExam() {
  if (!mainWindow || !examRunning || mainWindow.isDestroyed()) return;
  enforceExamWindowLock();
}

/* =========================
   VIOLATIONS
========================= */
// NO AUTO-SUBMIT HERE (INTENTIONAL)

/* =========================
   PROCESS DETECTION
========================= */
async function detectForbiddenProcesses() {
  if (!examRunning) return;

  try {
    // Handle both CommonJS and ES module exports
    const psListFn = psList.default || psList;
    const processes = await psListFn();
    
    for (const proc of processes) {
      const name = proc.name.toLowerCase();
      if (FORBIDDEN_PROCESSES.some(p => name.includes(p))) {
        logViolation("FORBIDDEN_PROCESS", { processName: proc.name }, "high");
        return;
      }
    }
  } catch (error) {
    console.error("[PROCESS DETECTION] Error:", error.message);
  }
}

function registerExamShortcut(accelerator, shortcutLabel, severity = "medium") {
  try {
    const registered = globalShortcut.register(accelerator, () => {
      if (!examRunning) return;
      logViolation("SHORTCUT_BLOCKED", { shortcut: shortcutLabel }, severity);
      if (mainWindow && mainWindow.webContents && mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      }
      refocusIfExam();
    });

    if (!registered) {
      console.warn(`[SHORTCUT] Could not register accelerator: ${accelerator}`);
    }
  } catch (error) {
    console.warn(`[SHORTCUT] Failed to register accelerator '${accelerator}':`, error.message);
  }
}

/* =========================
   IPC HANDLERS
========================= */
ipcMain.on("start-exam", (event, examData) => {
  console.log("[IPC] ====== START-EXAM HANDLER TRIGGERED ======");
  console.log("[IPC] Received start-exam message", examData);
  violationCount = 0;
  sessionLog.length = 0;

  logEvent("EXAM_STARTED", "system");
  if (currentUser) {
    logEvent(`USER_LOGGED_IN: ${currentUser.name} (${currentUser.email}, ${currentUser.role})`, "system");
  }
  
  // Log exam details
  if (examData) {
    logEvent(`EXAM_ID: ${examData.id}, TITLE: ${examData.title}`, "system");
  }

  enableExamMode();
});

ipcMain.on("set-user-data", (event, userData) => {
  currentUser = userData;
  console.log("User logged in:", userData);
});

// Handle exam submission with violation data
ipcMain.handle("submit-exam", async (event, submissionData) => {
  logEvent("EXAM_SUBMITTED", "system");

  disableExamMode();

  const reportPath = path.join(
    app.getPath("documents"),
    "invigilo-session-log.json"
  );

  // Add violation data to submission
  const fullReport = {
    ...submissionData,
    sessionLog,
    violationCount,
    user: currentUser
  };

  fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2));

  // Return violations to be sent with API submission
  return {
    violations: sessionLog,
    violationCount
  };
});

/* =========================
   APP LIFECYCLE
========================= */
app.whenReady().then(() => {
  // Allow camera access for webcam proctoring
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
    } else {
      callback(false);
    }
  });

  startBackendServer().finally(() => {
    createWindow();
  });

  registerExamShortcut("Alt+F4", "Alt+F4", "high");
  registerExamShortcut("F11", "F11", "medium");
  registerExamShortcut("F12", "F12", "medium");
  registerExamShortcut("CommandOrControl+Shift+I", "Ctrl/Cmd+Shift+I", "medium");
  registerExamShortcut("CommandOrControl+Shift+J", "Ctrl/Cmd+Shift+J", "medium");
  registerExamShortcut("CommandOrControl+Esc", "Ctrl/Cmd+Esc", "high");
  registerExamShortcut("Super", "Windows/Super", "high");
  registerExamShortcut("Alt+Tab", "Alt+Tab", "high");

  // Windows key - Use CommandOrControl instead of Super for cross-platform
  // Note: Windows key blocking is limited on some systems
});

app.on("will-quit", () => {
  disableExamMode();
  stopBackendServer();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  disableExamMode();
  stopBackendServer();
  app.quit();
});
