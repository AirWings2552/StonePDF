import { useEffect, useRef, useState } from "react";
import "../style/bookMark.css";
import { useOutletContext } from "react-router-dom";
import type { AppOutletCtx } from "../App";

type OutlineItem = {
  title: string;
  dest?: string | unknown[];
  url?: string;
  items?: OutlineItem[];
  bold?: boolean;
  italic?: boolean;
  color?: number[];
};

type PdfDocumentLike = {
  getOutline: () => Promise<OutlineItem[] | null>;
  getDestination: (dest: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: unknown) => Promise<number>;
};

const MIN_W = 100;
const MAX_W = 480;

export default function BookMark({
  pdfDoc,
  onGoToDest,
}: {
  pdfDoc: PdfDocumentLike | null;
  onGoToDest?: (dest: string | unknown[]) => void;
}) {
  const [width, setWidth] = useState<number>(() => {
    const v = localStorage.getItem("bookmarkWidth");
    return v ? Math.max(MIN_W, Math.min(MAX_W, +v)) : 260;
  });
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const {langMap} = useOutletContext<AppOutletCtx>();
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  // Get directory from the localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!pdfDoc) {
        if (mounted) {
          setOutline(null);
          setExpanded(new Set());
        }
        return;
      }
      setLoading(true);
      try {
        const ol = await pdfDoc.getOutline();
        if (mounted) {
          setOutline(ol || []);
          // Expand one level by default
          const s = new Set<string>();
          (ol || []).forEach((_, i: number) => s.add(`0/${i}`));
          setExpanded(s);
        }
      } catch (e) {
        if (mounted) setOutline([]);
        console.warn("getOutline failed:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [pdfDoc]);

  if (!pdfDoc) {
    return null;
  }

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const renderNodes = (nodes?: OutlineItem[], depth = 0, path = "0") => {
    if (!nodes || nodes.length === 0) return null;
    return (
      <ul style={{ listStyle: "none", margin: 0, paddingLeft: depth ? 12 : 8 }}>
        {nodes.map((n, i) => {
          const id = `${path}/${i}`;
          const hasChildren = !!(n.items && n.items.length);
          const isOpen = expanded.has(id);
          return (
            <li key={id} style={{ padding: "1px 4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 6px",
                  borderRadius: 6,
                  minWidth: 0, // Allow shrinkage
                }}
              >
                {hasChildren ? (
                  <span
                    onClick={(e) => { e.stopPropagation(); toggle(id); }}
                    title={isOpen ? langMap["fold"] : langMap["unfold"]}
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      lineHeight: "12px",
                      transform: `rotate(${isOpen ? 90 : 0}deg)`,
                      transition: "transform .15s",
                      flex: "0 0 12px",
                      fontSize: 11,
                      opacity: 0.9,
                    }}
                  >▶</span>
                ) : (
                  <span style={{ width: 12, flex: "0 0 12px" }} />
                )}

                <span
                  className="bm-item-text" // 用于测量 scrollWidth
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (n.url) { window.open(n.url, "_blank"); return; }
                    if (!n.dest) return;
                    if (onGoToDest) { onGoToDest(n.dest); return; }
                    // Fallback (not as accurate as linkService)
                    try {
                      const explicit = Array.isArray(n.dest) ? n.dest : await pdfDoc.getDestination(n.dest);
                      if (!explicit) return;
                      const ref = explicit[0];
                      const pageIndex = await pdfDoc.getPageIndex(ref);
                      console.log("页码 =", pageIndex + 1);
                    } catch (err) { console.warn("resolve dest failed", err); }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    overflowWrap: "anywhere",
                    fontSize: 13,
                    lineHeight: "18px",
                    fontWeight: n.bold ? 600 : 400,
                    fontStyle: n.italic ? "italic" : "normal",
                  }}
                  title={n.title}
                >
                  {n.title || "(无标题)"}
                </span>
              </div>

              {hasChildren && isOpen && renderNodes(n.items, depth + 1, id)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div
      className="bookMark"
      style={{
        position: "relative",
        width,
        minWidth: MIN_W,
        maxWidth: MAX_W,
        overflowX: "hidden",
        overflowY: "auto",
        boxSizing: "border-box",
        background: "rgba(255,255,255,0.55)",
        color: "#0f2b5b",
        borderRight: "1px solid rgba(255,255,255,0.6)",
        fontSize: 13,
        lineHeight: "18px",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 20px 60px -24px rgba(30,64,175,.35)",
      }}
    >
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.6)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
        }}
      >
        <span style={{ opacity: 0.9 }}>{langMap["outline"]||"目录"} {loading ? "（加载中…）" : ""}</span>
        {!loading && outline && outline.length > 0 && (
          <>
            <button
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 8,
                background: "rgba(255,255,255,.7)",
                border: "1px solid rgba(255,255,255,.6)",
                color: "#0f2b5b",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
              onClick={() => {
                const s = new Set<string>();
                outline.forEach((_, i) => s.add(`0/${i}`));
                setExpanded(s);
              }}
            >
              {
            langMap["unfoldOneLevel"] || "展开一级"}
            </button>
            <button
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 8,
                background: "rgba(255,255,255,.7)",
                border: "1px solid rgba(255,255,255,.6)",
                color: "#0f2b5b",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
              onClick={() => setExpanded(new Set())}
            >
              {langMap["foldAll"] || "全部折叠"}
            </button>
          </>
        )}
      </div>

      <div
        ref={listRootRef}
        style={{
          height: "calc(100% - 32px)",
          padding: "6px 2px",
          cursor: "pointer",
          width: width,
        }}
      >
        {outline && outline.length > 0 ? (
          renderNodes(outline)
        ) : loading ? null : (
          <div style={{ padding: 10, color: "#3b6ea8" }}>{langMap["noOutline"] || "此 PDF 没有目录"}</div>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          isDraggingRef.current = true;
          localStorage.setItem("bookmarkAutoFit", "0");
          const startX = e.clientX;
          const startW = width;
          let nextWidth = width;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "col-resize";
          const onMove = (ev: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const next = Math.max(MIN_W, Math.min(MAX_W, startW + (ev.clientX - startX)));
            nextWidth = next;
            setWidth(next);
          };
          const onUp = () => {
            isDraggingRef.current = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            localStorage.setItem("bookmarkWidth", String(nextWidth));
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp, { once: true });
        }}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          height: "100%",
          cursor: "col-resize",
          background: "transparent",
          zIndex: 10,
          transition: "background .2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,132,255,.15)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        title={langMap['dragToAlterWidth'] || '拖动调整宽度'}
      />
    </div>

  );
}
