// NOTE:
// Always-on-top is enabled ONLY during exam mode.
// Application-level window dominance cannot override
// kernel-level or admin overlays.

const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const psList = require("ps-list");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let violationCount = 0;
let examRunning = false;
let processScanInterval = null;
let currentUser = null; // Store logged-in user data

const sessionLog = [];
const MAX_VIOLATIONS = 3;

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
function logEvent(type, severity = "info") {
  sessionLog.push({
    type,
    severity,
    timestamp: new Date().toISOString()
  });
}

/* =========================
   WINDOW CREATION
========================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: false,
    autoHideMenuBar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: true,
    webPreferences: {
      preload: __dirname + "/preload.js",
      contextIsolation: true
    }
  });

  mainWindow.loadFile("index.html");

  // Detect focus loss (browser / overlay usage)
  mainWindow.on("blur", () => {
    if (!examRunning) return;
    registerViolation("WINDOW_BLUR", "medium");
    refocusIfExam();
  });

  // Detect fullscreen exit
  mainWindow.on("leave-full-screen", () => {
    if (!examRunning) return;
    mainWindow.setFullScreen(true);
    registerViolation("FULLSCREEN_EXIT", "high");
  });
}

/* =========================
   EXAM MODE CONTROL
========================= */
function enableExamMode() {
  examRunning = true;

  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });

  refocusIfExam();
}

function disableExamMode() {
  examRunning = false;

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);

  if (processScanInterval) {
    clearInterval(processScanInterval);
    processScanInterval = null;
  }
}

function refocusIfExam() {
  if (!mainWindow || !examRunning) return;

  mainWindow.show();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true, "screen-saver");
}

/* =========================
   VIOLATIONS
========================= */
function registerViolation(type, severity) {
  if (!examRunning) return;

  violationCount++;
  logEvent(type, severity);

  mainWindow.webContents.send("violation", {
    type,
    severity,
    count: violationCount
  });

  // ❌ NO AUTO-SUBMIT HERE (INTENTIONAL)
}

/* =========================
   PROCESS DETECTION
========================= */
async function detectForbiddenProcesses() {
  if (!examRunning) return;

  const processes = await psList();
  for (const proc of processes) {
    const name = proc.name.toLowerCase();
    if (FORBIDDEN_PROCESSES.some(p => name.includes(p))) {
      registerViolation(`FORBIDDEN_PROCESS:${proc.name}`, "high");
      return;
    }
  }
}

/* =========================
   IPC HANDLERS
========================= */
ipcMain.on("start-exam", (event, examData) => {
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

  if (processScanInterval) clearInterval(processScanInterval);
  processScanInterval = setInterval(detectForbiddenProcesses, 1000);
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
  createWindow();

  globalShortcut.register("Alt+F4", () => {
    if (!examRunning) return;
    registerViolation("ALT_F4_BLOCKED", "high");
  });

  globalShortcut.register("F11", () => {
    if (!examRunning) return;
    registerViolation("F11_BLOCKED", "medium");
  });

  // Windows key - Use CommandOrControl instead of Super for cross-platform
  // Note: Windows key blocking is limited on some systems
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
