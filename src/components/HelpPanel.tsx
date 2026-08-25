import { useEffect, useRef, useState } from "react";
import { X, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import { exampleMapTemplate } from "@/content/help/exampleMap";
import type { Item, Connection, Map } from "@/types";

import helpWhatIs from "@/content/help/01-what-is-mymind.md?raw";
import helpCardTypes from "@/content/help/02-card-types.md?raw";
import helpConnections from "@/content/help/03-connections.md?raw";

const SECTIONS = [
  { id: "what-is-mymind", title: "What is MyMind?", content: helpWhatIs },
  { id: "card-types", title: "Card types", content: helpCardTypes },
  { id: "connections", title: "Connections", content: helpConnections },
];

const LAST_SECTION_KEY = "mymind.help.lastSection";

type HelpPanelProps = {
  onClose: () => void;
};

export default function HelpPanel({ onClose }: HelpPanelProps) {
  const [activeSection, setActiveSection] = useState(() => {
    try {
      return localStorage.getItem(LAST_SECTION_KEY) ?? SECTIONS[0].id;
    } catch {
      return SECTIONS[0].id;
    }
  });
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const openRef = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, duration = 3000) => {
    setToast(message);
    window.setTimeout(() => setToast(null), duration);
  };

  useEffect(() => {
    openRef.current = true;
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "help", open: true } }));
    return () => {
      openRef.current = false;
      window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "help", open: false } }));
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SECTION_KEY, activeSection);
    } catch {
      // ignore
    }
  }, [activeSection]);

  useEffect(() => {
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.code === "Escape" && openRef.current) {
        event.stopImmediatePropagation();
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escapeHandler, true);
    return () => window.removeEventListener("keydown", escapeHandler, true);
  }, [onClose]);

  const selectSection = (id: string) => {
    setActiveSection(id);
    const el = contentRef.current?.querySelector(`[data-section="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleCreateExample = async () => {
    setCreating(true);
    try {
      const store = useBoardStore.getState();
      const existingNames = new Set(store.maps.filter((m) => m.folderId === null).map((m) => m.name));
      let name = exampleMapTemplate.mapName;
      if (existingNames.has(name)) {
        let n = 2;
        while (existingNames.has(`${exampleMapTemplate.mapName} ${n}`)) n++;
        name = `${exampleMapTemplate.mapName} ${n}`;
      }

      const mapId = crypto.randomUUID();
      const now = new Date().toISOString();

      const { error: mapError } = await supabase.from("maps").insert({
        id: mapId,
        name,
        created_at: now,
        updated_at: now,
        folder_id: null,
        is_favorite: false,
      });
      if (mapError) {
        showToast("Could not create the example map");
        return;
      }

      const itemIds = exampleMapTemplate.items.map(() => crypto.randomUUID());
      const itemRows = exampleMapTemplate.items.map((tmpl, i) => ({
        id: itemIds[i],
        map_id: mapId,
        title: tmpl.title,
        tags: tmpl.tags,
        created_at: now,
        due_date: tmpl.dueDate,
        description: tmpl.description,
        pos_x: tmpl.posX,
        pos_y: tmpl.posY,
        color: tmpl.color,
        width: tmpl.width,
        height: tmpl.height,
        scale: tmpl.scale,
        status: tmpl.status,
        card_type: tmpl.cardType,
      }));

      const { error: itemsError } = await supabase.from("items").insert(itemRows);
      if (itemsError) {
        await supabase.from("maps").delete().eq("id", mapId);
        showToast("Could not create the example map");
        return;
      }

      const connectionRows = exampleMapTemplate.connections.map((c) => ({
        id: crypto.randomUUID(),
        map_id: mapId,
        source_id: itemIds[c.sourceIndex],
        target_id: itemIds[c.targetIndex],
        comment: c.comment,
        label_dx: 60,
        label_dy: -40,
      }));

      if (connectionRows.length > 0) {
        const { error: connsError } = await supabase.from("connections").insert(connectionRows);
        if (connsError) {
          await supabase.from("items").delete().eq("map_id", mapId);
          await supabase.from("maps").delete().eq("id", mapId);
          showToast("Could not create the example map");
          return;
        }
      }

      const newMap: Map = {
        id: mapId,
        name,
        createdAt: now,
        updatedAt: now,
        folderId: null,
        isFavorite: false,
      };
      store.addMap(newMap);

      const items: Item[] = exampleMapTemplate.items.map((tmpl, i) => ({
        id: itemIds[i],
        title: tmpl.title,
        tags: tmpl.tags,
        createdAt: now,
        dueDate: tmpl.dueDate,
        description: tmpl.description,
        posX: tmpl.posX,
        posY: tmpl.posY,
        color: tmpl.color,
        width: tmpl.width,
        height: tmpl.height,
        scale: tmpl.scale,
        status: tmpl.status,
        cardType: tmpl.cardType,
        mapId,
      }));
      const connections: Connection[] = exampleMapTemplate.connections.map((c, i) => ({
        id: connectionRows[i].id,
        sourceId: itemIds[c.sourceIndex],
        targetId: itemIds[c.targetIndex],
        comment: c.comment,
        labelDx: 60,
        labelDy: -40,
        mapId,
      }));

      store.loadBoard({ items, connections });
      store.setActiveMap(mapId, true);

      showToast("Example map created", 4000);
      onClose();
    } catch (err) {
      console.error("Example map creation failed", err);
      showToast("Could not create the example map");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <section
        className="flex max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h2 id="help-panel-title" className="text-lg font-bold tracking-tight text-slate-900">Help</h2>
          <button
            type="button"
            aria-label="Close help"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 flex-shrink-0 border-r border-slate-100 bg-slate-50/50 py-4">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => selectSection(section.id)}
                className={`block w-full px-4 py-2 text-left text-[13px] font-medium transition ${
                  activeSection === section.id
                    ? "bg-slate-200/60 text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
          <div ref={contentRef} className="md-render min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700">
            {SECTIONS.map((section, i) => (
              <div
                key={section.id}
                data-section={section.id}
                className={i > 0 ? "mt-8" : ""}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {section.content}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 border-t border-slate-100 p-4">
          <button
            onClick={handleCreateExample}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={15} />
            {creating ? "Creating…" : "Create example map"}
          </button>
        </div>
      </section>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
