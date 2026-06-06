import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import "../style/popupWindow.css";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import usePdfMarks from "./Marker.tsx";
import { useOutletContext } from "react-router-dom";
import type { AppOutletCtx } from "../App.tsx";

type Props = {
  clickX?: number;
  clickY?: number;
  visibility: boolean;
  setVisibility: (v: boolean) => void;
  eventBusRef: React.MutableRefObject<EventBus | null>;
  pdfDocFingerprint: string;
  cursorMode:"select" | "pen" | "eraser";
  viewer?: PDFViewer;
};

export default function PopupWindow({
  clickX,
  clickY,
  visibility,
  setVisibility,
  eventBusRef,
  pdfDocFingerprint,
  cursorMode,
  viewer
}: Props) {
        const { addLineMark, clearAllMarks,addFreeText} = usePdfMarks({
        eventBus: eventBusRef.current!,
        fingerprint: pdfDocFingerprint!,
        mode:cursorMode,
        viewer:viewer!
    });
  const {langMap,setDocumentDirty} = useOutletContext<AppOutletCtx>();

  const containerRef = useRef<HTMLDivElement>(null);


  const textRef = useRef<string>("");

  const hideMenu = useCallback(() => {
    containerRef.current!.style.visibility = "hidden";
    containerRef.current!.style.zIndex = "-1";
    setVisibility(false);
  }, [setVisibility]);

  useEffect(() => {
    if (!visibility) hideMenu();
  }, [hideMenu, visibility]);

  /* locate the position of the menu */
  useEffect(() => {
    const onSel = () => {
      textRef.current = window.getSelection()?.toString() ?? "";
    };

    const onCtx = () => {
      if (
        clickX !== undefined &&
        clickY !== undefined &&
        visibility &&
        containerRef.current
      ) {
        const node = containerRef.current;
        node.style.left = `${clickX}px`;
        node.style.top = `${clickY}px`;
        node.style.visibility = "visible";
        node.style.zIndex = "1000";
      }
    };

    document.addEventListener("selectionchange", onSel);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [clickX, clickY, visibility]);

  /* -------- Auxiliary: Get the current page element & scale coordinates -------- */
  const getPageInfo = () => {
    const el = document.elementFromPoint(clickX!, clickY!);
    const pageEl = el?.closest(".page") as HTMLElement | null;
    if (!pageEl) return null;
    const box = pageEl.getBoundingClientRect();
    const px = (clickX! - box.left) / box.width;
    const py = (clickY! - box.top) / box.height;
    return { pageEl, anchor: { x: px, y: py } };
  };

  
  const actions: Record<string, () => void> = {
    freeTextArea:() => {
      hideMenu();
      setTimeout(() => {
            const info = getPageInfo();
            if (info) {
              const rect = info.pageEl.getBoundingClientRect();
              const W = info.pageEl.clientWidth;
              const H = info.pageEl.clientHeight;

              // Convert the mouse position to relative coordinates (0~1)
              if(clickX && clickY){
                const x = (clickX - rect.left) / W;
                const y = (clickY - rect.top) / H;
                // default settings
                const w = 160 / W;
                const h = 80 / H;

                addFreeText(info.pageEl, { x, y, w, h });
                if(pdfDocFingerprint != undefined) {
                  setDocumentDirty(pdfDocFingerprint, true);
                }
              }
            }
      }, 0);
      
    },
    copy: () => {
      navigator.clipboard.writeText(textRef.current).catch(console.warn);
      hideMenu();
    },
    paste: async () => {
      try {
        const txt = await navigator.clipboard.readText();
        console.log("粘贴：", txt);
      } catch (e) {
        console.warn(e);
      }
      hideMenu();
    },
    highlight: () => {
        hideMenu();                         // Hide first, make sure elementFromPoint can click on the .page below
        setTimeout(() => {                  // Wait for one frame before retrieving it
            const info = getPageInfo();
            if (info) {
              addLineMark(info.pageEl, "highlight");
              if(pdfDocFingerprint != undefined) {
                setDocumentDirty(pdfDocFingerprint, true);
              }
            }
        }, 0);
    },
    underline: () => {
        hideMenu();
        setTimeout(() => {
                const info = getPageInfo();
                if (info) addLineMark(info.pageEl, "underline");
        }, 0);
      
    },
    deleteline: () => {
        hideMenu();
        setTimeout(() => {
                const info = getPageInfo();
                if (info) addLineMark(info.pageEl, "strike");
        }, 0);
        
    },
    annotation: () => {
        hideMenu();
        // setTimeout(() => {
        //         const info = getPageInfo();
        //         if (info) {
        //             const txt = prompt("输入注释") || "";
        //             addNote(info.pageEl, info.anchor, txt);
        //         }
        // }, 0);
    },

    search: () => {
      console.log("搜索");
      hideMenu();
    },
    translate: () => {
      console.log("翻译");
      hideMenu();
    },
    read: () => {
      console.log("朗读");
      hideMenu();
      clearAllMarks();
    },
    bookMark: () => {
      console.log("添加书签");
      hideMenu();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).id;
    actions[id]?.();
  };

  return (
    <div className="pop" ref={containerRef}>
      <ul className="popList" onClick={handleClick}>
        <li id="freeTextArea">{langMap["freeText"]||"自由文本"}</li>
        <li id="copy">{langMap["copyText"]||"复制"}</li>
        <li id="paste">{langMap["paste"]||"粘贴"}</li>
        <li id="highlight">{langMap["highlight"]||"高亮"}</li>
        {/* <li id="underline">下划线</li>
        <li id="deleteline">删除线</li> */}
        {/* <li id="annotation">添加注释</li>
        <li id="search">搜索</li> */}
        {/* <li id="translate">翻译</li> */}
        {/* <li id="read">{langMap["read"]||"朗读"}</li>
        <li id="bookMark">{langMap["addBookMark"]||"添加书签"}</li> */}
      </ul>
    </div>
  );
}
