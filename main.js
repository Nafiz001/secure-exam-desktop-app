const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen
} = require("electron");

let mainWindow;
let violationCount = 0;
let examTerminated = false;
const MAX_VIOLATIONS = 3;

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

function registerViolation(type, severity = "low") {
  if (examTerminated) return;

  violationCount++;

  mainWindow.webContents.send("violation", {
    type,
    severity,
    count: violationCount
  });

  if (violationCount >= MAX_VIOLATIONS) {
    examTerminated = true;
    mainWindow.webContents.send("force-submit");
  }
}

function detectDisplays() {
  const displays = screen.getAllDisplays();

  if (displays.length > 1) {
    registerViolation("MULTIPLE_MONITORS", "high");
  }
}

app.whenReady().then(() => {
  createWindow();

  // Initial display check
  detectDisplays();

  // Detect display changes
  screen.on("display-added", detectDisplays);
  screen.on("display-removed", detectDisplays);
  screen.on("display-metrics-changed", () => {
    registerViolation("DISPLAY_CHANGED", "medium");
  });

  // Block shortcuts
  globalShortcut.register("Alt+F4", () => {
    registerViolation("ALT_F4_BLOCKED", "high");
  });

  globalShortcut.register("F11", () => {
    registerViolation("F11_BLOCKED", "medium");
  });

  globalShortcut.register("Super", () => {
    // block Windows key silently
  });
});

ipcMain.on("start-exam", () => {
  if (mainWindow) {
    examTerminated = false;
    violationCount = 0;
    mainWindow.setFullScreen(true);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
