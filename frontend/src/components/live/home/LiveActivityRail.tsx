/**
 * Phase 06 — durable Live activity rail.
 *
 * Reads events from `LiveActivityProvider` (encrypted SQLite). Renders the
 * locked visual contract (00b):
 *   - container: --surface-elevated + --border-subtle + radius-xl
 *   - header: pulsing accent dot + "Live activity" + "View history" CTA
 *   - row: <InitialAvatar> (ai variant for AI Assistant)
 *          + actor in --ink + verb in --ink-secondary + inline <TicketKeyChip>
 *          + detail line in --ink-muted
 *          + mono timestamp
 *
 * Per-event-kind rendering rules:
 *   - ticket_moved:  detail line "<from> → <to>" using statusColor tones.
 *   - cases_generated: AI avatar mandatory when actor === "AI Assistant".
 *   - comment_posted: detail truncated to 80 chars in quotes (already done at write time).
 *
 * The legacy `entries` prop is accepted for backwards-compatibility with
 * any caller that hasn't migrated yet (currently `LiveHome`), but events
 * sourced from the durable feed always take precedence when available.
 */

import { useMemo } from "react";
import { Activity, History } from "@/lib/icons";
import { useCommandRegistry } from "@/contexts/CommandRegistryContext";
import {
  useOptionalLiveActivityFeed,
  resolveIntent,
  INTENT_VERBS,
  type ActivityIntent,
} from "@/components/live/activity";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import { statusColor } from "@/components/live/lib/statusColors";
import {
  InitialAvatar,
  TicketKeyChip,
} from "@/components/live/visual";
import type { LiveActivityEvent } from "@/types/live";

export interface LiveActivityRailEntry {
  id: string;
  /** Short human-readable summary, e.g. "Created board FM Mobile". */
  summary: string;
  /** ISO timestamp for relative display. */
  at: string;
  /** Optional secondary line. */
  detail?: string;
}

interface Props {
  /**
   * Legacy in-memory entries from `LiveHome`. Ignored once the durable feed
   * is active; kept here for backward compatibility with the Phase 02 prop
   * shape so existing call sites don't break.
   */
  entries?: LiveActivityRailEntry[];
}

const HISTORY_COMMAND_ID = "jump.history";
const DEFAULT_ACTOR = "You";

export function LiveActivityRail({ entries }: Props) {
  const { commands } = useCommandRegistry();
  const feed = useOptionalLiveActivityFeed();

  const openHistory = () => {
    const cmd = commands.find((c) => c.id === HISTORY_COMMAND_ID);
    if (!cmd) return;
    if (cmd.action.type === "run") {
      void cmd.action.run();
    }
  };

  // Prefer the durable feed when available; fall back to legacy entries.
  const persistedEvents = feed?.events ?? [];
  const usePersisted = !!feed;

  return (
    <aside
      aria-label="Live activity"
      className="hidden lg:flex sticky top-0 self-start w-[280px] shrink-0 flex-col h-full border-l border-subtle bg-surface-elevated rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div className="flex items-center gap-1.5 text-ink">
          {/* Pulsing accent dot — live indicator */}
          <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0">
            <span
              className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="relative inline-flex rounded-full w-1.5 h-1.5"
              style={{ background: "var(--accent)" }}
            />
          </span>
          <Activity size={12} className="text-accent-text" />
          <h2 className="text-[12px] font-semibold">Live activity</h2>
        </div>
        <button
          type="button"
          onClick={openHistory}
          className="text-[10.5px] text-ink-secondary hover:text-accent-text underline-offset-2 hover:underline flex items-center gap-1 transition-colors"
        >
          <History size={11} />
          View history
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {usePersisted ? (
          <PersistedList events={persistedEvents} loading={!!feed?.loading} />
        ) : (
          <LegacyList entries={entries ?? []} />
        )}
      </div>
    </aside>
  );
}

// ===========================================================================
// Persisted feed
// ===========================================================================

function PersistedList({
  events,
  loading,
}: {
  events: LiveActivityEvent[];
  loading: boolean;
}) {
  if (loading && events.length === 0) {
    return (
      <div className="px-4 py-6 text-[11px] text-ink-faint">Loading activity…</div>
    );
  }
  if (events.length === 0) {
    return <EmptyRail />;
  }
  return (
    <ul className="flex flex-col p-2 gap-0.5">
      {events.map((e) => (
        <ActivityRow key={e.id} event={e} />
      ))}
    </ul>
  );
}

