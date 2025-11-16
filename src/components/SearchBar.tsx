import { useEffect, useRef, useState } from "react";
import type { EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";
import { useOutletContext } from "react-router";
import type { AppOutletCtx } from "../App";

type Props = {
  eventBus: EventBus;
  ready?: boolean;
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

  const dispatchFind = (
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
  };


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
    } else if (e.key === "Escape") {

    }
  };

  const onNext = () => dispatchFind("again", false);
  const onPrev = () => dispatchFind("again", true);

  const onToggleHA = (v: boolean) => {
    setHA(v);
    dispatchFind("highlightallchange");
  };
  const onToggleCS = (v: boolean) => {
    setCS(v);
    dispatchFind("casesensitivitychange");
  };
  const onToggleEW = (v: boolean) => {
    setEW(v);
    dispatchFind("entirewordchange");
  };
  const onToggleMD = (v: boolean) => {
    setMD(v);
    dispatchFind("diacriticmatchingchange");
  };

  useEffect(() => {
    const onCount = (e: any) => {
      const { current = 0, total = 0 } = e?.matchesCount ?? {};
      setCount(total ? `${current}/${total}` : "0/0");
    };

    const FindState = { FOUND: 0, NOT_FOUND: 1, WRAPPED: 2, PENDING: 3 } as const;

    const onState = (e: any) => {
      switch (e.state) {
        case FindState.FOUND:
          setStatus("");
          // console.log("Found");
          
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
          break;
      }
    };

    eventBus.on("updatefindmatchescount", onCount);
    eventBus.on("updatefindcontrolstate", onState);
    return () => {
      eventBus.off("updatefindmatchescount", onCount);
      eventBus.off("updatefindcontrolstate", onState);
    };
  }, [eventBus]);

  useEffect(() => {
    if (!q) {
      setStatus("");
      setCount("0/0");
    }
    if(status == "notFound"){
      setCount("0/0");
    }
  }, [q,status]);


  // SearchHotkey.ts
  function isEditable(el: Element | null) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const t = el.tagName;
    return el.isContentEditable || t === 'INPUT' || t === 'TEXTAREA';
  }

  function installFindHotkey(getInput: () => HTMLInputElement | null,
                                    showSearch?: () => void) {
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return;

      if (isEditable(document.activeElement)) return;

      e.preventDefault(); 
      showSearch?.();  
      const input = getInput();
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
      }
    }, { capture: true });
  }
  useEffect(() => installFindHotkey(() => inputRef.current), []);

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
