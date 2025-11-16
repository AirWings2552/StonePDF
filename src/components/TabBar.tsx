export type TabItem = {
  id: string;
  title: string;  
  dirty?: boolean;
};

export default function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: TabItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew?: (e:React.MouseEvent<HTMLButtonElement>) => Promise<void>;
}) {
  return (
    <div className="h-8 shrink-0 flex items-center gap-1 px-1 border-b border-blue-200/50 bg-transparent">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
        {tabs.map(tab => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`group flex items-center gap-2 h-8 max-w-[240px] pl-3 pr-1 rounded-xl border transition-colors
              ${active
                ? "bg-sky-100 hover:bg-sky-200 border-sky-300 text-sky-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-none"
              }`}
            >
              <button
                onClick={() => onSelect(tab.id)}
                className="truncate text-sm"
                title={tab.title}
              >
                {tab.title}{tab.dirty ? "*" : ""}
              </button>
              <button
                onClick={() => onClose(tab.id)}
                className="ml-1 h-6 w-6 rounded-lg text-slate-500 hover:bg-slate-800/10 hover:text-slate-700"
                title="关闭"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {onNew && (
        
        <button onClick={onNew} className="h-5 flex items-center gap-2 px-1 py-1.5 rounded-lg border border-blue-300/60 bg-white/70 hover:bg-white/90 cursor-pointer">
          +
        </button>
        
      )}
    </div>
  );
}
