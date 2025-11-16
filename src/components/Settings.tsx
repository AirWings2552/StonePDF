
export default function Settings() {
  const card = "rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md shadow";

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#dff0ff] via-[#eaf3ff] to-[#c5e2ff] text-[#0f2b5b]">

      <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 border-b border-blue-200/50 bg-blue-100/60 backdrop-blur-md">
        <h1 className="text-base font-semibold tracking-wide">⚙️ 设置 Settings</h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        <section className={`${card} p-5`}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide opacity-80">语言 Language</h2>
          <div className="rounded-lg border border-dashed border-blue-300/50 bg-white/40 h-10 flex items-center justify-center text-sm text-slate-500">
            （选择框，待实现）
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide opacity-80">预览卡大小 Preview Card Size</h2>
          <div className="rounded-lg border border-dashed border-blue-300/50 bg-white/40 h-10 flex items-center justify-center text-sm text-slate-500">
            （滑块或输入框，待实现）
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide opacity-80">背景颜色 Background Color</h2>
          <div className="rounded-lg border border-dashed border-blue-300/50 bg-white/40 h-10 flex items-center justify-center text-sm text-slate-500">
            （颜色选择器，待实现）
          </div>
        </section>
      </main>
    </div>
  );
}
