import { contextBridge, ipcRenderer } from "electron";
import type { LocalStudioApi } from "../shared/apiTypes";

const api: LocalStudioApi = {
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    close: () => ipcRenderer.invoke("window:close"),
    onMaximizedChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
        listener(maximized);
      };
      ipcRenderer.on("window:maximized-changed", handler);
      return () => ipcRenderer.removeListener("window:maximized-changed", handler);
    }
  },
  runtime: {
    getStatus: () => ipcRenderer.invoke("runtime:get-status"),
    ensureRequired: () => ipcRenderer.invoke("runtime:ensure-required"),
    installItem: (itemId) => ipcRenderer.invoke("runtime:install-item", itemId),
    repair: () => ipcRenderer.invoke("runtime:repair")
  },
  audio: {
    pickFile: () => ipcRenderer.invoke("audio:pick-file"),
    convertToWav16k: (input) => ipcRenderer.invoke("audio:convert-to-wav16k", input)
  },
  transcribe: {
    start: (input) => ipcRenderer.invoke("transcribe:start", input),
    getStatus: (jobId) => ipcRenderer.invoke("transcribe:get-status", jobId),
    pause: (jobId) => ipcRenderer.invoke("transcribe:pause", jobId),
    resume: (jobId) => ipcRenderer.invoke("transcribe:resume", jobId),
    stop: (jobId) => ipcRenderer.invoke("transcribe:stop", jobId)
  },
  diagnostics: {
    getEvents: () => ipcRenderer.invoke("diagnostics:get-events")
  }
};

contextBridge.exposeInMainWorld("localStudio", api);
