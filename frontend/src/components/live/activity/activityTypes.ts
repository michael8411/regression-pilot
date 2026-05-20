/**
 * Phase 06 — frontend activity event types.
 *
 * The backend `LiveActivityKind` Literal supports a fixed set of strings
 * (board_created, board_updated, ticket_pinned, ticket_unpinned,
 *  cases_generated, cases_exported, comment_posted, transition_applied,
 *  other). The redesign spec talks about a richer vocabulary
 *  (board_pinned, ticket_moved, ticket_opened …); we map those user-facing
 *  intents onto the durable backend kinds so the database schema stays
 *  unchanged while the rail can still render the intended verbs.
 *
 * Each entry the rail renders is derived from a `LiveActivityEvent` by:
 *   1. reading the persisted `kind` (backend literal),
 *   2. inferring the redesign "intent" (`ActivityIntent`),
 *   3. looking up the verb + accent style for that intent.
 */

import type { LiveActivityKind } from "@/types/live";

/** Redesign-facing intent. Multiple may map to the same backend kind. */
export type ActivityIntent =
  | "board_created"
  | "board_updated"
  | "board_pinned"
  | "board_unpinned"
  | "ticket_pinned"
  | "ticket_unpinned"
  | "ticket_moved"
  | "ticket_opened"
  | "comment_posted"
  | "cases_generated"
  | "cases_exported"
  | "other";

/**
 * Resolve the user-facing intent from a persisted event. The `detail` and
 * `summary` strings are inspected lightly to distinguish board-pin vs
 * ticket-pin (both share the `ticket_pinned` literal historically).
 */
export function resolveIntent(args: {
  kind: LiveActivityKind;
  summary: string;
  detail: string;
  ticket_key: string | null;
  board_id: string | null;
}): ActivityIntent {
  switch (args.kind) {
    case "board_created":
      return "board_created";
    case "board_updated": {
      const s = (args.summary || "").toLowerCase();
      if (s.includes("pinned")) return "board_pinned";
      if (s.includes("unpinned")) return "board_unpinned";
      return "board_updated";
    }
    case "ticket_pinned":
      return "ticket_pinned";
    case "ticket_unpinned":
      return "ticket_unpinned";
    case "transition_applied":
      return "ticket_moved";
    case "comment_posted":
      return "comment_posted";
    case "cases_generated":
      return "cases_generated";
    case "cases_exported":
      return "cases_exported";
    default:
      return "other";
  }
}

/** Convert a redesign intent back into a persistable backend literal. */
export function backendKindForIntent(intent: ActivityIntent): LiveActivityKind {
  switch (intent) {
    case "board_created":
      return "board_created";
    case "board_updated":
    case "board_pinned":
    case "board_unpinned":
      return "board_updated";
    case "ticket_pinned":
      return "ticket_pinned";
    case "ticket_unpinned":
      return "ticket_unpinned";
    case "ticket_moved":
      return "transition_applied";
    case "comment_posted":
      return "comment_posted";
    case "cases_generated":
      return "cases_generated";
    case "cases_exported":
      return "cases_exported";
    case "ticket_opened":
    case "other":
    default:
      return "other";
  }
}

/** The verb a rail row should render for each intent. */
export const INTENT_VERBS: Record<ActivityIntent, string> = {
  board_created: "created board",
  board_updated: "updated board",
  board_pinned: "pinned board",
  board_unpinned: "unpinned board",
  ticket_pinned: "pinned",
  ticket_unpinned: "unpinned",
  ticket_moved: "moved",
  ticket_opened: "opened",
  comment_posted: "commented on",
  cases_generated: "generated",
  cases_exported: "exported",
  other: "touched",
};
