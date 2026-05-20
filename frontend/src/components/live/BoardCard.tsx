/**
 * Phase 04 — redesigned board card.
 *
 * Replaces the old flat card with:
 *   - <BrandTile> for the project avatar (no per-card gradient code)
 *   - <CardTopAccent> 2px top strip (testing tone)
 *   - <QaFunnelBar> replacing the old decorative progress bar
 *   - <ThroughputMiniBars> replacing the old sparkline
 *   - <AgingRiskChip> for staleness signal
 *
 * Interactions (open, pin, edit, delete) are unchanged.
 */

import { useState } from "react";
import { clsx } from "clsx";
import {
  Pencil,
  Pin,
  PinOff,
  Trash2,
  type IconComponent,
} from "@/lib/icons";
import type { LiveBoard } from "@/types/live";
import { BrandTile, CardTopAccent } from "@/components/live/visual";
import { QaFunnelBar, ThroughputMiniBars, AgingRiskChip } from "@/components/live/cards";
import { useLiveBoardInsights } from "@/components/live/hooks/useLiveBoardInsights";
import { buildEmptyInsights } from "@/components/live/lib/boardInsights";

interface Props {
  board: LiveBoard;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onEdit: (b: LiveBoard) => void;
  onDelete: (id: string) => void;
}

/** Attempt to extract a project key from a JQL string, e.g. "project = FM". */
function inferProjectKey(jql: string): string {
  const m = /project\s*(?:=|in)\s*["']?([A-Z][A-Z0-9]{1,9})["']?/i.exec(jql);
  return m ? m[1].toUpperCase() : "";
}

export function BoardCard({
  board,
  onOpen,
  onTogglePin,
  onEdit,
  onDelete,
}: Props) {
  const [hover, setHover] = useState(false);
  const { id, name, jql, pinned, updated_at } = board;

  const { insights, loading: insightsLoading, error: insightsError } =
    useLiveBoardInsights(board);

  const projectKey =
    board.profile?.projectKey || inferProjectKey(jql);

  const data = insights ?? buildEmptyInsights();
  const hasData = !insightsError && insights !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(id);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={clsx(
        "group relative flex flex-col gap-2.5 overflow-hidden rounded-xl px-3.5 pt-4 pb-3 cursor-pointer",
        "border border-subtle bg-surface-elevated hover:border-accent/[0.25] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        hover && "shadow-md",
      )}
    >
      {/* 2px accent strip — flush with card top corners */}
      <CardTopAccent tone="testing" />

      {/* Card header: brand tile + name + actions */}
      <div className="flex gap-2 justify-between items-start">
        <div className="flex items-start gap-2.5 min-w-0">
          <BrandTile projectKey={projectKey} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {pinned && <Pin size={10} className="text-accent-text shrink-0" />}
              <h3 className="text-[13px] font-semibold text-ink leading-snug line-clamp-2">
                {name}
              </h3>
            </div>
            <div className="mt-0.5 text-[10px] text-ink-faint font-mono">
              {relativeTime(updated_at)}
            </div>
          </div>
        </div>

        {/* Action strip — visible on hover */}
        <div
          className={clsx(
            "flex items-center gap-0.5 shrink-0 transition-opacity",
            hover ? "opacity-100" : "opacity-0",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <RowAction
            icon={pinned ? PinOff : Pin}
            label={pinned ? "Unpin" : "Pin"}
            onClick={() => onTogglePin(id)}
          />
          <RowAction
            icon={Pencil}
            label="Edit"
            onClick={() => onEdit(board)}
          />
          <RowAction
            icon={Trash2}
            label="Delete"
            tone="danger"
            onClick={() => {
              if (confirm(`Delete "${name}"? This cannot be undone.`)) {
                onDelete(id);
              }
            }}
          />
        </div>
      </div>

      {/* Analytics region */}
      {insightsLoading && !insights ? (
        <MetricsSkeleton />
      ) : insightsError && !insights ? (
        <div className="text-[10px] text-ink-faint font-mono">
          Data unavailable
        </div>
      ) : (
        <>
          {/* Funnel bar */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-ink-muted">
                QA Funnel
              </span>
              {hasData && (
                <span className="text-[9px] font-mono text-ink-faint">
                  {data.inFlight} in-flight · {data.total} total
                </span>
              )}
            </div>
            <QaFunnelBar funnel={data.funnel} />
            {hasData && (
              <div className="flex gap-3 mt-1">
                <FunnelLegend count={data.funnel.ready} label="Ready" color="text-warn" />
                <FunnelLegend count={data.funnel.testing} label="Testing" color="text-accent-text" />
                <FunnelLegend count={data.funnel.done} label="Done" color="text-ok" />
              </div>
            )}
          </div>

          {/* Throughput + aging risk */}
          <div className="flex gap-2 justify-between items-end">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-ink-muted mb-1">
                7-day closed
              </div>
              <ThroughputMiniBars points={data.throughput7d} />
            </div>
            <AgingRiskChip agingRiskPct={data.agingRiskPct} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FunnelLegend({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <span className={`font-mono font-semibold text-[10px] ${color}`}>{count}</span>
      <span className="text-[9px] text-ink-faint">{label}</span>
    </span>
  );
}

function MetricsSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      <div className="w-full h-2 rounded-full bg-surface-overlay" />
      <div className="flex gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="rounded bg-surface-overlay"
            style={{ width: 4, height: 16 + Math.random() * 8 }}
          />
        ))}
      </div>
    </div>
  );
}

function RowAction({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay",
        tone === "danger" && "hover:text-err",
      )}
    >
      <Icon size={12} />
    </button>
  );
}

function relativeTime(iso: string): string {
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
