const { app, BrowserWindow } = require("electron");

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
      contextIsolation: true
    }
  });

  mainWindow.loadFile("index.html");

  // Re-enforce fullscreen if exited
  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

// Quit app properly
app.on("window-all-closed", () => {
  app.quit();
});
