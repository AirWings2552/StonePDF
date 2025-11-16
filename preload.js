import { contextBridge, ipcRenderer,shell } from "electron";
// console.log("[preload] loaded");
contextBridge.exposeInMainWorld("electronAPI", {
  openPdf: () => ipcRenderer.invoke("dialog:openPdf"),
  readPdf: (filePath) => ipcRenderer.invoke("fs:readPdf", filePath),
  writePdf: (filePath, data) => ipcRenderer.invoke("fs:writePdf", { filePath, data }),
  saveAsPdf: (suggestedName, data) =>
    ipcRenderer.invoke("dialog:saveAsPdf", { suggestedName, data }),
  onOpenPath: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on("open-path", h);
    return () => ipcRenderer.removeListener("open-path", h);
  },
  notifyReady: () => ipcRenderer.send("renderer-ready"),
  printPdfFile: (filePath, lang) => ipcRenderer.invoke("print-pdf-file", filePath,lang),
  showAlert: (options) => ipcRenderer.send('show-alert', options),
  openImg: () => ipcRenderer.invoke("dialog:openImg"),
  getPathAfterDownload: (url) => ipcRenderer.invoke("trigger-download", url),
  // setPrintLang: (lang) => ipcRenderer.send("setPrintLang", lang),
  openExternal: (url) => shell.openExternal(url),
  askUser: () => ipcRenderer.invoke("ask-user"),
  sendValueToMain: (value) => ipcRenderer.invoke('variable-channel', value),
  onAppCloseCheck: (callback) => ipcRenderer.on('app-close-check', callback),
  confirmClose: () => ipcRenderer.send('app-close-confirmed'),
});

contextBridge.exposeInMainWorld("marks", {
  // ---------- highlight ----------
  insertHighlight: (doc_id, page, payload) =>
    ipcRenderer.invoke("marks:highlight:insert", { doc_id, page, payload }),

  listHighlightByDoc: (doc_id) =>
    ipcRenderer.invoke("marks:highlight:listByDoc", doc_id),

  listHighlightByDocPage: (doc_id, page) =>
    ipcRenderer.invoke("marks:highlight:listByDocPage", { doc_id, page }),

  updateHighlightPayload: (id, payload) =>
    ipcRenderer.invoke("marks:highlight:updatePayload", { id, payload }),

  deleteHighlightById: (id) =>
    ipcRenderer.invoke("marks:highlight:deleteById", id),

  deleteHighlightByDocPage: (doc_id, page) =>
    ipcRenderer.invoke("marks:highlight:deleteByDocPage", { doc_id, page }),

  // ---------- freetext ----------
  insertFreeText: (doc_id, page, payload) =>
    ipcRenderer.invoke("marks:freetext:insert", { doc_id, page, payload }),

  listFreeTextByDoc: (doc_id) =>
    ipcRenderer.invoke("marks:freetext:listByDoc", doc_id),

  listFreeTextByDocPage: (doc_id, page) =>
    ipcRenderer.invoke("marks:freetext:listByDocPage", { doc_id, page }),

  // 可整体替换 payload，或同时修改 type（传不传 type 都行）
  updateFreeText: (id, payload, type) =>
    ipcRenderer.invoke("marks:freetext:update", type
      ? { id, payload, type }
      : { id, payload }),

  deleteFreeTextById: (id) =>
    ipcRenderer.invoke("marks:freetext:deleteById", id),

  deleteFreeTextByDocPage: (doc_id, page) =>
    ipcRenderer.invoke("marks:freetext:deleteByDocPage", { doc_id, page }),

  deleteHighlightByDoc: (doc_id) =>
    ipcRenderer.invoke("marks:highlight:deleteByDoc", doc_id),

  deleteFreeTextByDoc: (doc_id) =>
    ipcRenderer.invoke("marks:freetext:deleteByDoc", doc_id),
});