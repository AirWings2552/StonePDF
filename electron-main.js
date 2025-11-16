import { app, BrowserWindow, ipcMain, dialog, session,Menu} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import http from "http";
import serveHandler from "serve-handler";


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);


const isDev = process.env.ELECTRON_START_URL;
const appPath = app.getAppPath();
const assetsPath = isDev
  ? path.join(__dirname, "src", "assets", "localization") // 开发环境路径
  : path.join(process.resourcesPath, "localization"); // 生产环境路径
let lang_zh, lang_en, lang_du;
try {
  lang_zh = JSON.parse(fs.readFileSync(path.join(assetsPath, "chinese.json"), "utf8"));
  lang_en = JSON.parse(fs.readFileSync(path.join(assetsPath, "english.json"), "utf8"));
  lang_du = JSON.parse(fs.readFileSync(path.join(assetsPath, "dutch.json"), "utf8"));
} catch (e) {
  console.error("无法加载本地化文件:", e);
  dialog.showErrorBox("加载失败", `无法找到必要的资源文件，请检查。\n${e.message}`);
  lang_zh = {};
  lang_en = {};
  lang_du = {};
}

let server = null;
let serveUrl = null;
let serveBooting = null;

let isDirty = false;

let quitting = false;
let langMap = null;

async function serveDist() {
  const ROOT = path.join(__dirname, "dist");
  const PORT = 25552;

  if (serveUrl && server?.listening) return serveUrl;
  if (serveBooting) return serveBooting;

  serveBooting = new Promise((resolve, reject) => {
    server = http.createServer((req, res) =>
      serveHandler(req, res, {
        public: ROOT,
        cleanUrls: false,
        rewrites: [{ source: "**", destination: "/index.html" }],
      })
    );

    server.once("error", (e) => {
      serveBooting = null;
      reject(e);
    });

    server.listen(PORT, "127.0.0.1", () => {
      serveUrl = `http://127.0.0.1:${PORT}`;
      console.log(`[serveDist] dist server running at ${serveUrl}`);
      resolve(serveUrl);
    });
  });

  return serveBooting;
}

let win = null;
const pendingPaths = [];

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Key: The second instance exits immediately to avoid entering whenReady → serveDist
  app.exit(0);
} else {
  // The second instance passes the file path to the first instance
  app.on("second-instance", (_event, argv) => {
    const files = extractPdfPathsFromArgv(argv);
    if (files.length) sendOpenPaths(files);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  // macOS Finder double click
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pendingPaths.push(filePath);
  });

  app.whenReady().then(async () => {
    await createWindow();
    const initial = [
      ...extractPdfPathsFromArgv(process.argv),
      ...pendingPaths.splice(0),
    ];
    if (initial.length) sendOpenPaths(initial);

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  let isServerClosing = false;

  app.on("before-quit", async (e) => {
    if (!server?.listening || isServerClosing) {
      return;
    }
    e.preventDefault();
    isServerClosing = true;

    await new Promise((resolve) => server.close(() => resolve()));
    console.log("Server closed");
    app.quit();
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dev uses external services, prod uses local dist server
  const url = process.env.ELECTRON_START_URL
    ? process.env.ELECTRON_START_URL
    : await serveDist();

  await win.loadURL(url);

  if (process.env.ELECTRON_START_URL) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
  }

  win.webContents.on("did-finish-load", () => console.log("[main] did-finish-load"));
  win.webContents.on("did-fail-load",
    (_e, code, desc, failedUrl) => console.error("[main] did-fail-load", code, desc, failedUrl)
  );
  
  win.on('close', (e) => {
    if (quitting) {
      return; 
    }
    
    e.preventDefault();
    
    win.webContents.send('app-close-check');
  });
}


function extractPdfPathsFromArgv(argv) {
  return argv
    .slice(1)
    .map((s) => s.replace(/^"+|"+$/g, ""))
    .filter((s) => /\.pdf$/i.test(s) && fs.existsSync(s));
}

ipcMain.handle("dialog:openPdf", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("dialog:openImg", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
  });
  if (canceled || !filePaths.length) return null;

  const files = filePaths.map((p) => ({
    name: p.split(/[\\/]/).pop(),
    path: p,
    type: `${path.extname(p).slice(1).toLowerCase()}`,
    data: new Uint8Array(fs.readFileSync(p)),
  }));

  return files;
});

ipcMain.handle("fs:readPdf", (_e, filePath) =>
  new Uint8Array(fs.readFileSync(filePath))
);

ipcMain.handle("fs:writePdf", (_e, { filePath, data }) => {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer ? data : new Uint8Array(data));
  fs.writeFileSync(filePath, buf);
  return true;
});

ipcMain.handle("trigger-download", async (e, url) => {
const win = BrowserWindow.fromWebContents(e.sender);
  const ses = win.webContents.session;

  return new Promise((resolve, reject) => {
    const onDownload = (event, item) => {
      item.once("done", (_ev, state) => {
        ses.removeListener("will-download", onDownload);
        if (state === "completed") {
          const p = item.getSavePath ? item.getSavePath() : null;
          resolve(p);
        } else {
          reject(null);
        }
      });
    };
    ses.once("will-download", onDownload);
  });
});

ipcMain.on('show-alert', (event, options) => {
  dialog.showMessageBox({
    type: options.type || 'info', // 'info', 'warning', 'error', 'question'
    title: options.title || '提示',
    message: options.message,
  });
});



