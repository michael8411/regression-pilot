import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Play,
  Trash2,
} from "@/lib/icons";
import { Badge, Button, Spinner } from "@/components/ui";
import { useCycles } from "./CyclesProvider";
import { useCycleRun } from "./hooks/useCycleRun";
import type { CycleSummary } from "@/types/cycles";

interface Props {
  cycle: CycleSummary;
  onEdit: (c: CycleSummary) => void;
  onShowHistory: (c: CycleSummary) => void;
}

export function CycleCard({ cycle, onEdit, onShowHistory }: Props) {
  const { togglePin, setArchived, remove, duplicate } = useCycles();
  const { run, busy } = useCycleRun();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li
      className={clsx(
        "rounded-lg border border-subtle bg-surface-elevated p-3",
        cycle.archived && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {cycle.pinned && (
              <Pin size={11} className="text-accent-text" />
            )}
            <h3 className="text-[13px] font-semibold text-ink truncate">
              {cycle.name}
            </h3>
            {cycle.archived && (
              <Badge tone="neutral" size="sm">
                archived
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
            <span className="font-mono">{cycle.projectKey}</span>
            {cycle.versionHint && <span>· {cycle.versionHint}</span>}
            <span>· {cycle.ticketCount} tickets</span>
            {cycle.themeCount > 0 && <span>· {cycle.themeCount} themes</span>}
            {cycle.runCount > 0 && (
              <span>
                · run {cycle.runCount}× ·{" "}
                {cycle.lastRunAt
                  ? relative(cycle.lastRunAt)
                  : "never"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void run(cycle.id, cycle.name)}
            disabled={busy}
            leading={busy ? <Spinner size={11} /> : <Play size={11} />}
          >
            Run
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(cycle)}
            leading={<Pencil size={12} />}
          >
            Edit
          </Button>
          <div ref={menuRef} className="relative">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More actions"
            >
              <MoreHorizontal size={14} />
            </Button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-subtle bg-surface-elevated shadow-lg z-30"
              >
                <MenuItem
                  icon={cycle.pinned ? PinOff : Pin}
                  label={cycle.pinned ? "Unpin" : "Pin"}
                  onClick={async () => {
                    setMenuOpen(false);
                    await togglePin(cycle.id, !cycle.pinned);
                  }}
                />
                <MenuItem
                  icon={Copy}
                  label="Duplicate"
                  onClick={async () => {
                    setMenuOpen(false);
                    await duplicate(cycle.id);
                  }}
                />
                <MenuItem
                  icon={History}
                  label="History…"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowHistory(cycle);
                  }}
                />
                <MenuItem
                  icon={cycle.archived ? Pin : History}
                  label={cycle.archived ? "Unarchive" : "Archive"}
                  onClick={async () => {
                    setMenuOpen(false);
                    await setArchived(cycle.id, !cycle.archived);
                  }}
                />
                <MenuItem
                  icon={Trash2}
                  label="Delete"
                  tone="danger"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (confirm(`Delete cycle "${cycle.name}"?`)) {
                      await remove(cycle.id);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: any;
  label: string;
  onClick: () => void | Promise<void>;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-2 text-[12px]",
        tone === "danger"
          ? "text-err hover:bg-err/10"
          : "text-ink-secondary hover:bg-surface-overlay hover:text-ink",
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
