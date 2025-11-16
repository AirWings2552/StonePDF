import React, { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import type { TabItem } from "./components/TabBar";
import TabBar from "./components/TabBar";
import { sha256Hex } from "./components/PdfViewer";
import { create } from "zustand";
import { LanguagesIcon } from "lucide-react"
import lang_zh from "./assets/localization/chinese.json"
import lang_en from "./assets/localization/english.json"
import lang_du from "./assets/localization/dutch.json"




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
      openImg(): Promise<any>;
      getPathAfterDownload(url: string): Promise<string>;
      openExternal: (url: string) => void;
      askUser:() => number;
      onAppCloseCheck?: (cb: () => void) => void; // 新增
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



export type AppOutletCtx = {
  onOpenTab: (e: React.ChangeEvent<HTMLInputElement>) => void;
  savePdfCtx: (docId: string, pdfPageNum: number) => void;
  openWithElectron: () => Promise<void>;
  recents: { name: string; sizeKB: number; date: string; path?: string ;docId:string}[];
  openFromPath: (filePath: string) => Promise<void>;
  langMap: Record<string, string>;
  deleteContext:(docId:string,path:string)=>void;
  documentStates: React.RefObject<Record<string, boolean>>;
  registerSaveAction:(id: string, action: () => Promise<void>) => void;
  unregisterSaveAction:() => void;
  sendValueToMain?: (value: string) => number;
};

// Record tabId -> original file path (for overwriting and saving)
const electronPathMap = new Map<string, string>();

export default function App() {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recents, setRecents] = useState<{ name: string; sizeKB: number; date: string; path?: string ,docId:string}[]>(
    []
  );
  const navigate = useNavigate();
  const restored = useRef(false);
  const [showLangMenu,setLangMenu] = useState(false);
  const [language,setLang] = useState("zh");
  const langRef = useRef("zh");
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

  const savePdfCtx = (docId: string, pdfpageNumber: number) => {
    localStorage.setItem(docId + "ctx", pdfpageNumber.toString());
  };


  // This function is called when the local file is removed manually.
  // It will remove the corresponding context stored in localStorage.
  // This function is passed down to PdfViewer via Outlet context.
  const deleteContext = (docId:string, path:string) => {
    localStorage.removeItem(docId + "ctx"); // remove page number record in localStorage
    setRecents((r) => r.filter((item) => item.path !== path)); // remove from recents list
  }

  const tabsRef = useRef<TabItem[]>([]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!window.electronAPI?.onAppCloseCheck) return;

    // 监听主进程的“检查关闭”信号
    const _removeListener = window.electronAPI.onAppCloseCheck(async () => {
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
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    const off = window.electronAPI.onOpenPath?.(async (p: string) => {
      console.log("[renderer] on open-path:", p);
      try {
        await openFromPath(p); // Internally, we need to do deduplication of "switch if already turned on"
      } catch (e) {
        console.error("openFromPath failed:", e);
      }
    });

    // Notify the main process only once: I am ready to receive the path
    if (!restored.current) {
      window.electronAPI.notifyReady?.();
      restored.current = true;
    }

    return () => off && off();
  }, [openFromPath]);


  useEffect(() => {
    if (activeId) navigate(`/viewer/${activeId}`);
    else navigate(`/`); // back to MainScreen
  }, [activeId, navigate]);

  const closeTab = async (id: string) => {
    const idx = tabs.findIndex((x) => x.id === id);
    const newTabs = tabs.filter((x) => x.id !== id);

    if(documentStates.current[id]){
      let choice = await window.electronAPI!.askUser();
      if(choice == 0){
        const saveFn = saveActions.current[id]; 
        if (saveFn) {
          await saveFn();
        }
      }
      else if(choice == 1){

      }
      else{
        return;
      }
    }
    electronPathMap.delete(id); // Release path mapping
    setTabs(newTabs);

    if (activeId === id) {
      const fallback = (idx > 0 ? newTabs[idx - 1] : undefined) ?? newTabs[idx] ?? null;
      setActiveId(fallback?.id ?? null);
    }
    
    
    localStorage.removeItem("marks::" + id);
  };

  async function openWithElectron() {
    if (!window.electronAPI) {
      alert("当前不是 Electron 环境，无法直接打开本地文件。");
      return;
    }
    
    const filePath = await window.electronAPI.openPdf();
    if (!filePath) return;
    const existedId = findTabIdByPath(filePath);
  
    if (existedId) {
      setActiveId(existedId);
      return;
    }
    
    const data = await window.electronAPI.readPdf(filePath);

    // Construct a File, using existing add(file) logic (for generating an id and passing it to the viewer)
    const name = filePath.split(/[\\/]/).pop() || "document.pdf";
    const bytes = Uint8Array.from(data);
    const file = new File([new Blob([bytes], { type: "application/pdf" })], name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    const id = await add(file,filePath); // Use file content hash as unique id
    const title = file.name;
    
    setTabs((t) => [...t, { id, title }]);
    setActiveId(id);

    // Recent list
    if (recents.find((r) => r.path === filePath)) {
        return;
    }
    setRecents((r) => {
    const newItem = {
      name: file.name,
      sizeKB: Math.max(1, Math.round(data.byteLength / 1024)),
      date: new Date().toISOString().slice(0, 10),
      path: filePath,
      docId: id,
    };


    const filtered = r.filter(item => item.path !== newItem.path);


    const updated = [newItem, ...filtered];


    return updated.slice(0, MAX_RECENTS);
  });;
    


    electronPathMap.set(id, filePath);
  }
  function saveRecentList(){
    if(recents.length>=0)
      localStorage.setItem("recents",JSON.stringify(recents))
    else
      return;
  }
  useEffect(()=>{
    const rs = localStorage.getItem("recents");
    if(rs){
      setRecents(JSON.parse(rs));
    }else{
      localStorage.setItem("recents",[].toString());
    }

  },[])


  
  useEffect(()=>{
    if(!recentsLoaded.current){
      recentsLoaded.current = true;
      return;
    }
    saveRecentList();

    const keep = new Set(recents.map(r => r?.docId).filter(Boolean) as string[]);
    console.log("KEEP",keep);
    
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)!;

      // 只处理 marks:: 前缀的键，其他键（lang/recents/设置项）跳过
      if (k.endsWith("ctx")){
        let docId = k.slice(0, -3);
        if (!keep.has(docId)) {
        localStorage.removeItem(k); // 直接删当前键 k
      }
      }
      
    }
  },[recents])



  async function onOpenTab(_e: React.MouseEvent<HTMLButtonElement>) {
    await openWithElectron();
  }

  function onSelectTab(id: string) {
    setActiveId(id);
  }

  function findTabIdByPath(p: string): string | null {
    const target = p.toLowerCase();
    for (const [id, openedPath] of electronPathMap.entries()) {
      if (openedPath.toLowerCase() === target) return id;
    }
  return null;
}

