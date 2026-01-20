const { contextBridge, ipcRenderer } = require("electron");

console.log("[PRELOAD] Preload script loaded");

contextBridge.exposeInMainWorld("electronAPI", {
  onViolation: (callback) => ipcRenderer.on("violation", callback),
  onForceSubmit: (callback) => ipcRenderer.on("force-submit", callback),
  startExam: (examData) => {
    console.log("[PRELOAD] startExam called with:", examData);
    ipcRenderer.send("start-exam", examData);
  },
  submitExam: (submissionData) => ipcRenderer.invoke("submit-exam", submissionData),
  // Pass user data to main process for session logging
  setUserData: (userData) => ipcRenderer.send("set-user-data", userData)
});

console.log("[PRELOAD] electronAPI exposed to window");
