import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import type { TabItem } from "./components/TabBar";
import TabBar from "./components/TabBar";
import { LanguagesIcon } from "lucide-react"
import lang_zh from "./assets/localization/chinese.json"
import lang_en from "./assets/localization/english.json"
import lang_du from "./assets/localization/dutch.json"
import { useDocStore } from "./store/useDocStore";




declare global {
  interface MarkRect { x: number; y: number; w: number; h: number; }

  interface HighlightPayload {
    rects: MarkRect[];
    color?: string;
    opacity?: number;
    note?: string;
  }

  interface FreeTextPayload {
    box: { x: number; y: number; w: number; h: number };
    text: string;
    fontSize?: number;
    textColor?: string;
    bgColor?: string;
    border?: boolean;
  }

  interface Window {
    electronAPI?: {
      sendValueToMain?: (value: string) => number;
      openPdf(): Promise<string | null>;
      readPdf(filePath: string): Promise<Uint8Array>;
      writePdf(filePath: string, data: ArrayBuffer | Uint8Array): Promise<boolean>;
      saveAsPdf?(suggestedName?: string, data?: ArrayBuffer | Uint8Array): Promise<string | null>;
      onOpenPath?(cb: (filePath: string) => void): () => void;
      notifyReady?(): void;
      printPdfFile?(filePath: string): Promise<void>;
      showAlert(options: {type: 'none' | 'info' | 'error' | 'question' | 'warning', title: string, message: string}): void;
      openImg(): Promise<Array<{ data: Uint8Array; type: "png" | "jpg" | "jpeg" }>>;
      getPathAfterDownload(url: string): Promise<string>;
      openExternal: (url: string) => void;
      askUser:() => number | Promise<number>;
      onAppCloseCheck?: (cb: () => void) => void | (() => void); // 新增
      confirmClose?: () => void; // 新增
    };

    // 新增的 marks API（与 preload.js 暴露的一致）
    marks: {
      // ---------- highlight ----------
      insertHighlight: (doc_id: string, page: number, payload: HighlightPayload) => Promise<number>;
      listHighlightByDoc: (doc_id: string) => Promise<Array<{ id: number; doc_id: string; page: number; payload: string }>>;
      listHighlightByDocPage: (doc_id: string, page: number) => Promise<Array<{ id: number; doc_id: string; page: number; payload: string }>>;
      updateHighlightPayload: (id: number, payload: HighlightPayload) => Promise<boolean>;
      deleteHighlightById: (id: number) => Promise<boolean>;
      deleteHighlightByDocPage: (doc_id: string, page: number) => Promise<number>;

      // ---------- freetext ----------
      insertFreeText: (doc_id: string, page: number, payload: FreeTextPayload) => Promise<number>;
      listFreeTextByDoc: (doc_id: string) => Promise<Array<{ id: number; doc_id: string; page: number; type: string; payload: string }>>;
      listFreeTextByDocPage: (doc_id: string, page: number) => Promise<Array<{ id: number; doc_id: string; page: number; type: string; payload: string }>>;
      updateFreeText: (id: number, payload: FreeTextPayload, type?: string) => Promise<boolean>;
      deleteFreeTextById: (id: number) => Promise<boolean>;
      deleteFreeTextByDocPage: (doc_id: string, page: number) => Promise<number>;
      deleteHighlightByDoc: (doc_id: string) => Promise<number>;
      deleteFreeTextByDoc: (doc_id: string) => Promise<number>;
    };
  }

  
  
}

const MAX_RECENTS = 20;

type RecentFile = { name: string; sizeKB: number; date: string; path?: string; docId: string };



export type AppOutletCtx = {
  onOpenTab: () => Promise<void>;
  savePdfCtx: (docId: string, pdfPageNum: number) => void;
  openWithElectron: () => Promise<void>;
  recents: RecentFile[];
  openFromPath: (filePath: string) => Promise<void>;
  langMap: Record<string, string>;
  deleteContext:(docId:string,path:string)=>void;
  documentStates: React.RefObject<Record<string, boolean>>;
  registerSaveAction:(id: string, action: () => Promise<void>) => void;
  unregisterSaveAction:(id: string) => void;
  sendValueToMain?: (value: string) => number;
};

// Record tabId -> original file path (for overwriting and saving)
const electronPathMap = new Map<string, string>();

