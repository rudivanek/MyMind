import { useEffect, useState } from "react";

type PdfExportDialogProps = {
  defaultInclude: boolean;
  onExport: (include: boolean) => void;
  onCancel: () => void;
};

export default function PdfExportDialog({ defaultInclude, onExport, onCancel }: PdfExportDialogProps) {
  const [include, setInclude] = useState(defaultInclude);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold text-slate-900">Export PDF</h2>
        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setInclude(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          />
          <div>
            <span className="text-xs font-medium text-slate-700">Include card contents as text pages</span>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Adds every card&apos;s full text after the map image, so long cards aren&apos;t cut off.
            </p>
          </div>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onExport(include)}
            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
