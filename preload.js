const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onViolation: (callback) => ipcRenderer.on("violation", callback)
});
