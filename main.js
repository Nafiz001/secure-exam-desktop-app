const { app, BrowserWindow, ipcMain } = require("electron");

let mainWindow;

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
    mainWindow.webContents.send("violation", {
      type: "FULLSCREEN_EXIT"
    });
  });

  // Detect focus loss (Alt+Tab, app switch)
  mainWindow.on("blur", () => {
    mainWindow.webContents.send("violation", {
      type: "WINDOW_BLUR"
    });
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
