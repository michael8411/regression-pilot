/**
 * Phase 06 — drawer Test Cases panel backed by encrypted SQLite drafts.
 *
 * Reads `/live/generated-cases?ticket_key=...` via `useLiveGeneratedCases`.
 * Each draft renders as a collapsible card group, with a delete affordance
 * per draft. Empty state still falls back to a "Open AI tab" CTA.
 *
 * Phase 06b — adds the publish-to-Jira workflow per draft. The "Publish"
 * action opens `PublishCasesDialog`; the status chip + target/export-key
 * summary lives directly in the header so customers can see whether a
 * draft has already been published and where it landed.
 */

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ListChecks,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
} from "@/lib/icons";
import { useLiveGeneratedCases } from "../hooks/useLiveGeneratedCases";
import { GeneratedTestCaseCard } from "../GeneratedTestCaseCard";
import { PublishCasesDialog } from "./PublishCasesDialog";
import type { TestCase } from "@/types";
import type {
  LiveExportMetadata,
  LiveGeneratedCases,
} from "@/types/live";

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

/** Derive a Jira project key from a ticket key (e.g. "FM-1432" -> "FM"). */
function deriveProjectKey(ticketKey: string): string {
  const i = ticketKey.indexOf("-");
  return i > 0 ? ticketKey.slice(0, i) : ticketKey;
}

export function DrawerCasesPanel({ ticketKey, onGoToAi }: Props) {
  const { drafts, loading, error, remove, refresh } =
    useLiveGeneratedCases(ticketKey);
  const [publishTarget, setPublishTarget] = useState<LiveGeneratedCases | null>(
    null,
  );
  const projectKey = useMemo(
    () => deriveProjectKey(ticketKey),
    [ticketKey],
  );

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
          ticketKey={ticketKey}
          onDelete={() => void remove(draft.id).catch(() => undefined)}
          onPublish={() => setPublishTarget(draft)}
        />
      ))}
      {publishTarget && (
        <PublishCasesDialog
          draft={publishTarget}
          ticketKey={ticketKey}
          projectKey={projectKey}
          onClose={() => setPublishTarget(null)}
          onPublished={() => void refresh()}
        />
      )}
    </div>
  );
}

interface DraftGroupProps {
  draft: LiveGeneratedCases;
  ticketKey: string;
  onDelete: () => void;
  onPublish: () => void;
}

