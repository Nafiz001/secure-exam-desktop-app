const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");

let mainWindow;
let violationCount = 0;
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
    registerViolation("FULLSCREEN_EXIT");
  });

  mainWindow.on("blur", () => {
    registerViolation("WINDOW_BLUR");
  });
}

function registerViolation(type) {
  violationCount++;
  mainWindow.webContents.send("violation", {
    type,
    count: violationCount
  });

  if (violationCount >= MAX_VIOLATIONS) {
    mainWindow.webContents.send("force-submit");
  }
}

app.whenReady().then(() => {
  createWindow();

  // Block Alt+F4
  globalShortcut.register("Alt+F4", () => {
    registerViolation("ALT_F4_BLOCKED");
  });

  // Block F11
  globalShortcut.register("F11", () => {
    registerViolation("F11_BLOCKED");
  });
});

// Enforce fullscreen when exam starts
ipcMain.on("start-exam", () => {
  if (mainWindow) {
    mainWindow.setFullScreen(true);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
