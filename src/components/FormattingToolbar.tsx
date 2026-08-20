import { useMemo, type RefObject } from "react";
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, Code, Link,
  List, ListOrdered, ListChecks, Quote,
  type LucideIcon,
} from "lucide-react";
import {
  toggleBold, toggleItalic, toggleStrikethrough, toggleCode, toggleLink,
  toggleHeading, toggleOrderedList, toggleBulletList, toggleBlockquote, toggleTaskItem,
  isInlineActive, isHeadingActive, isBulletListActive, isOrderedListActive,
  isTaskItemActive, isBlockquoteActive, isLinkActive,
  type EditState,
} from "@/lib/markdownEditing";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

type ToolbarButtonProps = {
  icon: LucideIcon;
  title: string;
  active?: boolean;
  onMouseDown: () => void;
};

function ToolbarButton({ icon: Icon, title, active, onMouseDown }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? "bg-slate-200 text-slate-900" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <Icon size={15} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" />;
}

type FormattingToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  selectionTick: number;
  onEdit: (fn: (state: EditState) => EditState) => void;
};

export default function FormattingToolbar({ textareaRef, value, selectionTick, onEdit }: FormattingToolbarProps) {
  const active = useMemo(() => {
    void selectionTick;
    const ta = textareaRef.current;
    const selStart = ta?.selectionStart ?? 0;
    const selEnd = ta?.selectionEnd ?? 0;
    return {
      bold: isInlineActive(value, selStart, selEnd, "**"),
      italic: isInlineActive(value, selStart, selEnd, "*"),
      strikethrough: isInlineActive(value, selStart, selEnd, "~~"),
      code: isInlineActive(value, selStart, selEnd, "`"),
      link: isLinkActive(value, selStart, selEnd),
      h1: isHeadingActive(value, selEnd, 1),
      h2: isHeadingActive(value, selEnd, 2),
      h3: isHeadingActive(value, selEnd, 3),
      bullet: isBulletListActive(value, selEnd),
      ordered: isOrderedListActive(value, selEnd),
      task: isTaskItemActive(value, selEnd),
      blockquote: isBlockquoteActive(value, selEnd),
    };
  }, [value, selectionTick, textareaRef]);

  return (
    <div className="flex items-center gap-0.5 border-b border-slate-200 pb-2 mb-2">
      <ToolbarButton icon={Heading1} title={`Heading 1 (${mod}+1)`} active={active.h1} onMouseDown={() => onEdit((s) => toggleHeading(s, 1))} />
      <ToolbarButton icon={Heading2} title={`Heading 2 (${mod}+2)`} active={active.h2} onMouseDown={() => onEdit((s) => toggleHeading(s, 2))} />
      <ToolbarButton icon={Heading3} title={`Heading 3 (${mod}+3)`} active={active.h3} onMouseDown={() => onEdit((s) => toggleHeading(s, 3))} />
      <Divider />
      <ToolbarButton icon={Bold} title={`Bold (${mod}+B)`} active={active.bold} onMouseDown={() => onEdit(toggleBold)} />
      <ToolbarButton icon={Italic} title={`Italic (${mod}+I)`} active={active.italic} onMouseDown={() => onEdit(toggleItalic)} />
      <ToolbarButton icon={Strikethrough} title={`Strikethrough (${mod}+Shift+X)`} active={active.strikethrough} onMouseDown={() => onEdit(toggleStrikethrough)} />
      <ToolbarButton icon={Code} title={`Inline code (${mod}+E)`} active={active.code} onMouseDown={() => onEdit(toggleCode)} />
      <ToolbarButton icon={Link} title={`Link (${mod}+K)`} active={active.link} onMouseDown={() => onEdit(toggleLink)} />
      <Divider />
      <ToolbarButton icon={List} title={`Bullet list (${mod}+Shift+8)`} active={active.bullet} onMouseDown={() => onEdit(toggleBulletList)} />
      <ToolbarButton icon={ListOrdered} title={`Numbered list (${mod}+Shift+7)`} active={active.ordered} onMouseDown={() => onEdit(toggleOrderedList)} />
      <ToolbarButton icon={ListChecks} title={`Checklist (${mod}+Shift+Enter)`} active={active.task} onMouseDown={() => onEdit(toggleTaskItem)} />
      <ToolbarButton icon={Quote} title={`Blockquote (${mod}+Shift+9)`} active={active.blockquote} onMouseDown={() => onEdit(toggleBlockquote)} />
    </div>
  );
}
