// NOTE:
// Always-on-top enforces application-level dominance.
// Kernel-level / admin overlays cannot be overridden.

const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const psList = require("ps-list");
const fs = require("fs");
const path = require("path");

let mainWindow;
let violationCount = 0;
let examTerminated = false;
let processScanInterval = null;

const MAX_VIOLATIONS = 3;
const sessionLog = [];

const FORBIDDEN_PROCESSES = [
  "obs",
  "bandicam",
  "anydesk",
  "teamviewer"
];

function logEvent(type, severity = "info") {
  sessionLog.push({
    type,
    severity,
    timestamp: new Date().toISOString()
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,               // 🔴 Z-ORDER
    autoHideMenuBar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: __dirname + "/preload.js",
      contextIsolation: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile("index.html");

  mainWindow.on("blur", () => {
    registerViolation("WINDOW_BLUR", "high");
    refocusWindow();
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
    registerViolation("FULLSCREEN_EXIT", "high");
  });
}

function refocusWindow() {
  if (!mainWindow || examTerminated) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true, "screen-saver");
}

function registerViolation(type, severity) {
  if (examTerminated) return;

  violationCount++;
  logEvent(type, severity);

  mainWindow.webContents.send("violation", {
    type,
    severity,
    count: violationCount
  });

  if (severity === "high" || violationCount >= MAX_VIOLATIONS) {
    terminateExam();
  }
}

function terminateExam() {
  if (examTerminated) return;
  examTerminated = true;

  logEvent("EXAM_TERMINATED", "system");

  if (processScanInterval) {
    clearInterval(processScanInterval);
    processScanInterval = null;
  }

  const reportPath = path.join(
    app.getPath("documents"),
    "invigilo-session-log.json"
  );

  fs.writeFileSync(reportPath, JSON.stringify(sessionLog, null, 2));

  mainWindow.webContents.send("force-submit");
}

async function detectForbiddenProcesses() {
  if (examTerminated) return;

  const processes = await psList();
  for (const p of processes) {
    const name = p.name.toLowerCase();
    if (FORBIDDEN_PROCESSES.some(fp => name.includes(fp))) {
      registerViolation(`FORBIDDEN_PROCESS:${p.name}`, "high");
      return;
    }
  }
}

ipcMain.on("start-exam", async () => {
  examTerminated = false;
  violationCount = 0;
  sessionLog.length = 0;

  logEvent("EXAM_STARTED", "system");

  mainWindow.setFullScreen(true);
  refocusWindow();

  await detectForbiddenProcesses();

  if (processScanInterval) clearInterval(processScanInterval);
  processScanInterval = setInterval(detectForbiddenProcesses, 1000);
});

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("Alt+F4", () =>
    registerViolation("ALT_F4_BLOCKED", "high")
  );

  globalShortcut.register("F11", () =>
    registerViolation("F11_BLOCKED", "medium")
  );

  globalShortcut.register("Super", () => {});
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
