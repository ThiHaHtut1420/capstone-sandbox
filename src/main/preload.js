const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onMetrics: (callback) => {
    const listener = (_event, metrics) => callback(metrics);
    ipcRenderer.on("metrics:update", listener);
    return () => ipcRenderer.removeListener("metrics:update", listener);
  },

  setOverlayEnabled: (enabled) => ipcRenderer.invoke("overlay:setEnabled", enabled),
  getOverlayEnabled: () => ipcRenderer.invoke("overlay:getEnabled"),
});

