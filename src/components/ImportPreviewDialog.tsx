import { useMemo, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { parseMarkdownImport, type ImportSection } from "@/lib/importMarkdown";

type Props = {
  fileName: string;
  fileSize: number;
  fileText: string;
  onImport: (sections: ImportSection[]) => void;
  onCancel: () => void;
};

export default function ImportPreviewDialog({ fileName, fileSize, fileText, onImport, onCancel }: Props) {
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(1);

  const result = useMemo(() => parseMarkdownImport(fileText, fileName, level), [fileText, fileName, level]);

  const availableLevels = useMemo(() => {
    const levels: (1 | 2 | 3 | 4)[] = [];
    for (const lvl of [1, 2, 3, 4] as const) {
      if (result.headingCounts[lvl] > 0) levels.push(lvl);
    }
    return levels;
  }, [result.headingCounts]);

  const sections = result.sections;
  const cardCount = sections.length;
  const sizeKb = (fileSize / 1024).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="flex max-h-[80vh] w-[480px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900">Import markdown</h3>
        </div>

        <div className="mb-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{fileName}</span> · {sizeKb} KB
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Split by heading level</label>
          <div className="flex gap-1.5">
            {availableLevels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  level === lvl
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                H{lvl}
                <span className="ml-1 text-[10px] opacity-60">({result.headingCounts[lvl]})</span>
              </button>
            ))}
            {availableLevels.length === 0 && (
              <span className="text-xs text-slate-400">No headings found — one card will be created.</span>
            )}
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">
            {cardCount} card{cardCount === 1 ? "" : "s"}
          </span>
        </div>

        {cardCount > 60 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <AlertTriangle size={14} />
            This will create {cardCount} cards.
          </div>
        )}

        <div className="mb-5 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
          {sections.length === 0 ? (
            <p className="text-xs text-slate-400">No cards will be created.</p>
          ) : (
            <ol className="space-y-1">
              {sections.map((section, i) => (
                <li key={i} className="truncate text-xs text-slate-600">
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  {section.title || <span className="italic text-slate-400">(untitled)</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onImport(sections)}
            disabled={cardCount === 0}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
