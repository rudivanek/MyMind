import { useEffect, useRef, useState } from "react";
import { resolvePaste } from "@/lib/smartPaste";

type Props = {
  id: string;
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

export default function InlineTitleEditor({ id, value, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  // The input mounts during a double-click. The second mouseup of that double-click
  // arrives AFTER mount and collapses any selection to a caret, so selecting once in
  // an effect is not enough — we re-assert it until the click sequence has settled.
  const settledRef = useRef(false);

  const selectAll = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  };

  const commit = (val: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(val);
  };

  useEffect(() => {
    selectAll();
    // Next frame: after React has committed and the browser has painted.
    const raf = requestAnimationFrame(() => {
      if (!settledRef.current) selectAll();
    });
    // Next macrotask: after the trailing mouseup of the double-click has been handled.
    const timer = window.setTimeout(() => {
      if (!settledRef.current) selectAll();
      settledRef.current = true;
    }, 0);
    // Re-assert focus if it is stolen within the first 300ms — e.g. by a
    // setCenter() pan triggered after Tab creates a connected card.
    const reassertTimer = window.setTimeout(() => {
      const el = ref.current;
      if (el && document.activeElement !== el) {
        el.focus();
        el.setSelectionRange(0, el.value.length);
      }
    }, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.clearTimeout(reassertTimer);
    };
  }, []);

  return (
    <input
      ref={ref}
      data-inline-title={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onMouseUp={(e) => {
        // Swallow only the trailing mouseup of the double-click that opened this
        // editor. Later clicks are left alone so the user can position the caret.
        if (!settledRef.current) {
          e.preventDefault();
          selectAll();
        }
      }}
      onMouseDown={() => {
        // A deliberate click by the user ends the initial selection phase.
        if (settledRef.current) return;
      }}
      onKeyDown={(e) => {
        settledRef.current = true;
        // Only stop propagation for keys this component consumes. Alt combos
        // (colour, status, scale, etc.) must bubble to the window handler.
        if (e.key === "Enter" || e.key === "Escape") {
          e.stopPropagation();
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") onCancel();
        }
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          commit(draft);
          window.dispatchEvent(new CustomEvent("mymind:editor-tab", {
            detail: { shift: e.shiftKey }
          }));
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          commit(draft);
          window.dispatchEvent(new CustomEvent("mymind:edit-description"));
        }
      }}
      onPaste={(e) => {
        const markdown = resolvePaste(e.clipboardData, Boolean((e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey), "inline");
        e.preventDefault();
        const el = ref.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const next = draft.slice(0, start) + markdown + draft.slice(end);
        setDraft(next);
        requestAnimationFrame(() => {
          if (ref.current) {
            const caret = start + markdown.length;
            ref.current.selectionStart = caret;
            ref.current.selectionEnd = caret;
          }
        });
      }}
      onBlur={() => commit(draft)}
      className="nodrag nopan w-full bg-transparent font-medium leading-tight text-gray-900 outline-none"
      style={{ fontSize: "calc(13px * var(--card-scale, 1))" }}
    />
  );
}
