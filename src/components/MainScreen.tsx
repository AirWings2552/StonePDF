import React, { useMemo, useState } from "react";
import { FolderOpen, FileText, Search, MoreHorizontal, RefreshCcw} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { type AppOutletCtx } from "../App";
import { PDFDocument } from "pdf-lib";

// Tip: This component assumes TailwindCSS is available.

export default function MainScreen() {
  const [query, setQuery] = useState("");
  const [_localrecents, setRecents] = useState<Array<{ name: string; sizeKB: number; date: string ;docId:string}>>([]);
  const { openWithElectron, recents,openFromPath,langMap,deleteContext} = useOutletContext<AppOutletCtx>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recents;
    return recents.filter((f) => f.name.toLowerCase().includes(q));
  }, [query, recents]);

  function onOpenClick() {
    openWithElectron();
    setRecents(recents)
  }

  async function reOpenFile(path: string | undefined) {
    if (!path) return;
    if (openFromPath) {
      console.log("[reOpenFile] 调用 openFromPath:", path);
      try{
        await openFromPath(path);
      }catch(e){
        let id = recents.find(r=>r.path===path)?.docId;
        console.log(id);
        
        if (id)
          deleteContext(id,path);
        console.error("Error in openFromPath:", e);
        window.electronAPI?.showAlert?.({type: "error", title: "Error!", message: langMap["fileReadError"]||"文件读取失败，请确认文件存在且为 PDF 格式。"});
      }
      
      
      return;
    }
  }

  async function imageToPdf() {
    if (!window.electronAPI)  return;
      const files = await window.electronAPI?.openImg();
      const pdfDoc = await PDFDocument.create();
      
      if (!files) return;
      for (const file of files) {
        const imgBytes = file.data;
        let img;
        console.log(file);
        
        try {
          if (file.type === "png") {
            img = await pdfDoc.embedPng(imgBytes);
          } else {
            img = await pdfDoc.embedJpg(imgBytes);
          }}catch (error) {
          console.error("Error embedding image:", error);
          continue; // Skip this image and proceed with the next
        }

        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }

      const pdfBytes = await pdfDoc.save();

      // Trigger browser download
      // create an ArrayBuffer-backed copy so Blob typing accepts it
      const uint8 = pdfBytes.slice(); // slice() copies into a new ArrayBuffer-backed Uint8Array
      const blob = new Blob([uint8], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;console.log(url);
      a.download = "merged.pdf";
      a.click();
      try {
        const path = await window.electronAPI.getPathAfterDownload(url);
        console.log("path after download:", path);
        openFromPath(path); // Open the newly generated PDF
      }
      catch (e) {
        console.error("Error getting path after download:", e);
      }
      URL.revokeObjectURL(url);
    }

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#dff0ff] via-[#eaf3ff] to-[#c5e2ff]">
      {/* Background orbs */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-72 w-72 rounded-full bg-blue-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-400/30 blur-3xl" />

      {/* App shell */}
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-10 lg:py-14">
        {/* Sidebar */}
        {/* <aside className="sticky top-8 h-fit w-64 rounded-2xl border border-white/40 bg-white/30 p-4 backdrop-blur-xl shadow-[0_10px_30px_-12px_rgba(30,64,175,0.25)]">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-md">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-900/70">StonePDF</p>
              <h1 className="-mt-0.5 text-lg font-semibold text-blue-950">Home</h1>
            </div>
          </div>

          <nav className="mt-2 space-y-1">
            <NavItem icon={Home} label="Home" active={active === "home"} onClick={() => setActive("home")} />
            <NavItem icon={FolderOpen} label="Documents" active={active === "docs"} onClick={() => setActive("docs")} />
            <NavItem icon={Star} label="Starred" active={active === "starred"} onClick={() => setActive("starred")} />
            <NavItem icon={Trash2} label="Trash" active={active === "trash"} onClick={() => setActive("trash")} />
          </nav>

          <div className="mt-6 rounded-xl border border-white/50 bg-white/40 p-3 backdrop-blur-xl">
            <p className="text-sm font-medium text-blue-950">Quick Tips</p>
            <p className="mt-1 text-xs leading-5 text-blue-900/70">
              许多功能正在开发中，目前主屏幕中只有打开文件功能有效
            </p>
          </div>
        </aside> */}

        {/* Main content */}
        <main className="flex-1">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-blue-950 md:text-3xl">StonePDF</h2>
            <div className="flex items-center gap-2">
              {/* <button className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/60 px-4 py-2 text-sm font-medium text-blue-950 shadow-md backdrop-blur-xl transition hover:bg-white/80">
                <Plus className="h-4 w-4" /> New PDF
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/60 px-4 py-2 text-sm font-medium text-blue-950 shadow-md backdrop-blur-xl transition hover:bg-white/80" onClick={onOpenClick}>
                <UploadCloud className="h-4 w-4" /> Import
              </button> */}
              {/* <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChange} /> */}
            </div>
          </div>

          {/* Search */}
          <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-4 py-2 backdrop-blur-xl shadow-[0_10px_30px_-12px_rgba(30,64,175,0.25)]">
            <Search className="h-4 w-4 text-blue-900/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={langMap["searchRecents"] || "Search recents..."} 
              className="h-10 w-full bg-transparent text-blue-950 placeholder:text-blue-900/60 focus:outline-none"
            />
          </div>

          {/* Glass panel */}
          <section className="rounded-3xl border border-white/60 bg-white/50 p-5 backdrop-blur-2xl shadow-[0_20px_60px_-20px_rgba(30,64,175,0.35)]">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 overflow-y-auto  max-h-[600px]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-blue-950">{langMap["recents"] || "Recents"}</h3>
                  {/* <button className="rounded-lg px-2 py-1 text-sm text-blue-900/70 transition hover:bg-blue-50/70">View all</button> */}
                </div>
                <ul className="divide-y divide-white/50 rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl">
                  {filtered.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-3" onClick={()=>reOpenFile(f.path)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-blue-950">{f.name}</p>
                          <p className="truncate text-xs text-blue-900/70">{f.date} · {f.sizeKB} KB</p>
                        </div>
                      </div>
                      <button className="rounded-xl border border-white/60 bg-white/60 p-2 text-blue-900/80 backdrop-blur-xl transition hover:bg-white">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Quick actions */}
              <div className="space-y-3">
                <ActionCard icon={FolderOpen} title={langMap["openFile"] || "Open"} desc={langMap["browseLocalFiles"] || "Browse local files"} onClick={onOpenClick} />
                <ActionCard icon={RefreshCcw} title={langMap["convert"]} desc={langMap["imageToPdf"]} onClick={imageToPdf} />
                {/* <ActionCard icon={PencilLine} title="Edit" desc="Annotate & sign" onClick={() => {}} /> */}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

// function NavItem({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<any>; label: string; active?: boolean; onClick?: () => void }) {
//   return (
//     <button
//       onClick={onClick}
//       className={[
//         "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
//         active
//           ? "bg-white text-blue-950 shadow-sm"
//           : "text-blue-900/80 hover:bg-white/60 hover:text-blue-950",
//       ].join(" ")}
//       aria-current={active ? "page" : undefined}
//     >
//       <Icon className="h-4 w-4" />
//       <span>{label}</span>
//     </button>
//   );
// }

function ActionCard({ icon: Icon, title, desc, onClick }: { icon: React.ComponentType<any>; title: string; desc: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group box-border flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 text-left backdrop-blur-xl transition hover:bg-white hover:shadow-md"
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium text-blue-950">{title}</p>
        <p className="text-xs text-blue-900/70">{desc}</p>
      </div>
    </button>
  );
}