function DraftGroup({
  draft,
  ticketKey,
  onDelete,
  onPublish,
}: DraftGroupProps) {
  const [open, setOpen] = useState(true);
  const cases = (draft.cases as TestCase[] | null) ?? [];
  const exportMeta = (draft.export_metadata as LiveExportMetadata | null) ?? null;
  const alreadyPublished =
    draft.status === "exported"
    || draft.status === "partial_export"
    || draft.status === "commented";

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
            <TargetBadge meta={exportMeta} status={draft.status} />
          </div>
          <div className="text-[10px] text-ink-faint font-mono mt-0.5">
            saved {relative(draft.created_at)} · updated {relative(draft.updated_at)}
            {draft.exported_at && (
              <> · published {relative(draft.exported_at)}</>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onPublish}
          className={clsx(
            "g-btn text-[11px] px-2 py-1 inline-flex items-center gap-1",
            alreadyPublished && "text-warn hover:text-warn",
          )}
          title={
            alreadyPublished
              ? "This set was already published. Re-publishing may create duplicates."
              : `Publish to ${ticketKey}`
          }
        >
          <Send size={11} />
          {alreadyPublished ? "Re-publish" : "Publish"}
        </button>
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
      {exportMeta && (
        <ExportMetadataSummary
          meta={exportMeta}
          ticketKey={ticketKey}
          status={draft.status}
        />
      )}
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

// ---------------------------------------------------------------------------
// Status + target chips
// ---------------------------------------------------------------------------

function StatusChip({ status }: { status: LiveGeneratedCases["status"] }) {
  const colors: Record<LiveGeneratedCases["status"], string> = {
    draft: "text-ink-muted bg-surface-overlay",
    accepted: "text-ink-secondary bg-surface-overlay",
    exporting: "text-info bg-info/[0.12]",
    exported: "text-ok bg-ok/[0.12]",
    partial_export: "text-warn bg-warn/[0.12]",
    commented: "text-info bg-info/[0.12]",
    discarded: "text-ink-faint bg-surface-overlay",
    failed: "text-err bg-err/[0.12]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md",
        colors[status] ?? colors.draft,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function TargetBadge({
  meta,
  status,
}: {
  meta: LiveExportMetadata | null;
  status: LiveGeneratedCases["status"];
}) {
  if (!meta) {
    return (
      <span className="text-[9px] font-mono uppercase tracking-wider text-ink-faint">
        not published
      </span>
    );
  }
  if (meta.target === "zephyr_linked_tests") {
    return (
      <span className="text-[9px] font-mono uppercase tracking-wider text-ok inline-flex items-center gap-1">
        <CheckCircle2 size={9} />
        Jira ticket
      </span>
    );
  }
  if (meta.target === "jira_comment") {
    return (
      <span className="text-[9px] font-mono uppercase tracking-wider text-info inline-flex items-center gap-1">
        <MessageSquare size={9} />
        Comment fallback
      </span>
    );
  }
  if (status === "partial_export") {
    return (
      <span className="text-[9px] font-mono uppercase tracking-wider text-warn inline-flex items-center gap-1">
        <AlertTriangle size={9} />
        Partial
      </span>
    );
  }
  return null;
}

function ExportMetadataSummary({
  meta,
  ticketKey,
  status,
}: {
  meta: LiveExportMetadata;
  ticketKey: string;
  status: LiveGeneratedCases["status"];
}) {
  const created = meta.created_test_cases ?? [];
  const failed = meta.failed ?? [];
  const isLinked = meta.target === "zephyr_linked_tests";
  const isComment = meta.target === "jira_comment";

  return (
    <div className="px-3 py-2 border-b border-subtle bg-surface-overlay/30 flex flex-col gap-1.5">
      {isLinked && meta.appears_on_jira_ticket && (
        <p className="text-[10.5px] text-ok flex items-center gap-1.5">
          <CheckCircle2 size={10} />
          Linked to <span className="font-mono">{ticketKey}</span> — should
          appear in the Jira Test Cases panel.
        </p>
      )}
      {isLinked && !meta.appears_on_jira_ticket && (
        <p className="text-[10.5px] text-warn flex items-center gap-1.5">
          <AlertTriangle size={10} />
          Created in Zephyr but not linked to {ticketKey}. May not appear in
          the Test Cases panel.
        </p>
      )}
      {isComment && (
        <p className="text-[10.5px] text-info flex items-center gap-1.5">
          <MessageSquare size={10} />
          Posted as Jira comment. May not appear in the Test Cases panel.
        </p>
      )}
      {status === "draft" && meta.target === "none" && (
        <p className="text-[10.5px] text-err">
          Last publish attempt failed. You can retry from the Publish button.
        </p>
      )}
      {created.length > 0 && (
        <div className="text-[10.5px] text-ink-secondary">
          Created:{" "}
          {created.slice(0, 4).map((c, i) => (
            <span
              key={(c.key ?? c.id ?? c.name) + i}
              className="font-mono mr-1.5"
            >
              {c.key ?? c.name}
              {c.self_url && (
                <a
                  href={c.self_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 text-ink-muted hover:text-ink"
                >
                  <ExternalLink size={9} />
                </a>
              )}
            </span>
          ))}
          {created.length > 4 && (
            <span className="text-ink-faint">+{created.length - 4} more</span>
          )}
        </div>
      )}
      {failed.length > 0 && (
        <div className="text-[10.5px] text-warn">
          {failed.length} failed: {failed.map((f) => f.name).slice(0, 3).join(", ")}
          {failed.length > 3 && ` +${failed.length - 3}`}
        </div>
      )}
      {meta.duplicate_attempt && (
        <div className="text-[10px] text-warn">
          Duplicate publish recorded — older runs are not undone.
        </div>
      )}
    </div>
  );
}
