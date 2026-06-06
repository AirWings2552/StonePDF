/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker?worker";
(pdfjsLib as any).GlobalWorkerOptions.workerPort = new PdfWorker();


import {
  EventBus,
  PDFLinkService,
  PDFFindController,
  PDFViewer,
  LinkTarget
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import JumpBar from "./JumpBar";
import SearchBar from "./SearchBar";
import PopupWindow from "./PopupWindow";
import BookMark from "./BookMark";
import "./../style/viewer.css";
import { useOutletContext, useParams } from "react-router-dom";
import type { AppOutletCtx } from "../App";
import { sha256Hex, useDocStore } from "../store/useDocStore";
import { Eraser ,MousePointer, Save, Printer ,FileOutput} from "lucide-react"
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString} from "pdf-lib";
import fontkit from '@pdf-lib/fontkit';



type PDFDocumentProxy = any;
type PDFPageProxy = any;
type PopupWindowCoordinates = { x: number; y: number; };
type PreviewRenderState = {
  pageIndex: number;
  anchorX: number;
  anchorY: number;
  dpr: number;
  zoom: number;
  focusBiasY: number;
};
type PreviewSize = { width: number; height: number };
type PreviewResizeEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export default function PdfViewer() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pagesCount, setPagesCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const currentPageRef = useRef(1);
  const [scalePct, setScalePct] = useState<number>(100);

  // Required: Absolute positioning + overflow:auto container
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // pdf.js object
  const eventBusRef = useRef<EventBus | null>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);
  const findControllerRef = useRef<PDFFindController | null>(null);
  const viewerRef = useRef<PDFViewer | null>(null);

  // Preview Card
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const previewPinnedRef = useRef(false);
  const previewRenderStateRef = useRef<PreviewRenderState | null>(null);
  const previewSizeRef = useRef<PreviewSize>({ width: 900, height: 300 });
  const previewRenderTimerRef = useRef<number | null>(null);
  const pageAnnoIndexRef = useRef<Map<number, Map<string, any>>>(new Map());
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // Hover state and rAF (for frequency reduction)
  const hoverStateRef = useRef<{ pageNumber: number; id: string } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [popupWindowCoordinates, setPopupWindowCoordinates] = useState<PopupWindowCoordinates | null>(null);
  const [showMenu,setShowMenu] = useState<boolean>(false);

  const [docKey, setDocKey] = useState<string>();// it is the hash of the PDF file content, the same as docId in docStore
  const [bookMarkVisible,setBookMarkVisible] = useState<boolean>(false);
  const enablePreview = useRef<boolean>(true);
  const [enablePreviewState,setEnablePreviewState] = useState<boolean>(true);

  const { id } = useParams();
  const targetFile = useDocStore((s) => (id ? s.docs[id]?.file : undefined));
  const targetPath = useDocStore((s) => (id ? s.docs[id]?.path : undefined));

  
  const { savePdfCtx, langMap,documentStates,registerSaveAction, unregisterSaveAction} = useOutletContext<AppOutletCtx>();
  const [hasRestored,setHasRestored] = useState(false);

  const [cursorMode,setCursorMode] = useState<"select" | "pen" | "eraser">("select");
  const currentHistoryRef = useRef<number[]>([]); 

  const saveButton = useRef<HTMLButtonElement | null>(null);

  const handleSavePdf = useCallback(async () => {
    if (!pdfDocRef.current) return;
    const fontBytes = await fetch('/NotoSansSC-Regular.ttf').then(res => res.arrayBuffer());

    const originalBytes = await pdfDocRef.current.getData();

    const marks = JSON.parse(localStorage.getItem("marks::" + id) || "[]");

    const out = await writeMarksToPdf(originalBytes, marks,fontBytes);
    const data = out instanceof Uint8Array ? out : new Uint8Array(out);

    if (window.electronAPI && targetPath) {
      await window.electronAPI.writePdf(targetPath, data);
      window.electronAPI?.showAlert?.({
        type: "info",
        title: "Success",
        message: langMap["savedToOriginalFile"] || "已覆盖保存到原文件 ✅",
      });

      if(id != undefined)
        documentStates.current[id] = false;

      return;
    }
  }, [documentStates, id, langMap, targetPath]);

  const handleSaveAsAnotherPdf = useCallback(async () => {
    if (!pdfDocRef.current) return;
    const fontBytes = await fetch('/NotoSansSC-Regular.ttf').then(res => res.arrayBuffer());

    const originalBytes = await pdfDocRef.current.getData();

    const marks = JSON.parse(localStorage.getItem("marks::" + id) || "[]");

    const out = await writeMarksToPdf(originalBytes, marks,fontBytes);
    const data = out instanceof Uint8Array ? out : new Uint8Array(out);
    const blob = new Blob([Uint8Array.from(data)], { type: "application/pdf" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    if(id != undefined)
        documentStates.current[id] = false;
    a.href = url;
    a.download = targetFile ? targetFile.name : "document.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }, [documentStates, id, targetFile]);
  
  useEffect(() => {
    currentPageRef.current = currentPage;
  },[currentPage])

  useEffect(() => {
    pdfDocRef.current = pdfDoc;    
  }, [pdfDoc]);

  useEffect(() => {
    if(id && hasRestored)
      savePdfCtx(id,currentPage);
  },[currentPage, hasRestored, id, savePdfCtx])

  useEffect(() => {
    const prev = localStorage.getItem(id+"ctx");
    if(linkServiceRef.current && prev){
      linkServiceRef.current.page = parseInt(prev);
    }
      
  },[hasRestored, id])


  const loadFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    console.log("File loaded");
    
    try { viewerRef.current?.setDocument(null as any); } catch {
      // pdf.js may throw while tearing down an already-detached document.
    }
    try { await pdfDocRef.current?.destroy?.(); } catch {
      // Ignore stale document teardown failures during file switches.
    }

    pageAnnoIndexRef.current.clear();
    previewCacheRef.current.clear();
    previewPinnedRef.current = false;
    previewRenderStateRef.current = null;
    if (previewRenderTimerRef.current != null) {
      window.clearTimeout(previewRenderTimerRef.current);
      previewRenderTimerRef.current = null;
    }
    hoverStateRef.current = null;

    const buf = await f.arrayBuffer();
    const key = await sha256Hex(buf); 
    const task = (pdfjsLib as any).getDocument({ data: buf });
    const doc = await task.promise;
    setDocKey(key);
    setPdfDoc(doc);
    setPagesCount(doc.numPages);
    documentStates.current[key] = false;

  }, [documentStates]);

  useEffect(() => {
    loadFile(targetFile);
  }, [loadFile, targetFile]);

  useEffect(() => {
    if (!docKey) return;

    registerSaveAction(docKey, handleSavePdf);
    return () => {
      unregisterSaveAction(docKey);
    };
  }, [docKey, handleSavePdf, registerSaveAction, unregisterSaveAction]);

  // async function trigger_savePDF(){
  //   await handleSavePdf();
  // }


  // Initialization: PDFViewer + preview card + container delegate + ResizeObserver + necessary CSS
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container) return;
    injectOnce(
      "pdf-anno-layer-fixes",
      `
      .pdfViewer .page .annotationLayer{z-index:5;pointer-events:none;}
      .pdfViewer .page .annotationLayer [data-annotation-id]{pointer-events:auto;}
      .pdfViewer .page .textLayer{z-index:4;}
      .pdf-link-preview {
        min-width: 280px;
        min-height: 160px;
        max-width: none;
        max-height: none;
        overflow: hidden;
      }
      .pdf-link-preview.is-pinned {
        pointer-events: auto !important;
        outline: 2px solid rgba(37,99,235,0.62);
        box-shadow:
          0 0 0 4px rgba(37,99,235,0.12),
          0 18px 44px -18px rgba(15,23,42,0.45);
      }
      .pdf-link-preview__bar {
        display: none;
        width: 100%;
        flex: 0 0 34px;
        height: 34px;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 8px 0 12px;
        box-sizing: border-box;
        background: linear-gradient(180deg, rgba(239,246,255,0.96), rgba(219,234,254,0.92));
        border-bottom: 1px solid rgba(37,99,235,0.34);
        cursor: grab;
        user-select: none;
      }
      .pdf-link-preview__bar:active {
        cursor: grabbing;
      }
      .pdf-link-preview.is-pinned .pdf-link-preview__bar {
        display: flex;
      }
      .pdf-link-preview__grip {
        display: block;
        flex: 1 1 auto;
        height: 18px;
        border-radius: 4px;
        opacity: 0.85;
        background:
          radial-gradient(circle, rgba(37,99,235,0.75) 1.4px, transparent 1.6px) 0 0 / 10px 6px,
          linear-gradient(90deg, rgba(37,99,235,0.08), rgba(37,99,235,0.18), rgba(37,99,235,0.08));
      }
      .pdf-link-preview__close {
        flex: 0 0 26px;
        width: 26px;
        height: 26px;
        border: 1px solid rgba(37,99,235,0.22);
        border-radius: 5px;
        background: rgba(255,255,255,0.76);
        color: #1e3a8a;
        cursor: pointer;
        font-size: 15px;
        line-height: 22px;
        font-weight: 700;
      }
      .pdf-link-preview__close:hover {
        background: rgba(239,68,68,0.12);
        border-color: rgba(239,68,68,0.38);
        color: #b91c1c;
      }
      .pdf-link-preview__content {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 12px;
        width: 100%;
        height: 100%;
      }
      .pdf-link-preview.is-pinned .pdf-link-preview__content {
        height: calc(100% - 30px);
      }
      .pdf-link-preview__resize {
        display: none;
        position: absolute;
        z-index: 4;
        background: rgba(37,99,235,0.5);
        opacity: 0.9;
        transition: background 0.12s ease, opacity 0.12s ease;
      }
      .pdf-link-preview.is-pinned .pdf-link-preview__resize {
        display: block;
      }
      .pdf-link-preview.is-pinned .pdf-link-preview__resize:hover {
        background: rgba(29,78,216,0.9);
        opacity: 1;
      }
      .pdf-link-preview__resize[data-edge="n"],
      .pdf-link-preview__resize[data-edge="s"] {
        left: 18px;
        right: 18px;
        height: 6px;
        cursor: ns-resize;
      }
      .pdf-link-preview__resize[data-edge="n"] { top: 0; border-radius: 0 0 5px 5px; }
      .pdf-link-preview__resize[data-edge="s"] { bottom: 0; border-radius: 5px 5px 0 0; }
      .pdf-link-preview__resize[data-edge="e"],
      .pdf-link-preview__resize[data-edge="w"] {
        top: 18px;
        bottom: 18px;
        width: 6px;
        cursor: ew-resize;
      }
      .pdf-link-preview__resize[data-edge="e"] { right: 0; border-radius: 5px 0 0 5px; }
      .pdf-link-preview__resize[data-edge="w"] { left: 0; border-radius: 0 5px 5px 0; }
      .pdf-link-preview__resize[data-edge="nw"],
      .pdf-link-preview__resize[data-edge="ne"],
      .pdf-link-preview__resize[data-edge="sw"],
      .pdf-link-preview__resize[data-edge="se"] {
        width: 18px;
        height: 18px;
        background: rgba(37,99,235,0.72);
        border: 2px solid rgba(255,255,255,0.9);
        box-sizing: border-box;
      }
      .pdf-link-preview__resize[data-edge="nw"] { top: 0; left: 0; border-radius: 0 0 6px 0; cursor: nwse-resize; }
      .pdf-link-preview__resize[data-edge="se"] { right: 0; bottom: 0; border-radius: 6px 0 0 0; cursor: nwse-resize; }
      .pdf-link-preview__resize[data-edge="ne"] { top: 0; right: 0; border-radius: 0 0 0 6px; cursor: nesw-resize; }
      .pdf-link-preview__resize[data-edge="sw"] { left: 0; bottom: 0; border-radius: 0 6px 0 0; cursor: nesw-resize; }
    ` 
    );

    // —— Singleton Preview Card —— //
    const bubble = document.createElement("div");
    bubble.className = "pdf-link-preview";
    Object.assign(
      bubble.style,
      {
        position: "absolute",
        zIndex: "9999",
        pointerEvents: "none",

        background: "rgba(255,255,255,0.55)",
        color: "#0f2b5b",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.65)",
        boxShadow: "0 12px 28px -12px rgba(30,64,175,0.35)",

        fontSize: "13px",
        lineHeight: "18px",
        padding: "6px 10px",
        display: "none",
      } as Partial<CSSStyleDeclaration>
    );
    bubble.style.setProperty("backdrop-filter", "blur(14px)");
    bubble.style.setProperty("-webkit-backdrop-filter", "blur(14px)");
    container.appendChild(bubble);
    previewRef.current = bubble;

    // —— pdf.js components —— //
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus , externalLinkTarget: LinkTarget.BLANK,});
    const findController = new PDFFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      findController,
      textLayerMode: 2,
      annotationMode: 2,
    });
    linkService.setViewer(viewer);

    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    findControllerRef.current = findController;
    viewerRef.current = viewer;

    viewer.currentScaleValue = "page-width";
    setScalePct(Math.round(viewer.currentScale * 100));

    const onScaleChange = () => {
      if (viewerRef.current) setScalePct(Math.round(viewerRef.current.currentScale * 100));
    };
    eventBus.on("scalechanging", onScaleChange);
    eventBus.on("scalechanged", onScaleChange);
    const onPageChange = (e: any) => {
      setCurrentPage(e.pageNumber);
    };
    const onPagesLoaded = () => setHasRestored(true);
    eventBus.on("pagechanging", onPageChange);
    eventBus.on("pagesloaded", onPagesLoaded);

    // Container resize → let viewer recalculate
    const ro = new ResizeObserver(() => {
      eventBus.dispatch("resize", { source: viewerRef.current });
    });
    ro.observe(container);

    // ——Container-level mousemove real-time hit + mouseleave hide —— //
    const onMouseMove = (ev: MouseEvent) => {
      if (previewPinnedRef.current) return;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(async () => {
        const hit = hitAnnoAt(ev, container);
        const prev = hoverStateRef.current;

        if (!hit) {
          if (prev) {
            const box = previewRef.current!;
            box.style.display = "none";
            hoverStateRef.current = null;
          }
          return;
        }

        // Same note: only follow the position
        if (prev && prev.pageNumber === hit.pageNumber && prev.id === hit.id) {
          followPreviewY(ev, container);
          return;
        }

        // New hit: Take the annotation object and call showPreview
        const idMap = await ensureAnnoIndex(hit.pageNumber);
        const a = idMap.get(hit.id);
        if (!a) {
          previewRef.current!.style.display = "none";
          hoverStateRef.current = null;
          return;
        }
        await showPreview(ev, a);
        hoverStateRef.current = { pageNumber: hit.pageNumber, id: hit.id };
      });
    };

    const onMouseLeave = () => {
      if (previewPinnedRef.current) return;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const box = previewRef.current!;
      box.style.display = "none";
      hoverStateRef.current = null;
    };

    const onClick = async (ev: MouseEvent) => {
      const hit = hitAnnoAt(ev, container);
      if (!hit) return;
      const idMap = await ensureAnnoIndex(hit.pageNumber);
      const a = idMap.get(hit.id);
      if (!a) return;

      if (a.url) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          const u = new URL(a.url.includes("://") ? a.url : `https://${a.url}`);
          window.electronAPI?.openExternal(u.toString());
        } catch {
          // Ignore malformed external links.
        }
        return;
      }
      
      if (a.dest) {
        ev.preventDefault();
        ev.stopPropagation();
        const ls: any = linkServiceRef.current;
                
        currentHistoryRef.current.push(currentPageRef.current);
        console.log(currentHistoryRef.current);

        if (ls?.goToDestination) ls.goToDestination(a.dest);
        else if (ls?.navigateTo) ls.navigateTo(a.dest);
        else if (ls?.goToPage) {
          const pn = await resolveDestToPageNumber(pdfDocRef.current!, a.dest);
          if (pn) {
            ls.goToPage(pn);
          }
        }
        if (!previewPinnedRef.current) {
          const box = previewRef.current!;
          box.style.display = "none";
          hoverStateRef.current = null;
        }
      }
      // Let <a> handle the external links itself
    };

    const onContextMenu = async (ev: MouseEvent) => {
      const hit = hitAnnoAt(ev, container);
      if (!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const idMap = await ensureAnnoIndex(hit.pageNumber);
      const a = idMap.get(hit.id);
      const box = previewRef.current;
      if (!a?.dest || a?.url || !box || box.style.display === "none") return;

      setShowMenu(false);
      pinPreview();
    };

    container.addEventListener("mousemove", onMouseMove, false);
    container.addEventListener("mouseleave", onMouseLeave, false);
    container.addEventListener("click", onClick, false);
    container.addEventListener("contextmenu", onContextMenu, true);
    const pageAnnoIndex = pageAnnoIndexRef.current;
    const previewCache = previewCacheRef.current;

    // 清理
    return () => {
      eventBus.off("scalechanging", onScaleChange);
      eventBus.off("scalechanged", onScaleChange);
      eventBus.off("pagechanging", onPageChange);
      eventBus.off("pagesloaded", onPagesLoaded);
      ro.disconnect();

      container.removeEventListener("mousemove", onMouseMove, false);
      container.removeEventListener("mouseleave", onMouseLeave, false);
      container.removeEventListener("click", onClick, false);
      container.removeEventListener("contextmenu", onContextMenu, true);

      if (previewRef.current && previewRef.current.parentElement === container) {
        container.removeChild(previewRef.current);
      }
      previewRef.current = null;

      try { viewer.cleanup(); } catch {
        // Cleanup is best-effort because pdf.js may already have released resources.
      }
      eventBusRef.current = null;
      linkServiceRef.current = null;
      findControllerRef.current = null;
      viewerRef.current = null;

      pageAnnoIndex.clear();
      previewCache.clear();
      previewPinnedRef.current = false;
      previewRenderStateRef.current = null;
      if (previewRenderTimerRef.current != null) {
        window.clearTimeout(previewRenderTimerRef.current);
        previewRenderTimerRef.current = null;
      }
      hoverStateRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };

   
  // pdf.js viewer owns these DOM listeners for the lifetime of this component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Document loading/switching
  useEffect(() => {
    if (!pdfDoc) return;
    if (!viewerRef.current || !linkServiceRef.current) return;

    viewerRef.current.setDocument(pdfDoc);
    linkServiceRef.current.setDocument(pdfDoc);
    viewerRef.current.currentScaleValue = "page-width";
    setScalePct(Math.round(viewerRef.current.currentScale * 100));

    return () => {
      // try { viewerRef.current?.setDocument(null as any); } catch {}
    };
  }, [pdfDoc]);

  // —— Zoom control —— //
  const zoomOut = () => {
    const v = viewerRef.current;
    if (!v) return;
    const next = Math.max(0.25, +(v.currentScale - 0.1).toFixed(2));
    v.currentScale = next;
    setScalePct(Math.round(next * 100));
  };
  const zoomIn = () => {
    const v = viewerRef.current;
    if (!v) return;
    const next = Math.min(5, +(v.currentScale + 0.1).toFixed(2));
    v.currentScale = next;
    setScalePct(Math.round(next * 100));
  };
  const fitWidth = () => {
    const v = viewerRef.current;
    const eb = eventBusRef.current;
    if (!v || !eb) return;
    eb.dispatch("resize", { source: v });
    v.currentScaleValue = "page-width";
    setScalePct(Math.round(v.currentScale * 100));
  };
  const fitPage = () => {
    const v = viewerRef.current;
    const eb = eventBusRef.current;
    if (!v || !eb) return;
    eb.dispatch("resize", { source: v });
    v.currentScaleValue = "page-fit";
    setScalePct(Math.round(v.currentScale * 100));
  };

  const hideBookMark = () => {
    setBookMarkVisible(!bookMarkVisible);
  };

  const setBubble = () => {
    enablePreview.current = !enablePreview.current;
    setEnablePreviewState(!enablePreviewState);
  };

  const base =
    "rounded cursor-pointer hover:bg-gray-200 transition-colors";
  const active = "bg-gray-300";

  

  const handleRotate = (direction:string) => {
    if(!pdfDocRef.current || !viewerRef.current) return;
    if(direction === "counterClockwise"){
      viewerRef.current.pagesRotation=(viewerRef.current.pagesRotation - 90) % 360;
    }else if(direction === "clockwise"){
      viewerRef.current.pagesRotation=(viewerRef.current.pagesRotation + 90) % 360;
    }
  };

  async function handlePrint() {
    const printContainer = document.createElement('div');
    printContainer.classList.add('print-container');
    document.body.appendChild(printContainer);

    const renderPromises: Promise<void>[] = [];
    const numPages = pdfDoc.numPages;

    // Iterate over all pages and render them onto canvas
    for (let i = 1; i <= numPages; i++) {
        interface PrintViewport { width: number; height: number; /* minimal viewport shape used here */ }
        interface PrintRenderContext {
          canvasContext: CanvasRenderingContext2D;
          viewport: PrintViewport;
        }

        const renderPromise: Promise<void> = (pdfDoc as PDFDocumentProxy).getPage(i).then((page: PDFPageProxy) => {
            const viewport = page.getViewport({ scale: 1.5 }) as PrintViewport; // 使用 1.5 倍的缩放以提高打印质量

            const canvas: HTMLCanvasElement = document.createElement('canvas');
            canvas.classList.add('print-page');
            const context: CanvasRenderingContext2D | null = canvas.getContext('2d');

            canvas.height = Math.ceil(viewport.height);
            canvas.width = Math.ceil(viewport.width);

            // Add the canvas to the print container
            printContainer.appendChild(canvas);

            const renderContext: PrintRenderContext = {
          canvasContext: context!,
          viewport: viewport
            };

            return (page.render(renderContext) as any).promise as Promise<void>;
        });
        renderPromises.push(renderPromise);
    }

    try {
        // Wait for all pages to render
        await Promise.all(renderPromises);

        // Call the browser's print function
        window.print();

    } catch (error) {
        console.error("准备打印时出错:", error);
        alert("准备打印时发生错误，请查看控制台。");
    } finally {
        // After printing is completed (whether successful, failed or canceled), clean up the DOM and restore the button state
        document.body.removeChild(printContainer);
    }
    
  };


  useEffect(() => {
    const viewer = viewerRef.current;
    const el = viewer?.container ?? viewer?.viewer;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      const dy =
        e.deltaMode === 1 ? e.deltaY * 16 :
        e.deltaMode === 2 ? e.deltaY * window.innerHeight :
        e.deltaY;


      if (dy < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    };

    el.addEventListener("wheel", onWheel as EventListener, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-')             { e.preventDefault(); zoomOut(); }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      el.removeEventListener("wheel", onWheel as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);


  async function handleHistory(next:boolean){
    console.log(currentHistoryRef.current);
    
    if(currentHistoryRef.current.length == 0) {
      if (window.electronAPI) {
        window.electronAPI?.showAlert?.({
          type: "info",
          title: "莫得路啦",
          message: langMap["noLastAnchor"] || "没有再往前的锚点了",
        });
      }
      return;
    }
    if(next){
      console.log("Go next");
    }
    else{
      console.log("Go back");
      const pageNum = currentHistoryRef.current.pop();
      linkServiceRef.current?.goToPage(pageNum!);
    }
  }



    

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        background: "linear-gradient(135deg, #dff0ff 0%, #eaf3ff 40%, #c5e2ff 100%)",
        color: "#0f2b5b",
        position: "relative",
        overflow: "clip",
      }}
    >
      <div style={{
        position: "absolute", top: -80, left: -80, width: 280, height: 280,
        borderRadius: 999, background: "rgba(59,130,246,0.25)", filter: "blur(60px)", pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute", bottom: -120, right: -120, width: 380, height: 380,
        borderRadius: 999, background: "rgba(99,102,241,0.25)", filter: "blur(80px)", pointerEvents: "none"
      }} />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 8,
          overflowX: "auto",
          overflowY: "auto",
          flex: "0 0 auto",
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 16,
          boxShadow: "0 18px 40px -20px rgba(30,64,175,0.35)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          marginLeft: 12,
          marginRight: 12,
          marginTop: 0,
          marginBottom: 6,
          minHeight: 48,
          maxHeight: 112,
        }}
        className="toolBar"
      >
        {/* <input type="file" accept="application/pdf" onChange={onFile} /> */}
        <MousePointer size={20} onClick={() => setCursorMode("select")} className={`${base} ${cursorMode === "select" ? active : ""}`}/>
        {/* <Pencil size={20} onClick={() => setCursorMode("pen")} className={`${base} ${cursorMode === "pen" ? active : ""}`}/> */}
        <Eraser size={20} onClick={() => setCursorMode("eraser")} className={`${base} ${cursorMode === "eraser" ? active : ""}`}/>

        <button
          onClick={zoomOut}
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          -
        </button>

        <span style={{ minWidth: 56, textAlign: "center", opacity: 0.8 }}>{scalePct}%</span>

        <button
          onClick={zoomIn}
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          +
        </button>

        <button
          onClick={fitWidth}
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          {"<->"}
        </button>

        <button
          onClick={fitPage}
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          {"↕"}
        </button>

        <button
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
          onClick={handleRotate.bind(null,"counterClockwise")}
        >
          ↺
        </button>
          
        <button
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
          onClick={handleRotate.bind(null,"clockwise")}
          >
          ↻
        </button>

        {linkServiceRef.current && (
          <JumpBar LinkService={linkServiceRef.current} pagesCount={pagesCount} />
        )}
        {eventBusRef.current && <SearchBar eventBus={eventBusRef.current} />}

        <button
          onClick={hideBookMark}
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          {bookMarkVisible ? langMap["disableBookMark"] : langMap["showBookmark"]}
        </button>

        <button
          onClick={setBubble}
          style={{
            padding: "6px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 6px 16px -8px rgba(30,64,175,0.35)",
          }}
        >
          {enablePreviewState ? langMap["banPreviewCard"] : langMap["enablePreviewCard"]}
        </button>

        <button
          ref={saveButton}
          type="button"
          title={langMap["save"] || "保存"}
          onClick={handleSavePdf}
          className={base}
        >
          <Save size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          title={langMap["saveAs"] || "另存为"}
          onClick={handleSaveAsAnotherPdf}
          className={base}
        >
          <FileOutput size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          title={langMap["print"] || "打印"}
          onClick={handlePrint}
          className={base}
        >
          <Printer size={20} aria-hidden="true" />
        </button>
        

        <button
          type="button"
          title={langMap["originalPlace"]}
          onClick={handleHistory.bind(null,false)}
          className={base}
        >
          {"<-"}
        </button>
        {/* <button
          type="button"
          title={"下一个锚点"}
          onClick={handleHistory.bind(null,true)}
          className={base}
        >
          {"->"}
        </button> */}
        
        
        
      </div>
      {pagesCount > 0 && (
          <span style={{ marginLeft: "auto", opacity: 0.65 ,position:"fixed",right:30,bottom:0,zIndex:9,userSelect:"none"}}>
            {langMap["currentPage"]}:{currentPage}   {langMap["totalPages"]}:{pagesCount}
          </span>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          background: "transparent",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 3,
          paddingBottom: 0,
          gap: 12,
        }}
      >
        {bookMarkVisible && (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.6)",
              background: "rgba(255,255,255,0.45)",
              borderRadius: 16,
              boxShadow: "0 18px 40px -20px rgba(30,64,175,0.35)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              overflow: "hidden",
              alignSelf: "stretch",
              minHeight: 0,
            }}
          >
            <BookMark
              pdfDoc={pdfDoc}
              onGoToDest={(dest) => {currentHistoryRef.current.push(currentPage);linkServiceRef.current?.goToDestination(dest);console.log(currentHistoryRef.current);
              }}
            />
          </div>
        )}

        <div
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            alignSelf: "stretch",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.75))",
            border: "1px solid rgba(255,255,255,0.7)",
            borderRadius: 20,
            boxShadow: "0 24px 60px -28px rgba(30,64,175,0.45)",
            overflow: "hidden",
            isolation: "isolate",
            height: "100%",
          }}
        >
          <div
            id="viewerContainer"
            ref={viewerContainerRef}
            style={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
            }}
          >
            <div
              id="viewer"
              className="pdfViewer"
              onContextMenu={(e) => {
                const container = viewerContainerRef.current;
                if (container && hitAnnoAt(e.nativeEvent, container)) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                e.preventDefault();
                const popupWidth = 140;
                const popupHeight = 353 * 2/3;
                const margin = 8;

                const vw = window.innerWidth;
                const vh = window.innerHeight;

                let x = e.clientX;
                let y = e.clientY;

                if (x + popupWidth + margin > vw) {
                  x = vw - popupWidth - margin;
                }

                if (y + popupHeight + margin > vh) {
                  y = vh - popupHeight - margin;
                }

                setPopupWindowCoordinates({ x, y });
                console.log({ x: e.clientX, y: e.clientY });
                setShowMenu(true);
              }}
              onClick={() => {
                setShowMenu(false);
              }}

              style={{
                background: "linear-gradient(180deg,#f6fbff 0%, #ffffff 60%)",
              }}
            />
          </div>
        </div>
      </div>

      {eventBusRef.current && pdfDoc && docKey && viewerRef.current &&(
        <PopupWindow
          key={docKey}
          visibility={showMenu}
          clickX={popupWindowCoordinates?.x}
          clickY={popupWindowCoordinates?.y}
          setVisibility={setShowMenu}
          eventBusRef={eventBusRef!}
          pdfDocFingerprint={docKey}
          cursorMode={cursorMode}
          viewer={viewerRef.current!}
        />
      )}
    </div>

  );

  // Hit: Use coordinates to hit the annotation rectangle of the current page in real time (not dependent on mouseover)
  function hitAnnoAt(ev: MouseEvent, container: HTMLElement) {
    const target = ev.target as HTMLElement;
    // current page
    const pageEl =
      (target.closest(".page") as HTMLElement | null) ||
      (container.querySelector(".page:hover") as HTMLElement | null);
    if (!pageEl) return null;

    const pageNumber = Number(pageEl.dataset.pageNumber || pageEl.getAttribute("data-page-number"));
    if (!pageNumber) return null;

    const cand = pageEl.querySelectorAll<HTMLElement>(".annotationLayer [data-annotation-id]");
    for (const n of cand) {
      const r = n.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        const id = n.dataset.annotationId || n.getAttribute("data-annotation-id") || "";
        if (!id) continue;
        return { el: n, pageNumber, id };
      }
    }
    return null;
  }

  // Follow Y (the preview card's left side is horizontally centered in showPreview )
  function followPreviewY(ev: MouseEvent, container: HTMLElement) {
    const box = previewRef.current!;
    if (!box || box.style.display === "none") return;
    const { scrollTop, clientHeight } = container;
    const crect = container.getBoundingClientRect();
    const desiredTop = scrollTop + (ev.clientY - crect.top) + 12;
    const boxH = box.offsetHeight || 324; // 300+24 padding
    const margin = 8;
    const topMin = scrollTop + margin;
    const topMax = scrollTop + clientHeight - boxH - margin;
    box.style.top = `${Math.min(Math.max(desiredTop, topMin), Math.max(topMin, topMax))}px`;
  }

  // Index of notes per page
  async function ensureAnnoIndex(pageNumber: number) {
    const cache = pageAnnoIndexRef.current;
    if (cache.has(pageNumber)) return cache.get(pageNumber)!;
    const doc = pdfDocRef.current!;
    const page: PDFPageProxy = await doc.getPage(pageNumber);
    const annos = await page.getAnnotations();
    const m = new Map<string, any>();
    for (const a of annos) m.set(a.id, a);
    cache.set(pageNumber, m);
    return m;
  }

  async function resolveDestToPageNumber(doc: PDFDocumentProxy, dest: any): Promise<number | null> {
    try {
      let explicit: any[] | null = null;
      if (Array.isArray(dest)) explicit = dest;
      else if (typeof dest === "string") explicit = await doc.getDestination(dest);
      if (!explicit || !explicit[0]) return null;
      const ref = explicit[0];
      const pageIndex = await doc.getPageIndex(ref);
      return pageIndex + 1;
    } catch {
      return null;
    }
  }

  function previewChromeHeight() {
    return previewPinnedRef.current ? 30 : 0;
  }

  function setPreviewBoxSize(size: PreviewSize) {
    const box = previewRef.current;
    if (!box) return;
    box.style.width = `${size.width + 24}px`;
    box.style.height = `${size.height + 24 + previewChromeHeight()}px`;
  }

  function clonePreviewCanvas(src: HTMLCanvasElement) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
    return c;
  }

  function closePreview() {
    if (previewRenderTimerRef.current != null) {
      window.clearTimeout(previewRenderTimerRef.current);
      previewRenderTimerRef.current = null;
    }
    previewPinnedRef.current = false;
    previewRenderStateRef.current = null;
    hoverStateRef.current = null;

    const box = previewRef.current;
    if (!box) return;
    box.classList.remove("is-pinned");
    box.style.display = "none";
    box.style.pointerEvents = "none";
    box.style.transform = "translateX(-50%)";
  }

  function normalizePreviewPosition() {
    const box = previewRef.current;
    const container = viewerContainerRef.current;
    if (!box || !container) return;

    const boxRect = box.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    box.style.left = `${container.scrollLeft + boxRect.left - containerRect.left}px`;
    box.style.top = `${container.scrollTop + boxRect.top - containerRect.top}px`;
    box.style.transform = "none";
  }

  function pinPreview() {
    const box = previewRef.current;
    if (!box) return;

    normalizePreviewPosition();
    previewPinnedRef.current = true;
    box.classList.add("is-pinned");
    box.style.pointerEvents = "auto";
    setPreviewBoxSize(previewSizeRef.current);
  }

  function schedulePreviewRerender(delay = 120) {
    if (previewRenderTimerRef.current != null) {
      window.clearTimeout(previewRenderTimerRef.current);
    }
    previewRenderTimerRef.current = window.setTimeout(() => {
      previewRenderTimerRef.current = null;
      void renderPreviewFromState();
    }, delay);
  }

  function mountPreviewShell(srcCanvas?: HTMLCanvasElement, message?: string) {
    const box = previewRef.current;
    if (!box) return;

    const size = previewSizeRef.current;
    box.innerHTML = "";

    const bar = document.createElement("div");
    bar.className = "pdf-link-preview__bar";
    bar.addEventListener("pointerdown", startPreviewDrag);

    const grip = document.createElement("span");
    grip.className = "pdf-link-preview__grip";
    grip.setAttribute("aria-hidden", "true");
    bar.appendChild(grip);

    const close = document.createElement("button");
    close.className = "pdf-link-preview__close";
    close.type = "button";
    close.setAttribute("aria-label", "Close preview");
    close.textContent = "X";
    close.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closePreview();
    });
    bar.appendChild(close);

    const content = document.createElement("div");
    content.className = "pdf-link-preview__content";
    if (message) {
      content.style.color = "#64748b";
      content.style.fontSize = "13px";
      content.textContent = message;
    } else if (srcCanvas) {
      const node = clonePreviewCanvas(srcCanvas);
      node.style.display = "block";
      node.style.width = `${size.width}px`;
      node.style.height = `${size.height}px`;
      content.appendChild(node);
    }

    box.appendChild(bar);
    box.appendChild(content);

    (["n", "s", "e", "w", "nw", "ne", "sw", "se"] as PreviewResizeEdge[]).forEach((edge) => {
      const handle = document.createElement("div");
      handle.className = "pdf-link-preview__resize";
      handle.dataset.edge = edge;
      handle.addEventListener("pointerdown", (ev) => startPreviewResize(ev, edge));
      box.appendChild(handle);
    });
  }

  function startPreviewDrag(ev: PointerEvent) {
    if (!previewPinnedRef.current || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    normalizePreviewPosition();

    const box = previewRef.current;
    if (!box) return;
    const startX = ev.clientX;
    const startY = ev.clientY;
    const startLeft = parseFloat(box.style.left || "0");
    const startTop = parseFloat(box.style.top || "0");

    const onMove = (moveEv: PointerEvent) => {
      box.style.left = `${startLeft + moveEv.clientX - startX}px`;
      box.style.top = `${startTop + moveEv.clientY - startY}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
    };

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
  }

  function startPreviewResize(ev: PointerEvent, edge: PreviewResizeEdge) {
    if (!previewPinnedRef.current || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    normalizePreviewPosition();

    const box = previewRef.current;
    if (!box) return;

    const minContentW = 240;
    const minContentH = 100;
    const startX = ev.clientX;
    const startY = ev.clientY;
    const startLeft = parseFloat(box.style.left || "0");
    const startTop = parseFloat(box.style.top || "0");
    const startOuterW = box.offsetWidth;
    const startOuterH = box.offsetHeight;

    const applySize = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      let left = startLeft;
      let top = startTop;
      let outerW = startOuterW;
      let outerH = startOuterH;

      if (edge.includes("e")) outerW = startOuterW + dx;
      if (edge.includes("s")) outerH = startOuterH + dy;
      if (edge.includes("w")) {
        outerW = startOuterW - dx;
        left = startLeft + dx;
      }
      if (edge.includes("n")) {
        outerH = startOuterH - dy;
        top = startTop + dy;
      }

      const minOuterW = minContentW + 24;
      const minOuterH = minContentH + 24 + previewChromeHeight();
      if (outerW < minOuterW) {
        if (edge.includes("w")) left -= minOuterW - outerW;
        outerW = minOuterW;
      }
      if (outerH < minOuterH) {
        if (edge.includes("n")) top -= minOuterH - outerH;
        outerH = minOuterH;
      }

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      previewSizeRef.current = {
        width: Math.round(outerW - 24),
        height: Math.round(outerH - 24 - previewChromeHeight()),
      };
      setPreviewBoxSize(previewSizeRef.current);
      schedulePreviewRerender();
    };

    const onUp = () => {
      document.removeEventListener("pointermove", applySize, true);
      document.removeEventListener("pointerup", onUp, true);
      void renderPreviewFromState();
    };

    document.addEventListener("pointermove", applySize, true);
    document.addEventListener("pointerup", onUp, true);
  }

  async function renderPreviewFromState() {
    const doc = pdfDocRef.current as any;
    const box = previewRef.current;
    const state = previewRenderStateRef.current;
    if (!doc || !box || !state) return;

    const size = previewSizeRef.current;
    const key = `${doc.fingerprint}-p${state.pageIndex + 1}-w${size.width}-h${size.height}-dpr${state.dpr}-z${state.zoom}-by${state.focusBiasY}`;
    const cached = previewCacheRef.current.get(key);
    if (cached) {
      mountPreviewShell(cached);
      return;
    }

    mountPreviewShell(undefined, "Generating preview...");

    const page: PDFPageProxy = await doc.getPage(state.pageIndex + 1);
    const vp = page.getViewport({ scale: state.dpr * state.zoom });
    const off = document.createElement("canvas");
    off.width = Math.ceil(vp.width);
    off.height = Math.ceil(vp.height);

    const offCtx = off.getContext("2d")!;
    offCtx.fillStyle = "white";
    offCtx.fillRect(0, 0, off.width, off.height);
    await page.render({ canvasContext: offCtx, viewport: vp }).promise;

    const t = vp.transform;
    const py = t[1] * state.anchorX + t[3] * state.anchorY + t[5];
    const winPXW = Math.max(1, Math.round(size.width * state.dpr));
    const winPXH = Math.max(1, Math.round(size.height * state.dpr));
    const srcW = off.width;
    const srcH = Math.min(off.height, Math.round(srcW * (winPXH / winPXW)));
    const sx = 0;
    let sy = Math.round(py - srcH * (0.5 + state.focusBiasY));
    sy = Math.max(0, Math.min(sy, off.height - srcH));

    const canv = document.createElement("canvas");
    canv.width = winPXW;
    canv.height = winPXH;
    canv.style.width = `${size.width}px`;
    canv.style.height = `${size.height}px`;

    const ctx = canv.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, winPXW, winPXH);
    ctx.drawImage(off, sx, sy, srcW, srcH, 0, 0, winPXW, winPXH);

    previewCacheRef.current.set(key, canv);
    mountPreviewShell(canv);
  }

  async function showResizablePreview(ev: MouseEvent, anno: any) {
    if (!enablePreview.current || previewPinnedRef.current) return;
    const doc = pdfDocRef.current as any;
    const container = viewerContainerRef.current as HTMLElement;
    const box = previewRef.current as HTMLDivElement;
    if (!doc || !container || !box) return;
    if (!anno?.dest || anno?.url) return;

    const resolveDest = async (d: any) => {
      if (Array.isArray(d)) return d;
      if (typeof d === "string") {
        const explicit = await doc.getDestination(d);
        return Array.isArray(explicit) ? explicit : null;
      }
      return null;
    };

    try {
      const destArray = await resolveDest(anno.dest);
      if (!destArray) return;

      const ref = destArray[0];
      const pageIndex = await doc.getPageIndex(ref);
      const page: PDFPageProxy = await doc.getPage(pageIndex + 1);
      const mode = (destArray[1]?.name || destArray[1]) as any;
      let anchorX = 0;
      let anchorY = 0;
      if (mode === "XYZ" && typeof destArray[2] === "number" && typeof destArray[3] === "number") {
        anchorX = destArray[2];
        anchorY = destArray[3];
      } else {
        anchorX = (page.view[2] - page.view[0]) / 2;
        anchorY = (page.view[3] - page.view[1]) / 2;
      }

      previewPinnedRef.current = false;
      previewRenderStateRef.current = {
        pageIndex,
        anchorX,
        anchorY,
        dpr: Math.max(1, window.devicePixelRatio || 1),
        zoom: 1.5,
        focusBiasY: -0.12,
      };
      previewSizeRef.current = { width: 900, height: 300 };

      const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
      const crect = container.getBoundingClientRect();
      box.classList.remove("is-pinned");
      box.style.display = "flex";
      box.style.pointerEvents = "none";
      box.style.left = `${scrollLeft + clientWidth / 2}px`;
      box.style.transform = "translateX(-50%)";
      box.style.padding = "0";
      box.style.boxSizing = "border-box";
      box.style.flexDirection = "column";
      box.style.alignItems = "stretch";
      box.style.justifyContent = "flex-start";
      box.style.zIndex = "9999";
      setPreviewBoxSize(previewSizeRef.current);

      const desiredTop = scrollTop + (ev.clientY - crect.top) + 12;
      const boxH = previewSizeRef.current.height + 24;
      const margin = 8;
      const topMin = scrollTop + margin;
      const topMax = scrollTop + clientHeight - boxH - margin;
      box.style.top = `${Math.min(Math.max(desiredTop, topMin), Math.max(topMin, topMax))}px`;

      await renderPreviewFromState();
    } catch (err) {
      console.warn("Preview failed", err);
      mountPreviewShell(undefined, "Preview failed");
    }
  }

  async function showPreview(ev: MouseEvent, anno: any) {
    if (!enablePreview.current) return;
    const useResizablePreview = true;
    if (useResizablePreview) {
      await showResizablePreview(ev, anno);
      return;
    }
    const doc = pdfDocRef.current as any;
    const container = viewerContainerRef.current as HTMLElement;
    const box = previewRef.current as HTMLDivElement;
    if (!doc || !container || !box) return;
    if (!anno?.dest || anno?.url) return;

    const resolveDest = async (d: any) => {
      if (Array.isArray(d)) return d;
      if (typeof d === "string") {
        const explicit = await doc.getDestination(d);
        return Array.isArray(explicit) ? explicit : null;
      }
      return null;
    };
    const cloneCanvasPixels = (src: HTMLCanvasElement) => {
      const c = document.createElement("canvas");
      c.width = src.width; c.height = src.height;
      c.getContext("2d")!.drawImage(src, 0, 0);
      return c;
    };

    try {
      const destArray = await resolveDest(anno.dest);
      if (!destArray) return;

      const ref = destArray[0];
      const pageIndex = await doc.getPageIndex(ref); // 0-based

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const zoom = 1.5;
      const winCSSW = 900;
      const winCSSH = 300;
      const focusBiasY = -0.12;

      const key = `${doc.fingerprint}-p${pageIndex + 1}-w${winCSSW}-h${winCSSH}-dpr${dpr}-z${zoom}-by${focusBiasY}`;

      const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
      const crect = container.getBoundingClientRect();
      box.style.display = "flex";
      box.style.pointerEvents = "none";
      box.style.left = `${scrollLeft + clientWidth / 2}px`;
      box.style.transform = "translateX(-50%)";
      box.style.width = `${winCSSW + 24}px`;
      box.style.height = `${winCSSH + 24}px`;
      box.style.padding = "0";
      box.style.boxSizing = "border-box";
      (box.style as any).alignItems = "center";
      (box.style as any).justifyContent = "center";
      box.style.zIndex = "9999";

      const mount = (srcCanvas: HTMLCanvasElement) => {
        box.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.style.padding = "12px";
        wrap.style.boxSizing = "border-box";
        wrap.style.width = `${winCSSW}px`;
        wrap.style.height = `${winCSSH}px`;
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.justifyContent = "center";

        const node = cloneCanvasPixels(srcCanvas);
        node.style.display = "block";
        node.style.width = "100%";
        node.style.height = "auto";
        wrap.appendChild(node);
        box.appendChild(wrap);

        const desiredTop = scrollTop + (ev.clientY - crect.top) + 12;
        const boxH = box.offsetHeight || (winCSSH + 24);
        const margin = 8;
        const topMin = scrollTop + margin;
        const topMax = scrollTop + clientHeight - boxH - margin;
        box.style.top = `${Math.min(Math.max(desiredTop, topMin), Math.max(topMin, topMax))}px`;
      };

      box.innerHTML = '<div style="padding:20px;text-align:center;color:#ccc;">生成预览中...</div>';

      // 1) Off-screen full-page rendering（DPR×zoom）
      const page: PDFPageProxy = await doc.getPage(pageIndex + 1);
      const baseScale = 1.0;
      const vp = page.getViewport({ scale: baseScale * dpr * zoom });

      const off = document.createElement("canvas");
      off.width = Math.ceil(vp.width);
      off.height = Math.ceil(vp.height);
      const offCtx = off.getContext("2d")!;
      offCtx.fillStyle = "white";
      offCtx.fillRect(0, 0, off.width, off.height);
      await page.render({ canvasContext: offCtx, viewport: vp }).promise;

      // 2) Anchor Point (XYZ Priority)
      let anchorX = 0, anchorY = 0;
      const mode = (destArray[1]?.name || destArray[1]) as any;
      if (mode === "XYZ" && typeof destArray[2] === "number" && typeof destArray[3] === "number") {
        anchorX = destArray[2]; // left
        anchorY = destArray[3]; // top（PDF Origin lower left）
      } else {
        anchorX = (page.view[2] - page.view[0]) / 2;
        anchorY = (page.view[3] - page.view[1]) / 2;
      }

      // 3) PDF Points → Off-Screen Pixels
      const t = vp.transform;
      const py = t[1] * anchorX + t[3] * anchorY + t[5];

      // 4) Target pixel size (CSS × DPR)
      const winPXW = Math.round(winCSSW * dpr);
      const winPXH = Math.round(winCSSH * dpr);

      const srcW = off.width;
      const srcH = Math.round(srcW * (winPXH / winPXW));
      const sx = 0;

      let sy = Math.round(py - srcH * (0.5 + focusBiasY));
      sy = Math.max(0, Math.min(sy, off.height - srcH));

      const canv = document.createElement("canvas");
      canv.width = winPXW;
      canv.height = winPXH;
      canv.style.width = `${winCSSW}px`;
      canv.style.height = `${winCSSH}px`;

      const ctx = canv.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, winPXW, winPXH);
      ctx.drawImage(off, sx, sy, srcW, srcH, 0, 0, winPXW, winPXH);

      previewCacheRef.current.set(key, canv);
      mount(canv);
    } catch (err) {
      console.warn("预览失败", err);
      if (previewRef.current) {
        previewRef.current.innerHTML =
          '<div style="padding:20px;text-align:center;color:#999;">预览生成失败</div>';
      }
    }
  }

  function injectOnce(id: string, css: string) {
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

}

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type Mark =
  | { id: string; page: number; type: "highlight" | "underline" | "strike"; rects: Rect[]; color?: string; note?: string }
  | { id: string; page: number; type: "note"; anchor: Point; text: string }
  |{
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

function parseRGB(color?: string): [number, number, number] {
  if (!color) return [1, 1, 0];
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return [1, 1, 0];
  return [Number(m[1])/255, Number(m[2])/255, Number(m[3])/255];
}
/** Convert '#rrggbb' / 'rgb/rgba' to 0..1 (hex compatible) */
function toRGB(color?: string, fallback: [number,number,number] = [0,0,0]): [number,number,number] {
  if (!color) return fallback;
  const hex = color.trim();
  const m1 = hex.match(/^#?([0-9a-f]{6})$/i);
  if (m1) {
    const n = parseInt(m1[1], 16);
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }
  return parseRGB(color) ?? fallback;
}

function removeExistingExportedAnnots(annots: PDFArray, markIds: Set<string>) {
  for (let i = annots.size() - 1; i >= 0; i--) {
    const annot = annots.lookupMaybe(i, PDFDict);
    const nm = annot?.lookupMaybe(PDFName.of("NM"), PDFString, PDFHexString);
    if (nm && markIds.has(nm.decodeText())) {
      annots.remove(i);
    }
  }
}


async function writeMarksToPdf(
  original: ArrayBuffer, 
  marks: Mark[], 
  chineseFontBuffer: ArrayBuffer // 接收中文字体 buffer
) {
  const pdfDoc = await PDFDocument.load(original);
  
  // 1. 注册 fontkit
  pdfDoc.registerFontkit(fontkit);

  const pages = pdfDoc.getPages();
  const markIdsByPage = new Map<number, Set<string>>();
  for (const mark of marks) {
    const ids = markIdsByPage.get(mark.page) ?? new Set<string>();
    ids.add(mark.id);
    markIdsByPage.set(mark.page, ids);
  }
  const cleanedPages = new Set<number>();

  // 2. 嵌入中文字体 (Subset 模式)
  const customFont = await pdfDoc.embedFont(chineseFontBuffer, { subset: false });

  for (const m of marks) {
    const page = pages[m.page - 1];
    if (!page) continue;

    const W = page.getWidth(), H = page.getHeight();

    let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)
      ?? (page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([]) as PDFArray),
          page.node.lookup(PDFName.of("Annots"), PDFArray));
    
    if (!annots) {
      annots = pdfDoc.context.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }

    if (!cleanedPages.has(m.page)) {
      removeExistingExportedAnnots(annots, markIdsByPage.get(m.page) ?? new Set());
      cleanedPages.add(m.page);
    }

    // --- Note (Sticky Note) ---
    if (m.type === "note") {
      const x = m.anchor.x * W, y = (1 - m.anchor.y) * H;
      const ref = pdfDoc.context.register(pdfDoc.context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("Text"),
        NM: PDFHexString.fromText(m.id),
        Rect: [x, y, x + 20, y + 20],
        Contents: PDFHexString.fromText(m.text || ""),
      }));
      (annots as any).push(ref);
      continue;
    }

    // --- Highlight / Underline / Strike ---
    if (m.type === "highlight" || m.type === "underline" || m.type === "strike") {
      const subtype =
        m.type === "highlight" ? "Highlight" :
        m.type === "underline" ? "Underline" : "StrikeOut";

      const C = parseRGB((m as any).color);
      
      const quads: number[] = [];
      let xMin = 1e9, yMin = 1e9, xMax = -1e9, yMax = -1e9;

      for (const r of (m as any).rects) {
        const left = r.x * W, right = (r.x + r.w) * W;
        const top = (1 - r.y) * H, bottom = (1 - r.y - r.h) * H;
        quads.push(left, top, right, top, left, bottom, right, bottom);
        xMin = Math.min(xMin, left); yMin = Math.min(yMin, bottom);
        xMax = Math.max(xMax, right); yMax = Math.max(yMax, top);
      }

      const ref = pdfDoc.context.register(pdfDoc.context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of(subtype),
        NM: PDFHexString.fromText(m.id),
        Rect: [xMin, yMin, xMax, yMax],
        QuadPoints: quads,
        C,
      }));
      (annots as any).push(ref);
    }

    // --- FreeText
    if (m.type === "freetext") {
      const { x, y, w, h } = m.box;
      const { text, fontSize, textColor, border } = m;

      const left   = x * W;
      const right  = (x + w) * W;
      const top    = (1 - y) * H;
      let bottom = (1 - y - h) * H;

      const fs = fontSize ?? 12;
      const textRGB = toRGB(textColor, [0, 0, 0]);
      const bgRGB   = [84/255, 160/255, 255/255, 0.35]; 
      const borderRGB: [number, number, number] = [0.33, 0.63, 1.0];

      // DA (Default Appearance) 供表单编辑器使用，这里也指向 F1
      const DA = PDFString.of(`/F1 ${fs} Tf ${textRGB[0]} ${textRGB[1]} ${textRGB[2]} rg`);

      const padX = 6, padY = 6;
      const boxW = Math.max(1, right - left);
      const leading = +(fs * 1.2).toFixed(2);

      // --- Automatic line wrapping calculation ---
      const maxWidth = Math.max(1, boxW - padX * 2);
      const originalLines = String(text || "").split(/\r?\n/);
      const wrappedLines: string[] = [];

      for (const line of originalLines) {
        if (line === "") { wrappedLines.push(""); continue; }
        let current = "";
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          const test = current + ch;
          // Calculate the actual text width using embedded fonts.
          const testW = customFont.widthOfTextAtSize(test, fs); 
          if (testW > maxWidth && current.length > 0) {
            wrappedLines.push(current);
            current = ch;
          } else {
            current = test;
          }
        }
        wrappedLines.push(current);
      }

      const requestedBoxH = Math.max(1, top - bottom);
      const requiredBoxH = Math.max(
        requestedBoxH,
        padY * 2 + fs + Math.max(0, wrappedLines.length - 1) * leading,
      );
      bottom = Math.max(0, top - requiredBoxH);
      const boxH = top - bottom;

      // Limit only when the page boundary prevents further growth.
      const usableH = Math.max(1, boxH - padY * 2);
      const maxLines = Math.max(1, Math.floor((usableH - fs) / leading) + 1);
      const lines = wrappedLines.slice(0, maxLines);

      const textOperations = lines.flatMap((ln, i) => {
          const encodedText = customFont.encodeText(ln); // 获取 Hex 编码对象
          return i === 0 
            ? [`${encodedText} Tj`]       // 第一行
            : ["T*", `${encodedText} Tj`] // 后续行（先换行 T*）
      });

      const content = [
        "q", // 保存图形状态
        "/GSbg gs",
        `${bgRGB[0]} ${bgRGB[1]} ${bgRGB[2]} rg`,
        `0 0 ${boxW} ${boxH} re f`, // 填充背景
        "/GSop gs",
        ...(border !== false ? [
          `${borderRGB[0]} ${borderRGB[1]} ${borderRGB[2]} RG`,
          "1 w",
          `0 0 ${boxW} ${boxH} re S`, // 绘制边框
        ] : []),
        "BT", // 开始文本对象
        `/F1 ${fs} Tf`, // 设置字体
        `${textRGB[0]} ${textRGB[1]} ${textRGB[2]} rg`, // 设置文字颜色
        `${padX} ${boxH - padY - fs} Td`, // 定位到第一行基线
        `${leading} TL`, // 设置行高
        ...textOperations, // 插入编码后的文本指令
        "ET", // 结束文本对象
        "Q", // 恢复图形状态
      ].join("\n");

      const apStream = pdfDoc.context.flateStream(content, {
        Type: PDFName.of('XObject'),
        Subtype: PDFName.of('Form'),
        Resources: pdfDoc.context.obj({
          Font: pdfDoc.context.obj({ F1: customFont.ref }), // 映射 F1 到自定义字体
          ExtGState: pdfDoc.context.obj({
            GSbg: pdfDoc.context.obj({ ca: bgRGB[3] ?? 0.35, CA: 1 }),
            GSop: pdfDoc.context.obj({ ca: 1, CA: 1 }),
          }),
        }),
        BBox: pdfDoc.context.obj([0, 0, boxW, boxH]),
      });
      
      const apRef = pdfDoc.context.register(apStream);

      const annot = pdfDoc.context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("FreeText"),
        NM: PDFHexString.fromText(m.id),
        Rect: [left, bottom, right, top],
        Contents: PDFHexString.fromText(String(text || "")),
        DA,
        Q: 0,
        BG: [bgRGB[0], bgRGB[1], bgRGB[2]],
        C:  [borderRGB[0], borderRGB[1], borderRGB[2]],
        BS: pdfDoc.context.obj({ W: 1 }),
        AP: pdfDoc.context.obj({ N: apRef }), // 引用上面生成的 Appearance Stream
      });

      const ref = pdfDoc.context.register(annot);
      (annots as any).push(ref);
      continue;
    }
  }

  console.log("Trying to save");
  return await pdfDoc.save();
}
