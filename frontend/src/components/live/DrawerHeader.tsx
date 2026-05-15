/**
 * Phase 05 — 4-row drawer header.
 *
 *  1. Action row: TicketKeyChip · StatusDot+status text · PriorityPill · spacer
 *                 · copy icon · open-in-Jira · pin · close.
 *  2. Title row: H2, --ink, two-line clamp.
 *  3. Meta row: mono --ink-muted, dotted separators —
 *               {issue_type} · {labels} · Reporter · Created.
 *  4. Chip row: zero or more LabelChips.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Pin, PinOff, X } from "@/lib/icons";
import { getConfigStatus } from "@/lib/api";
import type { JiraTicket } from "@/types";
import { buildTicketUrl, openExternal } from "./lib/jiraLinks";
import { classifyStatus } from "./lib/statusTaxonomy";
import {
  LabelChip,
  PriorityPill,
  StatusDot,
  TicketKeyChip,
} from "@/components/live/visual";

interface Props {
  ticketKey: string;
  ticket: JiraTicket | null;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}

const MAX_HEADER_LABELS = 6;

function normalisePriority(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const n = p.toLowerCase();
  if (n === "highest" || n === "critical") return "critical";
  if (n === "high") return "high";
  if (n === "medium") return "medium";
  if (n === "low" || n === "lowest") return "low";
  return undefined;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DrawerHeader({
  ticketKey,
  ticket,
  isPinned,
  onTogglePin,
  onClose,
}: Props) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getConfigStatus();
        if (!cancelled) setBaseUrl(cfg.jira.base_url ?? null);
      } catch {
        if (!cancelled) setBaseUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ticketKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }, [ticketKey]);

  const url = buildTicketUrl(baseUrl, ticketKey);
  const status = ticket?.status ?? "—";
  const bucket = ticket?.status ? classifyStatus(ticket.status) : "neutral";
  const priorityTone = normalisePriority(ticket?.priority);
  const visibleLabels = (ticket?.labels ?? []).slice(0, MAX_HEADER_LABELS);

  return (
    <header className="px-4 py-3 border-b border-subtle flex flex-col gap-2.5">
      {/* Row 1 — action row */}
      <div className="flex items-center gap-2">
        <TicketKeyChip ticketKey={ticketKey} priority={priorityTone} />

        <div className="flex items-center gap-1 text-[10.5px] text-ink-secondary">
          <StatusDot tone={bucket} />
          <span>{status}</span>
        </div>

        {priorityTone && <PriorityPill priority={priorityTone} />}

        <div className="flex-1" />

        <IconBtn label={copied ? "Copied" : "Copy key"} onClick={handleCopyKey}>
          <Copy size={12} />
        </IconBtn>
        {url && (
          <IconBtn
            label="Open in Jira"
            onClick={() => void openExternal(url)}
          >
            <ExternalLink size={12} />
          </IconBtn>
        )}
        <IconBtn
          label={isPinned ? "Unpin" : "Pin"}
          onClick={onTogglePin}
        >
          {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        </IconBtn>
        <IconBtn label="Close" onClick={onClose}>
          <X size={12} />
        </IconBtn>
      </div>

      {/* Row 2 — title */}
      <h2 className="text-[15px] font-semibold text-ink leading-snug line-clamp-2">
        {ticket?.summary ?? "—"}
      </h2>

      {/* Row 3 — meta line */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-muted font-mono">
        <span>{ticket?.issue_type || "Issue"}</span>
        {ticket?.labels && ticket.labels.length > 0 && (
          <>
            <Sep />
            <span className="truncate max-w-[140px]" title={ticket.labels.join(", ")}>
              {ticket.labels.slice(0, 3).join(", ")}
              {ticket.labels.length > 3 && ` +${ticket.labels.length - 3}`}
            </span>
          </>
        )}
        <Sep />
        <span>Reporter {ticket?.reporter || "Unknown"}</span>
        <Sep />
        <span>Created {formatDate(ticket?.created ?? "")}</span>
      </div>

      {/* Row 4 — label chip row */}
      {visibleLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {visibleLabels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {(ticket?.labels?.length ?? 0) > MAX_HEADER_LABELS && (
            <span className="text-[9px] font-mono text-ink-faint">
              +{(ticket?.labels?.length ?? 0) - MAX_HEADER_LABELS}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

function Sep() {
  return <span aria-hidden="true">·</span>;
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </button>
  );
}