async function openFromPath(filePath: string) {
  if (!filePath) return;
  if (!window.electronAPI) {
    alert("当前不是 Electron 环境，无法直接读取本地路径。");
    return;
  }

  // Already open → Switch directly
  const existedId = findTabIdByPath(filePath);
  
  if (existedId) {
    setActiveId(existedId);
    return;
  }


  const data = await window.electronAPI.readPdf(filePath);

  
  if (!data) {
    window.electronAPI.showAlert?.({type: "error", title: "Error!", message: langMap["fileReadError"]||"文件读取失败，请确认文件存在且为 PDF 格式。"});
    return;
  }
  const name = filePath.split(/[\\/]/).pop() || "document.pdf";
  const bytes = Uint8Array.from(data);
  const file = new File([new Blob([bytes], { type: "application/pdf" })], name, {
    type: "application/pdf",
    lastModified: Date.now(),
  });

  // add(file) will generate a unique id
  const id = await add(file, filePath); 
  const title = file.name;


  setTabs((t) => [...t, { id, title }]);
  setActiveId(id);


  setRecents((r) => {
    const lower = filePath.toLowerCase();
    const filtered = r.filter((i) => i.path?.toLowerCase() !== lower);
    return [
      {
        name: file.name,
        sizeKB: Math.max(1, Math.round((data as Uint8Array).byteLength / 1024)),
        date: new Date().toISOString().slice(0, 10),
        path: filePath,
        docId: id,
      },
      ...filtered,
    ];
  });

  // Record mapping relationship (for "open judgment" and saving)
  electronPathMap.set(id, filePath);
}

  useEffect(() => {
    setLangMap(language === "zh" ? lang_zh : language === "en" ? lang_en : lang_du);
    if(window.electronAPI?.sendValueToMain){
      window.electronAPI.sendValueToMain(language);
    }
  },[language])

  useEffect(()=>{
    const lang = localStorage.getItem("lang")||"zh";
    setLang(lang);
    langRef.current = lang;
    setLangMap(lang === "zh" ? lang_zh : lang === "en" ? lang_en : lang_du);
  },[])

  return (
    <div className="h-screen flex flex-col">

      <header className="h-10 backdrop-blur-md bg-blue-100/60 border-b border-blue-200/50 flex items-center px-6 justify-between shadow-sm">
        <TabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={onSelectTab}
          onClose={closeTab}
          onNew={onOpenTab}
        />
        <nav className="flex space-x-6 text-sm font-medium text-slate-700">
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
          <div tabIndex={0}>
            <LanguagesIcon className="hover:text-blue-600 transition-colors" onClick={() => {setLangMenu(!showLangMenu)} }/>
          </div>
          
          {showLangMenu && <div>
            <select name="language" id="language" className="bg-transparent outline-none"
              onChange={e=>{
                const lang = e.target.value;
                if(lang)
                  localStorage.setItem("lang",lang);
                  setLang(lang);
                  langRef.current = lang;
                }}
                  defaultValue={localStorage.getItem("lang")||"zh"}
              >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="du">Nederlands</option>
            </select>
          </div>}
        </nav>
      </header>

      {/* Main body */}
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 overflow-auto min-h-0">
          <Outlet context={{ onOpenTab, savePdfCtx,openWithElectron ,recents,openFromPath,langMap,deleteContext,documentStates,registerSaveAction, unregisterSaveAction}} key={location.pathname} />
        </main>
      </div>
    </div>
  );
}

/* ---------------- Zustand ---------------- */


type Doc = { id: string; file: File; path?: string };

type DocStore = {
  docs: Record<string, Doc>;
  add: (file: File, path?: string) => Promise<string>;
};

export const useDocStore = create<DocStore>((set) => ({
  docs: {},
  add: async (file, path) => {
    const buf = await file.arrayBuffer();
    const id = await sha256Hex(buf);
    set((s) => ({ docs: { ...s.docs, [id]: { id, file, path } } }));
    return id;
  },
}));

document.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyC') return;

    const text = window.getSelection()?.toString() ?? '';
    if (!text) return;

    e.preventDefault();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if ((window as any).electron?.clipboardWriteText) {

        (window as any).electron.clipboardWriteText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
    } catch (err) {
      console.warn('[copy hotkey] write failed:', err);
    }
  }, { capture: true });