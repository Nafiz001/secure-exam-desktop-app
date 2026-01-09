const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen
} = require("electron");

const psList = require("ps-list");

let mainWindow;
let violationCount = 0;
let examTerminated = false;
let processScanInterval = null;

const MAX_VIOLATIONS = 3;

// High-risk & medium-risk processes
const FORBIDDEN_PROCESSES = [
  { name: "chrome", severity: "high" },
  { name: "msedge", severity: "high" },
  { name: "firefox", severity: "high" },
  { name: "obs", severity: "high" },
  { name: "bandicam", severity: "high" },
  { name: "anydesk", severity: "high" },
  { name: "teamviewer", severity: "high" }
];

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    webPreferences: {
      preload: __dirname + "/preload.js",
      contextIsolation: true
    }
  });

  mainWindow.loadFile("index.html");

  // Detect fullscreen exit
  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
    registerViolation("FULLSCREEN_EXIT", "high");
  });

  // Detect app switching
  mainWindow.on("blur", () => {
    registerViolation("WINDOW_BLUR", "medium");
  });
}

// Central violation handler
function registerViolation(type, severity) {
  if (examTerminated) return;

  violationCount++;

  mainWindow.webContents.send("violation", {
    type,
    severity,
    count: violationCount
  });

  if (severity === "high" || violationCount >= MAX_VIOLATIONS) {
    terminateExam();
  }
}

// Force exam termination safely
function terminateExam() {
  if (examTerminated) return;

  examTerminated = true;
  mainWindow.webContents.send("force-submit");

  if (processScanInterval) {
    clearInterval(processScanInterval);
    processScanInterval = null;
  }
}

// Immediate + continuous forbidden process detection
async function detectForbiddenProcesses() {
  if (examTerminated) return;

  const processes = await psList();

  for (const proc of processes) {
    for (const forbidden of FORBIDDEN_PROCESSES) {
      if (proc.name.toLowerCase().includes(forbidden.name)) {
        registerViolation(
          `FORBIDDEN_PROCESS:${proc.name}`,
          forbidden.severity
        );
        return;
      }
    }
  }
}

// Start exam (called from UI)
ipcMain.on("start-exam", async () => {
  examTerminated = false;
  violationCount = 0;

  if (mainWindow) {
    mainWindow.setFullScreen(true);
  }

  // Immediate scan (CRITICAL FIX)
  await detectForbiddenProcesses();

  // Clear previous scanner if exists
  if (processScanInterval) {
    clearInterval(processScanInterval);
  }

  // High-frequency scanning
  processScanInterval = setInterval(detectForbiddenProcesses, 1000);
});

app.whenReady().then(() => {
  createWindow();

  // Block system shortcuts
  globalShortcut.register("Alt+F4", () => {
    registerViolation("ALT_F4_BLOCKED", "high");
  });

  globalShortcut.register("F11", () => {
    registerViolation("F11_BLOCKED", "medium");
  });

  // Block Windows key silently
  globalShortcut.register("Super", () => {});
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
