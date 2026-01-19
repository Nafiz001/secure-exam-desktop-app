const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onViolation: (callback) => ipcRenderer.on("violation", callback),
  onForceSubmit: (callback) => ipcRenderer.on("force-submit", callback),
  startExam: () => ipcRenderer.send("start-exam"),
  // Pass user data to main process for session logging
  setUserData: (userData) => ipcRenderer.send("set-user-data", userData)
});