export default function App() {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const restored = useRef(false);
  const [showLangMenu,setLangMenu] = useState(false);
  const [language,setLang] = useState("zh");
  const [langMap,setLangMap] = useState(lang_zh);
  const recentsLoaded = useRef(false);
  const documentStates = useRef<Record<string, boolean>>({});
  const add = useDocStore((s) => s.add);
  // 1. 用 useRef 创建“存储盒”
  const saveActions = useRef<Record<string, () => Promise<void>>>({});

  // 2. 用 useCallback 创建“注册函数”
  const registerSaveAction = useCallback((id: string, action: () => Promise<void>) => {
    saveActions.current[id] = action;
  }, []);

  // 3. 用 useCallback 创建“注销函数”
  const unregisterSaveAction = useCallback((id: string) => {
    delete saveActions.current[id];
  }, []);

  const savePdfCtx = useCallback((docId: string, pdfpageNumber: number) => {
    localStorage.setItem(docId + "ctx", pdfpageNumber.toString());
  }, []);


  // This function is called when the local file is removed manually.
  // It will remove the corresponding context stored in localStorage.
  // This function is passed down to PdfViewer via Outlet context.
  const deleteContext = useCallback((docId:string, path:string) => {
    localStorage.removeItem(docId + "ctx"); // remove page number record in localStorage
    setRecents((r) => r.filter((item) => item.path !== path)); // remove from recents list
  }, []);

  const tabsRef = useRef<TabItem[]>([]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!window.electronAPI?.onAppCloseCheck) return;

    // 监听主进程的“检查关闭”信号
    const removeListener = window.electronAPI.onAppCloseCheck(async () => {
      const currentTabs = tabsRef.current;
      for (const tab of currentTabs) {
        if (documentStates.current[tab.id]) {
          setActiveId(tab.id); 
          
          // 0: Confirm(保存), 1: Abandon(不保存), 2: Cancel(取消关闭)
          const choice = await window.electronAPI!.askUser();

          if (choice === 2) {
            return; 
          }

          if (choice === 0) {
            const saveFn = saveActions.current[tab.id];
            if (saveFn) {
              try {
                console.log(`正在保存 tab: ${tab.id}`);
                await saveFn();
                console.log(`保存完成: ${tab.id}`);
                documentStates.current[tab.id] = false; 
              } catch (e) {
                console.error("Save failed", e);
                if (window.electronAPI?.showAlert) {
                    window.electronAPI.showAlert({
                        type: 'error',
                        title: '保存失败',
                        message: `文件 "${tab.title}" 保存失败，请手动保存或重试。`
                    });
                }
                return;
              }
            } else {
                console.warn(`找不到 saveFn 对于 tab: ${tab.id}`);
            }
          }
          
          if (choice === 1) {
            documentStates.current[tab.id] = false;
          }
        }
      }
      window.electronAPI!.confirmClose?.();
    });
    return () => {
      if (typeof removeListener === "function") {
        removeListener();
      }
    };
  }, []);

  useEffect(() => {
    if (activeId) navigate(`/viewer/${activeId}`);
    else navigate(`/`); // back to MainScreen
  }, [activeId, navigate]);

  const findTabIdByPath = useCallback((p: string): string | null => {
    const target = p.toLowerCase();
    for (const [id, openedPath] of electronPathMap.entries()) {
      if (openedPath.toLowerCase() === target) return id;
    }
    return null;
  }, []);

  const openFromPath = useCallback(async (filePath: string) => {
    if (!filePath) return;
    if (!window.electronAPI) {
      alert("当前不是 Electron 环境，无法直接读取本地路径。");
      return;
    }

    const existedId = findTabIdByPath(filePath);
    if (existedId) {
      setActiveId(existedId);
      return;
    }

    const data = await window.electronAPI.readPdf(filePath);
    if (!data) {
      window.electronAPI.showAlert?.({
        type: "error",
        title: "Error!",
        message: langMap["fileReadError"] || "文件读取失败，请确认文件存在且为 PDF 格式。",
      });
      return;
    }

    const name = filePath.split(/[\\/]/).pop() || "document.pdf";
    const bytes = Uint8Array.from(data);
    const file = new File([new Blob([bytes], { type: "application/pdf" })], name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    const id = await add(file, filePath);
    electronPathMap.set(id, filePath);

    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === id)
        ? currentTabs
        : [...currentTabs, { id, title: file.name }]
    ));
    setActiveId(id);

    setRecents((currentRecents) => {
      const lowerPath = filePath.toLowerCase();
      const nextItem: RecentFile = {
        name: file.name,
        sizeKB: Math.max(1, Math.round(bytes.byteLength / 1024)),
        date: new Date().toISOString().slice(0, 10),
        path: filePath,
        docId: id,
      };
      const filtered = currentRecents.filter((item) => item.path?.toLowerCase() !== lowerPath);
      return [nextItem, ...filtered].slice(0, MAX_RECENTS);
    });
  }, [add, findTabIdByPath, langMap]);

  const openWithElectron = useCallback(async () => {
    if (!window.electronAPI) {
      alert("当前不是 Electron 环境，无法直接打开本地文件。");
      return;
    }

    const filePath = await window.electronAPI.openPdf();
    if (filePath) {
      await openFromPath(filePath);
    }
  }, [openFromPath]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const off = window.electronAPI.onOpenPath?.(async (p: string) => {
      console.log("[renderer] on open-path:", p);
      try {
        await openFromPath(p);
      } catch (e) {
        console.error("openFromPath failed:", e);
      }
    });

    if (!restored.current) {
      window.electronAPI.notifyReady?.();
      restored.current = true;
    }

    return () => off?.();
  }, [openFromPath]);

  const closeTab = useCallback(async (id: string) => {
    const idx = tabs.findIndex((x) => x.id === id);
    const newTabs = tabs.filter((x) => x.id !== id);

    if(documentStates.current[id]){
      const choice = await window.electronAPI!.askUser();
      if(choice === 0){
        const saveFn = saveActions.current[id]; 
        if (saveFn) {
          await saveFn();
        }
      }
      else if(choice !== 1){
        return;
      }
    }
    electronPathMap.delete(id); // Release path mapping
    unregisterSaveAction(id);
    setTabs(newTabs);

    if (activeId === id) {
      const fallback = (idx > 0 ? newTabs[idx - 1] : undefined) ?? newTabs[idx] ?? null;
      setActiveId(fallback?.id ?? null);
    }
    
    
    localStorage.removeItem("marks::" + id);
  }, [activeId, tabs, unregisterSaveAction]);

  const saveRecentList = useCallback(() => {
    localStorage.setItem("recents", JSON.stringify(recents));
  }, [recents]);
  useEffect(()=>{
    const rs = localStorage.getItem("recents");
    if(rs){
      try {
        const parsed = JSON.parse(rs);
        setRecents(Array.isArray(parsed) ? parsed : []);
      } catch {
        setRecents([]);
      }
    }else{
      localStorage.setItem("recents", JSON.stringify([]));
    }

  },[])


  
  useEffect(()=>{
    if(!recentsLoaded.current){
      recentsLoaded.current = true;
      return;
    }
    saveRecentList();

    const keep = new Set(recents.map(r => r?.docId).filter(Boolean) as string[]);
    
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)!;

      // 只处理 marks:: 前缀的键，其他键（lang/recents/设置项）跳过
      if (k.endsWith("ctx")){
        const docId = k.slice(0, -3);
        if (!keep.has(docId)) {
        localStorage.removeItem(k); // 直接删当前键 k
      }
      }
      
    }
  },[recents, saveRecentList])



  const onOpenTab = useCallback(async () => {
    await openWithElectron();
  }, [openWithElectron]);

  const onSelectTab = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  useEffect(() => {
    setLangMap(language === "zh" ? lang_zh : language === "en" ? lang_en : lang_du);
    if(window.electronAPI?.sendValueToMain){
      window.electronAPI.sendValueToMain(language);
    }
  },[language])

  useEffect(()=>{
    const lang = localStorage.getItem("lang")||"zh";
    setLang(lang);
    setLangMap(lang === "zh" ? lang_zh : lang === "en" ? lang_en : lang_du);
  },[])

  useEffect(() => {
    const handleCopyHotkey = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyC") return;

      const text = window.getSelection()?.toString() ?? "";
      if (!text) return;

      e.preventDefault();

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
      } catch (err) {
        console.warn("[copy hotkey] write failed:", err);
      }
    };

    document.addEventListener("keydown", handleCopyHotkey, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleCopyHotkey, { capture: true });
    };
  }, []);

  const outletContext = useMemo<AppOutletCtx>(() => ({
    onOpenTab,
    savePdfCtx,
    openWithElectron,
    recents,
    openFromPath,
    langMap,
    deleteContext,
    documentStates,
    registerSaveAction,
    unregisterSaveAction,
    sendValueToMain: window.electronAPI?.sendValueToMain,
  }), [
    onOpenTab,
    savePdfCtx,
    openWithElectron,
    recents,
    openFromPath,
    langMap,
    deleteContext,
    documentStates,
    registerSaveAction,
    unregisterSaveAction,
  ]);

  return (
    <div className="h-screen min-w-0 overflow-hidden flex flex-col">

      <header className="min-h-10 shrink-0 backdrop-blur-md bg-blue-100/60 border-b border-blue-200/50 flex items-center gap-3 px-3 sm:px-6 justify-between shadow-sm">
        <TabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={onSelectTab}
          onClose={closeTab}
          onNew={onOpenTab}
        />
        <nav className="shrink-0 flex items-center gap-3 sm:gap-6 text-sm font-medium text-slate-700">
          <Link
            to="/"
            className="hover:text-blue-600 transition-colors"
            onClick={() => setActiveId(null)}
          >
            {langMap["homePage"] || "首页"}
          </Link>

          {/* <Link
            to="settings"
            className="hover:text-blue-600 transition-colors"
            onClick={() => setActiveId(null)}
          >
            设置
          </Link> */}
          <div tabIndex={0} className="grid h-8 w-8 place-items-center rounded-md hover:bg-blue-200/40">
            <LanguagesIcon className="h-5 w-5 hover:text-blue-600 transition-colors" onClick={() => setLangMenu((visible) => !visible)}/>
          </div>
          
          {showLangMenu && <div>
            <select name="language" id="language" className="bg-transparent outline-none"
              onChange={e=>{
                const lang = e.target.value;
                if(lang) {
                  localStorage.setItem("lang",lang);
                  setLang(lang);
                }
                }}
                  value={language}
              >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="du">Nederlands</option>
            </select>
          </div>}
        </nav>
      </header>

      {/* Main body */}
      <div className="flex flex-1 min-h-0 min-w-0">
        <main className="flex-1 overflow-hidden min-h-0 min-w-0">
          <Outlet context={outletContext} key={location.pathname} />
        </main>
      </div>
    </div>
  );
}

