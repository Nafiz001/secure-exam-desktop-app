// NOTE:
// Always-on-top is enabled ONLY during exam mode.
// Application-level window dominance cannot override
// kernel-level or admin overlays.

console.log("[MAIN] ====== main.js loading ======");

const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const psList = require("ps-list");
const fs = require("fs");
const path = require("path");

console.log("[MAIN] Electron modules loaded");
console.log("[MAIN] psList type:", typeof psList);
console.log("[MAIN] psList.default type:", typeof psList.default);

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
  
  mainWindow.loadFile("index.html");

  // Detect focus loss (browser / overlay usage) - ONLY during exam
  mainWindow.on("blur", () => {
    if (!examRunning) return;
    registerViolation("WINDOW_BLUR", "medium");
    refocusIfExam();
  });

  // Detect fullscreen exit - ONLY during exam
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
  console.log("[EXAM MODE] ========================================");
  console.log("[EXAM MODE] ENABLING EXAM MODE");
  console.log("[EXAM MODE] ========================================");
  
  examRunning = true;

  // First, make sure window is visible and focused
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  
  console.log("[EXAM MODE] Window shown and focused");

  // IMPORTANT: Set fullscreen BEFORE locking controls
  // This is a Windows Electron quirk - resizable:false prevents true fullscreen
  console.log("[EXAM MODE] Current fullscreen state:", mainWindow.isFullScreen());
  console.log("[EXAM MODE] Setting fullscreen TRUE...");
  mainWindow.setFullScreen(true);
  console.log("[EXAM MODE] setFullScreen(true) called");
  
  // Set always on top
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  console.log("[EXAM MODE] Set always on top");
  
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  console.log("[EXAM MODE] Set visible on all workspaces");

  // NOW lock window controls AFTER fullscreen is set
  mainWindow.setResizable(false);
  mainWindow.setMinimizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setClosable(false);
  console.log("[EXAM MODE] Window controls locked AFTER fullscreen");

  // Force focus again
  mainWindow.focus();
  
  // Check after a delay
  setTimeout(() => {
    const isFullScreenAfterDelay = mainWindow.isFullScreen();
    console.log("[EXAM MODE] ========================================");
    console.log("[EXAM MODE] FULLSCREEN STATUS AFTER 500ms:", isFullScreenAfterDelay);
    console.log("[EXAM MODE] ========================================");
    
    if (!isFullScreenAfterDelay) {
      console.log("[EXAM MODE] WARNING: Fullscreen was not set! Trying again...");
      mainWindow.setFullScreen(true);
      mainWindow.focus();
    }
  }, 500);
  
  console.log("[EXAM MODE] Exam mode setup complete");
}

function disableExamMode() {
  examRunning = false;

  // Restore window controls after exam
  mainWindow.setResizable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setClosable(true);
  
  mainWindow.setFullScreen(false);
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

  try {
    // Handle both CommonJS and ES module exports
    const psListFn = psList.default || psList;
    const processes = await psListFn();
    
    for (const proc of processes) {
      const name = proc.name.toLowerCase();
      if (FORBIDDEN_PROCESSES.some(p => name.includes(p))) {
        registerViolation(`FORBIDDEN_PROCESS:${proc.name}`, "high");
        return;
      }
    }
  } catch (error) {
    console.error("[PROCESS DETECTION] Error:", error.message);
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
