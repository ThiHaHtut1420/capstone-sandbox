const path = require("path");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, screen, ipcMain } = require("electron");

const { startMetricsLoop } = require("./metrics");

const isProd = process.env.NODE_ENV === "production";
const rendererURL = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";

let dashboardWindow = null;
let overlayWindow = null;
let overlayEnabled = false;
let metricsStopFn = null;

function getRendererBaseURL(windowType) {
  if (isProd) {
    const indexPath = path.join(__dirname, "../../dist/renderer/index.html");
    const fileUrl = pathToFileURL(indexPath).href;
    return `${fileUrl}?window=${encodeURIComponent(windowType)}`;
  }
  return `${rendererURL}/?window=${encodeURIComponent(windowType)}`;
}

function createCommonWebPreferences() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, "preload.js"),
  };
}

function createDashboardWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 620,
    show: true,
    resizable: false,
    backgroundColor: "#0b0f17",
    webPreferences: createCommonWebPreferences(),
  });

  win.loadURL(getRendererBaseURL("dashboard"));

  win.on("closed", () => {
    dashboardWindow = null;
  });

  return win;
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: createCommonWebPreferences(),
  });

  // Make the overlay click-through (best-effort, depends on OS/window manager).
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setFocusable(false);

  win.loadURL(getRendererBaseURL("overlay"));

  win.on("closed", () => {
    overlayWindow = null;
  });

  return win;
}

function applyOverlayEnabled(enabled) {
  overlayEnabled = !!enabled;
  if (!overlayWindow) return;
  if (overlayEnabled) {
    overlayWindow.show();
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    overlayWindow.hide();
  }
}

ipcMain.handle("overlay:setEnabled", async (_event, enabled) => {
  applyOverlayEnabled(enabled);
  return overlayEnabled;
});

ipcMain.handle("overlay:getEnabled", async () => overlayEnabled);

function startIfNeeded() {
  if (metricsStopFn) return;

  metricsStopFn = startMetricsLoop((metrics) => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send("metrics:update", metrics);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("metrics:update", metrics);
    }
  });
}

app.whenReady().then(() => {
  dashboardWindow = createDashboardWindow();
  overlayWindow = createOverlayWindow();

  // Default: keep overlay hidden until user enables it in dashboard.
  overlayWindow.hide();
  overlayEnabled = false;

  startIfNeeded();
});

app.on("window-all-closed", () => {
  // On macOS, keep the app alive until user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (typeof metricsStopFn === "function") metricsStopFn();
});

