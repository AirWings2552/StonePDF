/* ──────────────────────────────────────────────────────────────
usePdfMarks.ts · Encapsulates PDF.js highlighting, underlining, strikethrough, and sticky notes.
Dependencies: React, UUID (or built-in crypto.randomUUID)
Compatible with: PDF.js official Viewer (.page element) + EventBus
────────────────────────────────────────────────────────────── */

import { useCallback, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { v4 as uuid } from "uuid";
import type { AppOutletCtx } from "../App";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.d.mts";

/* ---------- Type ---------- */

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type Mark =
  | {
      id: string;
      page: number;
      type: "highlight" | "underline" | "strike";
      rects: Rect[];
      color?: string;
      note?: string;
    }
  | {
      id: string;
      page: number;
      type: "note";
      anchor: Point;
      text: string;
    }
  | {
      id: string;
      page: number;
      type: "freetext";
      box: Rect;
      text: string;
      fontSize?: number;
      textColor?: string;
      bgColor?: string;
      border?: boolean;
    };

/* ---------- Persist ---------- */
function key(fp: string) { return `marks::${fp}`; }

function loadMarks(fp: string): Mark[] {
  try { return JSON.parse(localStorage.getItem(key(fp)) || "[]"); }
  catch { return []; }
}
function saveMarks(fp: string, ms: Mark[]) {
  localStorage.setItem(key(fp), JSON.stringify(ms));

}

/* ---------- Util functions ---------- */

function ensureMarkLayer(pageEl: HTMLElement) {
  let layer = pageEl.querySelector<HTMLDivElement>(".markLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "markLayer";
    pageEl.appendChild(layer);
  }
  return layer;
}

function getPageNumber(el: HTMLElement) {
  return Number(el.getAttribute("data-page-number"));
}

function measureFreeTextBox(node: HTMLElement, layer: HTMLElement) {
  const left = parseFloat(node.style.left) || 0;
  const top = parseFloat(node.style.top) || 0;
  const width = Math.max(24, node.offsetWidth, node.scrollWidth);
  const height = Math.max(20, node.offsetHeight, node.scrollHeight);
  return {
    x: left / layer.clientWidth,
    y: top / layer.clientHeight,
    w: width / layer.clientWidth,
    h: height / layer.clientHeight,
  };
}

function growFreeTextHeight(node: HTMLElement) {
  node.style.height = `${Math.max(20, node.offsetHeight, node.scrollHeight)}px`;
}




export default function usePdfMarks(opts: { eventBus: EventBus; fingerprint: string; mode:"select" | "pen" | "eraser" ;viewer:PDFViewer}) {
    const { eventBus, fingerprint ,mode} = opts;
    const {langMap,setDocumentDirty} = useOutletContext<AppOutletCtx>();

    const markDirty = useCallback(() => {
      setDocumentDirty(fingerprint, true);
    }, [fingerprint, setDocumentDirty]);

    const renderMarksOnPage = useCallback((pageEl: HTMLElement, marks: Mark[]) => {
      const pageNo = getPageNumber(pageEl);
      const layer = ensureMarkLayer(pageEl);
      layer.innerHTML = "";
      const layerBox = layer.getBoundingClientRect();
      const W = layerBox.width || layer.clientWidth;
      const H = layerBox.height || layer.clientHeight;

      for (const m of marks) {
        if (m.page !== pageNo) continue;

        if (m.type === "note") {
          const pin = document.createElement("div");
          pin.className = "mark note-pin";
          pin.style.left = `${m.anchor.x * W - 5}px`;
          pin.style.top = `${m.anchor.y * H - 5}px`;
          pin.title = m.text.slice(0, 60) || "note";
          layer.appendChild(pin);

          pin.addEventListener("mouseenter", () => {
            const bubble = document.createElement("div");
            bubble.className = "note-bubble";
            bubble.style.left = `${m.anchor.x * W + 12}px`;
            bubble.style.top = `${m.anchor.y * H - 10}px`;
            bubble.textContent = m.text;
            layer.appendChild(bubble);
            pin.addEventListener("mouseleave", () => bubble.remove(), { once: true });
          });
          continue;
        }
        if (m.type === "highlight" || m.type === "strike" || m.type === "underline"){
          for (const r of m.rects) {
            const n = document.createElement("div");
            n.id = m.id;
            n.className = `mark ${m.type}`;
            n.tabIndex = 0;
          
            const left = r.x * W;
            const top  = r.y * H;
            const w    = r.w * W;
            const h    = r.h * H;

            if (m.type === "highlight") {
              n.style.left   = `${left}px`;
              n.style.top    = `${top}px`;
              n.style.width  = `${w}px`;
              n.style.height = `${h}px`;
            } else if (m.type === "strike") {
              n.style.left   = `${left}px`;
              n.style.top    = `${top + h * 0.5 - 1}px`;
              n.style.width  = `${w}px`;
              n.style.height = `2px`;
            } else { // underline
              n.style.left   = `${left}px`;
              n.style.top    = `${top + h - 2}px`;
              n.style.width  = `${w}px`;
              n.style.height = `2px`;
            }
            layer.appendChild(n);
          }
        }
        

        if (m.type === "freetext") {
          const n = document.createElement("div");
          n.className = "mark freetext";
          n.id = m.id;
          const { x, y, w, h } = m.box;

          // Size and position (pixels), w/h is relative coordinates -> pixels
          n.style.left   = `${x * W}px`;
          n.style.top    = `${y * H}px`;
          n.style.width  = w ? `${Math.max(24, w * W)}px` : "auto";
          n.style.height = h ? `${Math.max(20, h * H)}px` : "auto";

          // Editable
          n.contentEditable = "plaintext-only";
          n.dataset.placeholder = langMap["holdAltToDrag"] || "按住 Alt 拖动";
          n.innerText = m.text || "";

          n.contentEditable = "false";
          n.innerHTML = "";

          const bar = document.createElement("div");
          bar.className = "freetext-bar";

          const grip = document.createElement("span");
          grip.className = "freetext-grip";
          grip.setAttribute("aria-hidden", "true");
          bar.appendChild(grip);

          const del = document.createElement("button");
          del.type = "button";
          del.className = "freetext-delete";
          del.textContent = "X";
          del.setAttribute("aria-label", "Delete text box");
          bar.appendChild(del);

          const body = document.createElement("div");
          body.className = "freetext-body";
          body.contentEditable = "plaintext-only";
          body.dataset.placeholder = langMap["freeText"] || "Text";
          body.innerText = m.text || "";

          n.appendChild(bar);
          n.appendChild(body);

          let dragging = false;
          let startX = 0, startY = 0;     
          let startLeft = 0, startTop = 0;

          // Dragging is only allowed when Alt is held down; otherwise, the edit
          n.addEventListener("pointerdown", (ev) => {
            if (!ev.altKey) return;

            // If text is being edited and the selection is not empty, allow editing
            if ((ev.target as HTMLElement).isContentEditable && window.getSelection()?.toString()) return;

            dragging = true;
            n.classList.add("dragging");

            // Record the benchmark at the moment of pressing
            startX = ev.clientX;
            startY = ev.clientY;
            startLeft = parseFloat(n.style.left) || 0;
            startTop  = parseFloat(n.style.top)  || 0;

            n.setPointerCapture?.(ev.pointerId);
            ev.preventDefault();
            ev.stopPropagation();
          });

          bar.addEventListener("pointerdown", (ev) => {
            if (ev.button !== 0 || ev.target === del) return;
            dragging = true;
            n.classList.add("dragging");

            startX = ev.clientX;
            startY = ev.clientY;
            startLeft = parseFloat(n.style.left) || 0;
            startTop = parseFloat(n.style.top) || 0;

            n.setPointerCapture?.(ev.pointerId);
            ev.preventDefault();
            ev.stopPropagation();
          });

          const onPointerMove = (ev: PointerEvent) => {
            if (!dragging) return;
            let left = startLeft + (ev.clientX - startX);
            let top  = startTop  + (ev.clientY - startY);
            const maxLeft = layer.clientWidth  - n.offsetWidth;
            const maxTop  = layer.clientHeight - n.offsetHeight;
            if (maxLeft >= 0) left = Math.max(0, Math.min(left, maxLeft));
            if (maxTop  >= 0) top  = Math.max(0, Math.min(top,  maxTop));

            n.style.left = `${left}px`;
            n.style.top  = `${top}px`;
          };

          const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            n.classList.remove("dragging");

            const all = loadMarks(fingerprint).map(mm =>
              mm.id === m.id && mm.type === "freetext"
                ? { ...mm, box: measureFreeTextBox(n, layer) }
                : mm
            );
            saveMarks(fingerprint, all);
            markDirty();
          };

          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);

          del.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          del.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const all = loadMarks(fingerprint).filter(mm => mm.id !== m.id);
            saveMarks(fingerprint, all);
            markDirty();
            n.remove();
          });

          // Text editing: Lose focus or press Enter to save
      // Text editing: Lose focus or press Enter to save
          const persistText = () => {
            growFreeTextHeight(n);
            const all = loadMarks(fingerprint).map(mm => mm.id === m.id && mm.type==="freetext"
             ? { 
                  ...mm, 
                  text: body.innerText,
                  box: measureFreeTextBox(n, layer)
                }
             : mm);
            saveMarks(fingerprint, all);
            markDirty();
          };
          n.addEventListener("input", () => {
            growFreeTextHeight(n);
          });
          n.addEventListener("blur", persistText);
          n.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) n.blur();
          });
          body.addEventListener("input", () => {
            growFreeTextHeight(n);
          });
          body.addEventListener("blur", persistText);
          body.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) body.blur();
          });

          layer.appendChild(n);
          continue;
        }
      }
    }, [fingerprint, langMap, markDirty]);

    const rerenderAll = useCallback((marks: Mark[]) => {
      document
        .querySelectorAll<HTMLElement>(".pdfViewer .page")
        .forEach((p) => renderMarksOnPage(p, marks));
    }, [renderMarksOnPage]);

    const erase = useCallback((id:string,docId:string) => {
      const raw = loadMarks(docId);
      if (!raw) return;

      const filtered = raw.filter(m => m.id !== id);
      saveMarks(docId, filtered);
      setDocumentDirty(docId, true);
      rerenderAll(filtered);
    }, [rerenderAll, setDocumentDirty]);

    useEffect(() => {
      if (mode !== "eraser") return;
      const handleClick = (e: MouseEvent) => {
        if(e.buttons !== 1) return;
        const el = e.target as HTMLElement;
        if (el.classList.contains("mark")) {
          erase(el.id,fingerprint);
        }
      };

      document.addEventListener("mousemove", handleClick);

      return () => {
        document.removeEventListener("mousemove", handleClick);
      };
    }, [erase, fingerprint, mode]);

  /* Register pdf.js events: zoom / page turn / redraw after page rendering is completed */
  useEffect(() => {
    const rerender = () => rerenderAll(loadMarks(fingerprint));

    eventBus.on("pagesinit", rerender);
    eventBus.on("pagerendered", rerender);
    eventBus.on("scalechanged", rerender);
    eventBus.on("pagechanging", rerender);

    // Initialization
    rerender();

    return () => {
      eventBus.off("pagesinit", rerender);
      eventBus.off("pagerendered", rerender);
      eventBus.off("scalechanged", rerender);
      eventBus.off("pagechanging", rerender);
    };
  }, [eventBus,fingerprint, rerenderAll]);

  /* -------- API：Four methods of external exposure -------- */

  // Convert the selection to Rect[]
  const rectsFromSelection = useCallback((pageEl: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return [];
    const range = sel.getRangeAt(0);
    const rectList = Array.from(range.getClientRects());
    const layer = ensureMarkLayer(pageEl);
    const box = layer.getBoundingClientRect();

    return rectList
      .map((r) => {
        const left = Math.max(r.left, box.left);
        const top = Math.max(r.top, box.top);
        const right = Math.min(r.right, box.right);
        const bottom = Math.min(r.bottom, box.bottom);
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      })
      .filter((r) => r.width > 0 && r.height > 0 && box.width > 0 && box.height > 0)
      .map((r) => ({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: r.width / box.width,
        h: r.height / box.height,
      }));
  }, []);
  

  const addLineMark = useCallback(
    (
      pageEl: HTMLElement,
      type: "highlight" | "underline" | "strike",
      _color?: string,
      note?: string,
    ) => {
      const rects = rectsFromSelection(pageEl);
      if (!rects.length) return;
      const m: Mark = {
        id: uuid(),
        page: getPageNumber(pageEl),
        type,
        rects,
        color:"rgb(255, 191, 0)",
        note,
      };
      const all = loadMarks(fingerprint);
      all.push(m);
      saveMarks(fingerprint,all);
      markDirty();
      renderMarksOnPage(pageEl, all);
    },
    [fingerprint, markDirty, rectsFromSelection, renderMarksOnPage],
  );

  const addNote = useCallback((pageEl: HTMLElement, point: Point, text: string) => {
    const m: Mark = {
      id: uuid(),
      page: getPageNumber(pageEl),
      type: "note",
      anchor: point,
      text,
    };
    const all = loadMarks(fingerprint);
    all.push(m);
    saveMarks(fingerprint,all);
    markDirty();
    renderMarksOnPage(pageEl, all);
  }, [fingerprint, markDirty, renderMarksOnPage]);

  const removeMark = useCallback((id: string) => {
    const all = loadMarks(fingerprint).filter((m) => m.id !== id);
    saveMarks(fingerprint,all);
    markDirty();
    rerenderAll(all);
  }, [fingerprint, markDirty, rerenderAll]);

  const clearAllMarks = useCallback(() => {
    saveMarks(fingerprint,[]);
    markDirty();
    rerenderAll([]);
  }, [fingerprint, markDirty, rerenderAll]);

  const addFreeText = useCallback((pageEl: HTMLElement, box: Rect, text = "", opts?: {
    fontSize?: number; textColor?: string; bgColor?: string; border?: boolean
  }) => {
    const m: Mark = {
      id: uuid(),
      page: getPageNumber(pageEl),
      type: "freetext",
      box,
      text,
      bgColor:"rgba(84, 160, 255, 0.35)",
      ...opts,
    };
    const all = loadMarks(fingerprint);
    all.push(m);
    saveMarks(fingerprint, all);
    markDirty();
    renderMarksOnPage(pageEl, all);
  }, [fingerprint, markDirty, renderMarksOnPage]);
    
  return { addLineMark, addNote, removeMark ,clearAllMarks,addFreeText};
}