function ActivityRow({ event }: { event: LiveActivityEvent }) {
  const intent = resolveIntent({
    kind: event.kind,
    summary: event.summary,
    detail: event.detail,
    ticket_key: event.ticket_key,
    board_id: event.board_id,
  });

  const { actor, subject } = parseSummary(event.summary);
  const verb = INTENT_VERBS[intent] ?? "touched";
  const ticketKey = event.ticket_key || (subject && /^[A-Z][A-Z0-9]+-\d+$/.test(subject) ? subject : "");
  const priorityHint = extractPriorityHint(event.detail);
  const isAi = actor.toLowerCase().includes("ai assistant");

  return (
    <li
      className="flex gap-2 px-2 py-2 transition-colors hover:bg-surface-overlay/50"
      style={{ borderRadius: "var(--radius-md, 6px)" }}
    >
      <InitialAvatar
        name={actor || DEFAULT_ACTOR}
        special={isAi ? "ai" : undefined}
        size={22}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start flex-wrap gap-x-1 gap-y-0.5 text-[11.5px] leading-snug">
          <span className="text-ink font-medium">{actor || DEFAULT_ACTOR}</span>
          <span className="text-ink-secondary">{verb}</span>
          {ticketKey ? (
            <TicketKeyChip ticketKey={ticketKey} priority={priorityHint} />
          ) : subject ? (
            <span className="text-ink-secondary truncate max-w-[140px]">
              {subject}
            </span>
          ) : null}
        </div>
        <DetailLine intent={intent} detail={event.detail} />
      </div>
      <span
        className="text-[10px] text-ink-muted font-mono shrink-0 pt-0.5"
        title={event.created_at}
      >
        {relativeTime(event.created_at)}
      </span>
    </li>
  );
}

function DetailLine({
  intent,
  detail,
}: {
  intent: ActivityIntent;
  detail: string;
}) {
  if (!detail) return null;

  // ticket_moved → status-colored from → to.
  if (intent === "ticket_moved") {
    const m = /^(.+?)\s*(?:→|->)\s*(.+)$/.exec(detail);
    if (m) {
      const fromBucket = classifyStatus(m[1].trim());
      const toBucket = classifyStatus(m[2].trim());
      return (
        <div className="mt-0.5 text-[10.5px] text-ink-muted truncate">
          <span className={statusColor(fromBucket).fg}>{m[1].trim()}</span>
          <span className="mx-1">→</span>
          <span className={statusColor(toBucket).fg}>{m[2].trim()}</span>
        </div>
      );
    }
  }

  return (
    <div className="mt-0.5 text-[10.5px] text-ink-muted truncate">{detail}</div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Activity summaries are written in the form "<verb> <subject>" (e.g.
 * "pinned FM-1418"). The actor is not embedded in the persisted summary
 * because the database doesn't have user identity yet — we synthesize
 * "You" as the actor for all events emitted by the current session.
 *
 * AI-attributed events use "AI Assistant" as actor when the originating
 * caller writes that verbatim in the summary string ("AI Assistant
 * generated …"). We detect that here.
 */
function parseSummary(raw: string): { actor: string; subject: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { actor: DEFAULT_ACTOR, subject: "" };

  // "AI Assistant generated FM-1418" pattern
  const aiMatch = /^AI Assistant\s+(.+)$/.exec(trimmed);
  if (aiMatch) {
    const tail = aiMatch[1];
    const parts = tail.split(/\s+/);
    if (parts.length >= 2) {
      return { actor: "AI Assistant", subject: parts.slice(1).join(" ") };
    }
    return { actor: "AI Assistant", subject: tail };
  }

  // Default: actor = "You", subject = trailing token after the verb.
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { actor: DEFAULT_ACTOR, subject: trimmed };
  return { actor: DEFAULT_ACTOR, subject: parts.slice(1).join(" ") };
}

function extractPriorityHint(detail: string): string | undefined {
  if (!detail) return undefined;
  const m = /priority[:=]\s*(critical|high|medium|low)/i.exec(detail);
  return m ? m[1].toLowerCase() : undefined;
}

// ===========================================================================
// Legacy fallback (kept for non-provider callers; never used inside the
// LiveWorkspace shell, which always wraps in LiveActivityProvider)
// ===========================================================================

function LegacyList({ entries }: { entries: LiveActivityRailEntry[] }) {
  // Deduplicate ids defensively.
  const safe = useMemo(() => {
    const seen = new Set<string>();
    return entries.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [entries]);

  if (safe.length === 0) return <EmptyRail />;

  return (
    <ul className="flex flex-col">
      {safe.map((e) => (
        <li
          key={e.id}
          className="px-4 py-3 border-b border-subtle/60 last:border-b-0"
        >
          <div className="text-[12px] text-ink leading-snug truncate">
            {e.summary}
          </div>
          {e.detail && (
            <div className="mt-0.5 text-[10.5px] text-ink-muted truncate">
              {e.detail}
            </div>
          )}
          <div className="mt-1 text-[10px] text-ink-faint font-mono">
            {relativeTime(e.at)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyRail() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-9 h-9 rounded-lg bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
        <Activity size={14} className="text-ink-muted" />
      </div>
      <p className="text-[11.5px] text-ink-muted leading-relaxed max-w-[220px]">
        Recent Live actions will appear here as you work — pins, generated
        cases, comments, and transitions.
      </p>
    </div>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
