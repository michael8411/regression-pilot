/**
 * Phase 01 — pure builders for LiveBoardInsights.
 *
 * Consumes a `BoardResponse` (Jira passthrough payload) and produces the
 * deterministic analytics shape the Live board card will render in
 * Phase 04. Pure functions only — no I/O, no clocks except `computedAt`.
 *
 * Edge-case rules:
 *   - missing/unknown statuses are silently ignored,
 *   - empty boards still return a valid `LiveBoardInsights` with zeros,
 *   - throughput7d always has exactly 7 buckets (oldest -> newest),
 *   - agingRiskPct is clamped to [0, 100].
 */

import type { JiraTicket } from "@/types";
import type {
  BoardResponse,
  LiveBoardFunnel,
  LiveBoardInsights,
  LiveBoardThroughputPoint,
} from "@/types/live";
import {
  classifyStatus,
  type QaStatusOverride,
} from "./statusTaxonomy";

/** Days a ticket may sit in-flight before counting toward aging risk. */
const AGING_THRESHOLD_DAYS = 5;

interface BuildOptions {
  /** Fixed reference time for deterministic tests. */
  now?: Date;
  /** Optional QA status overrides from the board profile. */
  qaStatusOverride?: QaStatusOverride;
}

export function buildEmptyInsights(now: Date = new Date()): LiveBoardInsights {
  return {
    funnel: { ready: 0, testing: 0, done: 0 },
    inFlight: 0,
    total: 0,
    throughput7d: buildEmptyThroughput(now),
    agingRiskPct: 0,
    computedAt: now.toISOString(),
  };
}

export function buildBoardInsights(
  response: BoardResponse | null | undefined,
  opts: BuildOptions = {},
): LiveBoardInsights {
  const now = opts.now ?? new Date();
  if (!response || !response.by_status) {
    return buildEmptyInsights(now);
  }

  const funnel: LiveBoardFunnel = { ready: 0, testing: 0, done: 0 };
  const inFlightTickets: JiraTicket[] = [];
  const doneTickets: JiraTicket[] = [];

  for (const [status, tickets] of Object.entries(response.by_status)) {
    if (!Array.isArray(tickets)) continue;
    const bucket = classifyStatus(status, opts.qaStatusOverride);
    for (const t of tickets) {
      if (bucket === "ready") {
        funnel.ready += 1;
        inFlightTickets.push(t);
      } else if (bucket === "testing") {
        funnel.testing += 1;
        inFlightTickets.push(t);
      } else if (bucket === "done") {
        funnel.done += 1;
        doneTickets.push(t);
      }
    }
  }

  const inFlight = funnel.ready + funnel.testing;
  const total = inFlight + funnel.done;

  return {
    funnel,
    inFlight,
    total,
    throughput7d: buildThroughput7d(doneTickets, now),
    agingRiskPct: computeAgingRiskPct(inFlightTickets, now),
    computedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function dayKey(d: Date): string {
  // YYYY-MM-DD (UTC) — keeps buckets stable across browser locales.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildEmptyThroughput(now: Date): LiveBoardThroughputPoint[] {
  const points: LiveBoardThroughputPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    points.push({ day: dayKey(d), done: 0 });
  }
  return points;
}

function buildThroughput7d(
  doneTickets: JiraTicket[],
  now: Date,
): LiveBoardThroughputPoint[] {
  const slots = buildEmptyThroughput(now);
  const index = new Map(slots.map((s) => [s.day, s] as const));
  for (const t of doneTickets) {
    const ts = ticketDoneAt(t);
    if (!ts) continue;
    const key = dayKey(ts);
    const slot = index.get(key);
    if (slot) slot.done += 1;
  }
  return slots;
}

function ticketDoneAt(t: JiraTicket): Date | null {
  // Jira tickets carry `updated` as the freshest mutation timestamp; this is
  // a deterministic proxy for "moved to Done" without a separate transition
  // history fetch. Phase 04 can refine with explicit transition timestamps.
  const raw = t.updated || t.created || "";
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeAgingRiskPct(inFlight: JiraTicket[], now: Date): number {
  if (inFlight.length === 0) return 0;
  const cutoff = now.getTime() - AGING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  let aged = 0;
  for (const t of inFlight) {
    const raw = t.updated || t.created || "";
    if (!raw) continue;
    const d = new Date(raw).getTime();
    if (!Number.isNaN(d) && d < cutoff) aged += 1;
  }
  const pct = Math.round((aged / inFlight.length) * 100);
  return Math.max(0, Math.min(100, pct));
}
