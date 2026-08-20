import { useReactFlow } from "@xyflow/react";
import { Maximize } from "lucide-react";

export default function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      onClick={() => fitView({ maxZoom: 1, padding: 0.2 })}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg transition hover:bg-white"
    >
      <Maximize size={15} /> Fit to view
    </button>
  );
}
