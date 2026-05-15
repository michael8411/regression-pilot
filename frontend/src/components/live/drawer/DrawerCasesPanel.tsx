/**
 * Phase 06 — drawer Test Cases panel backed by encrypted SQLite drafts.
 *
 * Reads `/live/generated-cases?ticket_key=...` via `useLiveGeneratedCases`.
 * Each draft renders as a collapsible card group, with a delete affordance
 * per draft. Empty state still falls back to a "Open AI tab" CTA.
 */

import { useState } from "react";
import { clsx } from "clsx";
import {
  ChevronDown,
  ChevronRight,
  ListChecks,
  Sparkles,
  Trash2,
} from "@/lib/icons";
import { useLiveGeneratedCases } from "../hooks/useLiveGeneratedCases";
import { GeneratedTestCaseCard } from "../GeneratedTestCaseCard";
import type { TestCase } from "@/types";
import type { LiveGeneratedCases } from "@/types/live";

interface Props {
  /** Ticket key whose drafts to load. */
  ticketKey: string;
  /** Callback to switch the drawer to the AI tab. */
  onGoToAi: () => void;
}

function relative(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function DrawerCasesPanel({ ticketKey, onGoToAi }: Props) {
  const { drafts, loading, error, remove } = useLiveGeneratedCases(ticketKey);

  if (loading && drafts.length === 0) {
    return (
      <div
        id="drawer-panel-cases"
        role="tabpanel"
        aria-labelledby="drawer-tab-cases"
        className="px-4 py-6 text-[12px] text-ink-faint"
      >
        Loading saved drafts…
      </div>
    );
  }

  if (error) {
    return (
      <div
        id="drawer-panel-cases"
        role="tabpanel"
        aria-labelledby="drawer-tab-cases"
        className="px-4 py-6 text-[11.5px] text-err"
      >
        {error}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div
        id="drawer-panel-cases"
        role="tabpanel"
        aria-labelledby="drawer-tab-cases"
        className="px-4 py-8 flex flex-col items-center justify-center text-center"
      >
        <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
          <ListChecks size={16} className="text-ink-muted" />
        </div>
        <p className="text-[12px] text-ink-secondary font-medium mb-1">
          No saved test cases yet
        </p>
        <p className="text-[11.5px] text-ink-faint max-w-[300px] leading-relaxed mb-3">
          Generated drafts for this ticket will appear here. Use the AI tab
          to create a new set of cases.
        </p>
        <button
          type="button"
          onClick={onGoToAi}
          className="g-btn text-[11.5px] px-2.5 py-1.5 inline-flex items-center gap-1.5 text-ai hover:text-ai"
        >
          <Sparkles size={11} />
          Open AI tab
        </button>
      </div>
    );
  }

  return (
    <div
      id="drawer-panel-cases"
      role="tabpanel"
      aria-labelledby="drawer-tab-cases"
      className="px-4 py-3 flex flex-col gap-3"
    >
      {drafts.map((draft) => (
        <DraftGroup
          key={draft.id}
          draft={draft}
          onDelete={() => void remove(draft.id).catch(() => undefined)}
        />
      ))}
    </div>
  );
}

interface DraftGroupProps {
  draft: LiveGeneratedCases;
  onDelete: () => void;
}

function DraftGroup({ draft, onDelete }: DraftGroupProps) {
  const [open, setOpen] = useState(true);
  const cases = (draft.cases as TestCase[] | null) ?? [];

  return (
    <section className="rounded-lg border border-subtle bg-surface-elevated">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-subtle">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-ink-muted hover:text-ink"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-ai" />
            <span className="text-[11.5px] font-medium text-ink-secondary">
              {cases.length} draft{cases.length === 1 ? "" : "s"}
            </span>
            <StatusChip status={draft.status} />
          </div>
          <div className="text-[10px] text-ink-faint font-mono mt-0.5">
            saved {relative(draft.created_at)} · updated {relative(draft.updated_at)}
          </div>
        </div>
        <button
          type="button"
          aria-label="Delete draft"
          title="Delete draft"
          onClick={onDelete}
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-err hover:bg-surface-overlay"
        >
          <Trash2 size={12} />
        </button>
      </header>
      {open && (
        <div className="p-3">
          {cases.length === 0 ? (
            <p className="text-[11.5px] text-ink-faint italic">
              Draft has no test cases.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cases.map((tc, i) => (
                <li key={i}>
                  <GeneratedTestCaseCard testCase={tc} index={i} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function StatusChip({ status }: { status: LiveGeneratedCases["status"] }) {
  const colors: Record<LiveGeneratedCases["status"], string> = {
    draft: "text-ink-muted bg-surface-overlay",
    exporting: "text-info bg-info/[0.12]",
    exported: "text-ok bg-ok/[0.12]",
    failed: "text-err bg-err/[0.12]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md",
        colors[status] ?? colors.draft,
      )}
    >
      {status}
    </span>
  );
}
