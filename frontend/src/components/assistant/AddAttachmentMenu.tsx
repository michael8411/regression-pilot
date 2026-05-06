import { useEffect, useRef, useState } from "react";
import {
  Folder,
  ListChecks,
  Plus,
  Ticket,
  type IconComponent,
} from "@/lib/icons";

type AttachKind = "ticket" | "test_case" | "session_ref";

interface Props {
  onPick: (kind: AttachKind) => void;
}

export function AddAttachmentMenu({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-ink-secondary hover:bg-surface-overlay hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus size={11} /> Add
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-subtle bg-surface-elevated shadow-lg z-30"
        >
          <MenuItem
            icon={Ticket}
            label="Add ticket"
            onClick={() => {
              onPick("ticket");
              setOpen(false);
            }}
          />
          <MenuItem
            icon={ListChecks}
            label="Add test cases"
            onClick={() => {
              onPick("test_case");
              setOpen(false);
            }}
          />
          <MenuItem
            icon={Folder}
            label="Attach session"
            onClick={() => {
              onPick("session_ref");
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink-secondary hover:bg-surface-overlay"
    >
      <Icon size={12} className="text-ink-muted" />
      {label}
    </button>
  );
}
