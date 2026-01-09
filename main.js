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
const MAX_VIOLATIONS = 3;

const FORBIDDEN_PROCESSES = [
  { name: "chrome", severity: "medium" },
  { name: "msedge", severity: "medium" },
  { name: "firefox", severity: "medium" },
  { name: "obs", severity: "high" },
  { name: "anydesk", severity: "high" },
  { name: "teamviewer", severity: "high" },
  { name: "bandicam", severity: "high" }
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

  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
    registerViolation("FULLSCREEN_EXIT", "high");
  });

  mainWindow.on("blur", () => {
    registerViolation("WINDOW_BLUR", "medium");
  });
}

function registerViolation(type, severity) {
  if (examTerminated) return;

  violationCount++;

  mainWindow.webContents.send("violation", {
    type,
    severity,
    count: violationCount
  });

  if (severity === "high" || violationCount >= MAX_VIOLATIONS) {
    examTerminated = true;
    mainWindow.webContents.send("force-submit");
  }
}

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

ipcMain.on("start-exam", () => {
  examTerminated = false;
  violationCount = 0;
  mainWindow.setFullScreen(true);

  setInterval(detectForbiddenProcesses, 3000);
});

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("Alt+F4", () => {
    registerViolation("ALT_F4_BLOCKED", "high");
  });

  globalShortcut.register("F11", () => {
    registerViolation("F11_BLOCKED", "medium");
  });

  globalShortcut.register("Super", () => {});
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
