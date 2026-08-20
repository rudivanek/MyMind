import { useEffect, useRef, useState } from "react";

type Props = {
  screenX: number;
  screenY: number;
  onCommit: (comment: string) => void;
  onClose: () => void;
};

export default function ConnectionCommentInput({
  screenX,
  screenY,
  onCommit,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    const el = document.getElementById("connection-comment-input");
    el?.focus();
  }, []);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(draft.trim());
    onClose();
  };

  return (
    <div
      className="nodrag nopan fixed z-[1000]"
      style={{
        left: screenX,
        top: screenY,
        transform: "translate(-50%, -50%)",
      }}
    >
      <input
        id="connection-comment-input"
        value={draft}
        placeholder="Add a comment…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        onBlur={() => finish(true)}
        className="w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg outline-none focus:border-indigo-400"
      />
    </div>
  );
}