// === highlight: Create ===
ipcMain.handle("marks:highlight:insert", (_e, { doc_id, page, payload }) => {
  const info = db
    .prepare(`INSERT INTO marks_highlight (doc_id, page, type, payload)
              VALUES (?, ?, 'highlight', json(?))`)
    .run(doc_id, page, JSON.stringify(payload));
  return info.lastInsertRowid;
});

// === highlight: Read ===
ipcMain.handle("marks:highlight:listByDoc", (_e, doc_id) => {
  return db.prepare(`SELECT id, doc_id, page, payload FROM marks_highlight
                     WHERE doc_id = ? ORDER BY page, id`).all(doc_id);
});
ipcMain.handle("marks:highlight:listByDocPage", (_e, { doc_id, page }) => {
  return db.prepare(`SELECT id, doc_id, page, payload FROM marks_highlight
                     WHERE doc_id = ? AND page = ? ORDER BY id`).all(doc_id, page);
});

// === highlight: Update（整体替换 payload）===
ipcMain.handle("marks:highlight:updatePayload", (_e, { id, payload }) => {
  const info = db.prepare(`UPDATE marks_highlight
                           SET payload = json(?), updated_at = datetime('now')
                           WHERE id = ?`).run(JSON.stringify(payload), id);
  return info.changes > 0;
});

// === highlight: Delete ===
ipcMain.handle("marks:highlight:deleteById", (_e, id) => {
  const info = db.prepare(`DELETE FROM marks_highlight WHERE id = ?`).run(id);
  return info.changes > 0;
});
ipcMain.handle("marks:highlight:deleteByDocPage", (_e, { doc_id, page }) => {
  const info = db.prepare(`DELETE FROM marks_highlight WHERE doc_id=? AND page=?`).run(doc_id, page);
  return info.changes; // 返回删除条数
});

// === freetext: Create ===
ipcMain.handle("marks:freetext:insert", (_e, { doc_id, page, payload }) => {
  // payload 形如：{ box:{x,y,w,h}, text, fontSize?, textColor?, bgColor?, border? }
  const info = db
    .prepare(`INSERT INTO marks_freeText (doc_id, page, type, payload)
              VALUES (?, ?, 'freetext', json(?))`)
    .run(doc_id, page, JSON.stringify(payload));
  return info.lastInsertRowid;
});

// === freetext: Read ===
ipcMain.handle("marks:freetext:listByDoc", (_e, doc_id) => {
  return db.prepare(`SELECT id, doc_id, page, type, payload FROM marks_freeText
                     WHERE doc_id = ? ORDER BY page, id`).all(doc_id);
});
ipcMain.handle("marks:freetext:listByDocPage", (_e, { doc_id, page }) => {
  return db.prepare(`SELECT id, doc_id, page, type, payload FROM marks_freeText
                     WHERE doc_id = ? AND page = ? ORDER BY id`).all(doc_id, page);
});

// === freetext: Update（整体替换 payload 或同时改 type）===
ipcMain.handle("marks:freetext:update", (_e, { id, payload, type }) => {
  const sql = type
    ? `UPDATE marks_freeText SET type=?, payload=json(?), updated_at=datetime('now') WHERE id=?`
    : `UPDATE marks_freeText SET payload=json(?), updated_at=datetime('now') WHERE id=?`;
  const info = type
    ? db.prepare(sql).run(type, JSON.stringify(payload), id)
    : db.prepare(sql).run(JSON.stringify(payload), id);
  return info.changes > 0;
});

// === freetext: Delete ===
ipcMain.handle("marks:freetext:deleteById", (_e, id) => {
  const info = db.prepare(`DELETE FROM marks_freeText WHERE id = ?`).run(id);
  return info.changes > 0;
});
ipcMain.handle("marks:freetext:deleteByDocPage", (_e, { doc_id, page }) => {
  const info = db.prepare(`DELETE FROM marks_freeText WHERE doc_id=? AND page=?`).run(doc_id, page);
  return info.changes;
});

ipcMain.handle("marks:highlight:deleteByDoc", (_e, doc_id) => {
  const info = db.prepare(`DELETE FROM marks_highlight WHERE doc_id=?`).run(doc_id);
  return info.changes; // 返回删除条数
});

// freetext：按 doc 清空
ipcMain.handle("marks:freetext:deleteByDoc", (_e, doc_id) => {
  const info = db.prepare(`DELETE FROM marks_freeText WHERE doc_id=?`).run(doc_id);
  return info.changes;
});



let rendererReady = false;
const queued = [];

ipcMain.on("renderer-ready", () => {
  rendererReady = true;
  flushQueue();
});

function sendOpenPaths(paths) {
  queued.push(...paths);
  flushQueue();
}

function flushQueue() {
  if (!win || !rendererReady) return;
  while (queued.length) {
    win.webContents.send("open-path", queued.shift());
  }
}


ipcMain.handle("ask-user", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    title: langMap["confirmOperation"],
    message: langMap["fileNotSaved"],
    buttons: [langMap["confirm"], langMap["abandon"], langMap["cancel"]],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return response; // 0/1/2
});

ipcMain.handle('variable-channel', async (event, value) => {
  console.log('收到渲染进程的变量:', value);
  if(value === "zh"){
    langMap = lang_zh;
  }else if(value === "en"){
    langMap = lang_en;
  }else if(value === "du"){
    langMap = lang_du;
  }else{
    isDirty = true;
  }
});


ipcMain.on('app-close-confirmed', () => {
  quitting = true;
  if (win) {
    win.close();
  } else {
    app.quit();
  }
});