import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";
import { useOutletContext } from "react-router-dom";
import type { AppOutletCtx } from "../App";

type Props = {
  eventBus: EventBus;
  ready?: boolean;
};

type FindMatchesEvent = {
  matchesCount?: {
    current?: number;
    total?: number;
  };
};

type FindControlStateEvent = FindMatchesEvent & {
  state: number;
};

export default function SearchBar({ eventBus, ready = true }: Props) {
  // ----- UI 状态 -----
  const [q, setQ] = useState("");
  const [caseSensitive, setCS] = useState(false);
  const [entireWord, setEW] = useState(false);
  const [matchDiacritics, setMD] = useState(false);
  const [highlightAll, setHA] = useState(true);
  const [count, setCount] = useState("0/0");
  const [status, setStatus] = useState<"" | "pending" | "notFound" | "wrapped">("");
  const {langMap} = useOutletContext<AppOutletCtx>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocus] = useState(false);

  const sourceRef = useRef({ tag: "SearchBar" });
  const scrollTimersRef = useRef<number[]>([]);

  const updateCount = useCallback((matchesCount?: FindMatchesEvent["matchesCount"]) => {
    const { current = 0, total = 0 } = matchesCount ?? {};
    setCount(total ? `${current}/${total}` : "0/0");
  }, []);

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    scrollTimersRef.current = [];
  }, []);

  const scrollSelectedMatchIntoView = useCallback(() => {
    const selected = document.querySelector<HTMLElement>(
      "#viewerContainer .textLayer .highlight.selected"
    );
    const container = document.getElementById("viewerContainer");
    if (!selected || !container) return false;

    const selectedBox = selected.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const isVisible =
      selectedBox.bottom > containerBox.top &&
      selectedBox.top < containerBox.bottom &&
      selectedBox.right > containerBox.left &&
      selectedBox.left < containerBox.right;

    if (isVisible) return true;

    const targetTop =
      container.scrollTop +
      selectedBox.top -
      containerBox.top -
      container.clientHeight * 0.42 +
      selectedBox.height / 2;
    const targetLeft =
      container.scrollLeft +
      selectedBox.left -
      containerBox.left -
      container.clientWidth * 0.35 +
      selectedBox.width / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      left: Math.max(0, targetLeft),
      behavior: "smooth",
    });
    return true;
  }, []);

  const scheduleSelectedMatchScroll = useCallback(() => {
    clearScrollTimers();
    scrollTimersRef.current = [0, 80, 180, 320].map((delay) =>
      window.setTimeout(scrollSelectedMatchIntoView, delay)
    );
  }, [clearScrollTimers, scrollSelectedMatchIntoView]);

  const dispatchFind = useCallback((
    type:
      | ""
      | "again"
      | "casesensitivitychange"
      | "entirewordchange"
      | "highlightallchange"
      | "diacriticmatchingchange",
    findPrevious = false
  ) => {
    if (!ready) return;
    eventBus.dispatch("find", {
      source: sourceRef.current,
      type,
      query: q,
      caseSensitive,
      entireWord,
      highlightAll,
      matchDiacritics,
      findPrevious,
    });
  }, [caseSensitive, entireWord, eventBus, highlightAll, matchDiacritics, q, ready]);


  const onInput = (v: string) => {
    setQ(v);
  };

  useEffect(() => {
  if (!ready) return;
  eventBus.dispatch("find", {
    source: sourceRef.current,
    type: "",
    query: q,
    caseSensitive,
    entireWord,
    highlightAll,
    matchDiacritics,
    findPrevious: false,
  });
}, [q, caseSensitive, entireWord, highlightAll, matchDiacritics, ready, eventBus]);


  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      dispatchFind("again", e.shiftKey);
    }
  };

  const onNext = () => {
    dispatchFind("again", false);
  };
  const onPrev = () => {
    dispatchFind("again", true);
  };

  const onToggleHA = (v: boolean) => {
    setHA(v);
  };
  const onToggleCS = (v: boolean) => {
    setCS(v);
  };
  const onToggleEW = (v: boolean) => {
    setEW(v);
  };
  const onToggleMD = (v: boolean) => {
    setMD(v);
  };

  useEffect(() => {
    const onCount = (e: FindMatchesEvent) => {
      updateCount(e?.matchesCount);
    };

    const FindState = { FOUND: 0, NOT_FOUND: 1, WRAPPED: 2, PENDING: 3 } as const;

    const onState = (e: FindControlStateEvent) => {
      updateCount(e?.matchesCount);
      switch (e.state) {
        case FindState.FOUND:
          setStatus("");
          // console.log("Found");
          scheduleSelectedMatchScroll();
          
          break;
        case FindState.PENDING:
          // console.log("PENDING");
          setStatus("pending");
          break;
        case FindState.NOT_FOUND:
          // console.log("Not Found");
          setStatus("notFound");
          break;
        case FindState.WRAPPED:
          // console.log("WRAPPED");
          setStatus("wrapped");
          scheduleSelectedMatchScroll();
          break;
      }
    };

    eventBus.on("updatefindmatchescount", onCount);
    eventBus.on("updatefindcontrolstate", onState);
    return () => {
      eventBus.off("updatefindmatchescount", onCount);
      eventBus.off("updatefindcontrolstate", onState);
    };
  }, [eventBus, scheduleSelectedMatchScroll, updateCount]);

  useEffect(() => clearScrollTimers, [clearScrollTimers]);

  useEffect(() => {
    if (!q) {
      setStatus("");
      setCount("0/0");
    }
    if(status === "notFound"){
      setCount("0/0");
    }
  }, [q,status]);


  useEffect(() => {
    const isEditable = (el: Element | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const t = el.tagName;
      return el.isContentEditable || t === 'INPUT' || t === 'TEXTAREA';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return;

      if (isEditable(document.activeElement)) return;

      e.preventDefault(); 
      const input = inputRef.current;
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
      }
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }} className="search-bar" 
        tabIndex={-1}
        onFocusCapture={() => setFocus(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setFocus(false);
          }
        }}>
      <input
        value={q}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        data-status={status}
        aria-invalid={status === "notFound"}
        style={{width:150,border:"1px solid #ccc", borderRadius:4}}
        ref={inputRef}
        
      />
      {focused && <label><input type="checkbox" checked={highlightAll}   onChange={e => onToggleHA(e.target.checked)} />{langMap["highlightAll"]||"高亮全部"}</label>}
      {focused && <label><input type="checkbox" checked={caseSensitive}  onChange={e => onToggleCS(e.target.checked)} />Aa</label>}
      {focused && <label><input type="checkbox" checked={entireWord}     onChange={e => onToggleEW(e.target.checked)} />{"[abc]"}</label>}
      {focused && <label><input type="checkbox" checked={matchDiacritics} onChange={e => onToggleMD(e.target.checked)} />{langMap["diacritics"]||"区分变音"}</label>}

      {focused && <button onClick={onPrev} disabled={!ready}>⟵</button>}
      {focused && <button onClick={onNext} disabled={!ready}>⟶</button>}
      {focused && <span>{count}</span>}
    </div>
  );
}
