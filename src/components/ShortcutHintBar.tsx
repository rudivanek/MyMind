import { useEffect, useRef, useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { getShortcutSections } from "@/lib/keyboardBindings";
import HelpPanel from "@/components/HelpPanel";

type ModalStateEvent = CustomEvent<{ source: string; open: boolean }>;

const sections = getShortcutSections();

export default function ShortcutHintBar() {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openRef = useRef(false);
  const modalSourcesRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    openRef.current = open;
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "shortcuts", open } }));
  }, [open]);

  useEffect(() => {
    const handleModalState = (event: Event) => {
      const { source, open: isOpen } = (event as ModalStateEvent).detail;
      if (source === "shortcuts") return;
      modalSourcesRef.current = { ...modalSourcesRef.current, [source]: isOpen };
    };
    window.addEventListener("mymind:modal-state", handleModalState);
    return () => window.removeEventListener("mymind:modal-state", handleModalState);
  }, []);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (event.code !== "Slash") return;
      if (!event.shiftKey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (Object.values(modalSourcesRef.current).some(Boolean)) return;
      event.preventDefault();
      setOpen(true);
    };
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.code === "Escape" && openRef.current) {
        event.stopImmediatePropagation();
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("keydown", escapeHandler, true);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("keydown", escapeHandler, true);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        className="nodrag nopan absolute bottom-5 right-[200px] z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-lg transition hover:bg-white"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <section className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="shortcut-modal-title">
            <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <h2 id="shortcut-modal-title" className="text-lg font-bold tracking-tight text-slate-900">Keyboard shortcuts</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => { setOpen(false); setHelpOpen(true); }}
                >
                  <HelpCircle size={14} /> Learn the concepts
                </button>
                <button type="button" aria-label="Close shortcuts" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setOpen(false)}><X size={16} /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {sections.map((section) => (
                <div key={section.title}>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{section.title}</h3>
                  <div className="space-y-1.5">
                    {section.entries.map((entry) => (
                      <div key={entry.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span>{entry.label}</span>
                        <kbd className="rounded border border-slate-200 bg-white px-2 py-1 font-medium text-slate-500">{entry.key}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </>
  );
}
