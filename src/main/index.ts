import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { electronApp, is } from "@electron-toolkit/utils";
import { registerIpcHandlers } from "./ipc";
import { logEvent, setEventLogRoot } from "./eventLogger";
import { cancelAllLiveTranscriptSessions } from "./transcription/liveTranscriptSessionManager";

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app-paw.png")
    : path.resolve(__dirname, "../../src/renderer/src/assets/icons/app-paw.png");
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    frame: false,
    icon: getAppIconPath(),
    backgroundColor: "#fff6e8",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const appSession = window.webContents.session;
  appSession.setPermissionCheckHandler((webContents, permission) => {
    return webContents?.id === window.webContents.id && permission === "media";
  });
  appSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes =
        permission === "media" && "mediaTypes" in details
          ? (details.mediaTypes ?? [])
          : [];
      const microphoneOnly =
        mediaTypes.includes("audio") && !mediaTypes.includes("video");
      const allowed =
        webContents.id === window.webContents.id &&
        permission === "media" &&
        microphoneOnly;
      logEvent(allowed ? "info" : "warn", "electron", "Media permission requested.", {
        permission,
        mediaTypes: mediaTypes.join(","),
        allowed
      });
      callback(allowed);
    }
  );

  const sendMaximizedState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send("window:maximized-changed", window.isMaximized());
    }
  };

  window.on("maximize", sendMaximizedState);
  window.on("unmaximize", sendMaximizedState);
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("render-process-gone", (_event, details) => {
    logEvent("error", "electron", "Renderer process exited unexpectedly.", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.localwhisper.studio");
  setEventLogRoot(app.getPath("userData"));
  logEvent("info", "electron", "Application started.", {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  });
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void cancelAllLiveTranscriptSessions();
});
