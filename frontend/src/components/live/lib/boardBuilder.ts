/**
 * Phase 01 — board builder helpers.
 *
 * Pure functions only:
 *   - `buildJqlFromSimpleDraft` is the single source of truth for the
 *     simple mode (no raw JQL editing required by the user).
 *   - `validateBuilderDraft` returns a deterministic validation result.
 *   - `deriveDefaultBoardName` produces a stable default board name from
 *     project + version inputs.
 *
 * Phase 02 wires these into the redesigned BoardCreateDialog. They are
 * also re-exported via `frontend/src/components/live/index.ts` so other
 * helpers (insights, hooks) can consume the same vocabulary.
 */

import type {
  LiveBoardBuilderAdvancedDraft,
  LiveBoardBuilderDraft,
  LiveBoardBuilderPayload,
  LiveBoardBuilderSimpleDraft,
  LiveBoardBuilderValidation,
} from "../types";
import type { LiveBoardProfile } from "@/types/live";

// ---------------------------------------------------------------------------
// JQL serialization
// ---------------------------------------------------------------------------

function escapeJqlValue(value: string): string {
  // Wrap in double-quotes and escape internal quotes. Jira JQL doesn't
  // accept backslash escapes for newlines, but the inputs here are short
  // names so the simple double-quote escape is sufficient.
  return `"${value.replace(/"/g, '\\"')}"`;
}

function joinOr(values: string[]): string {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  return `(${cleaned.map(escapeJqlValue).join(", ")})`;
}

export function buildJqlFromSimpleDraft(
  draft: LiveBoardBuilderSimpleDraft,
): string {
  const parts: string[] = [];

  const project = draft.projectKey.trim();
  if (project) parts.push(`project = ${escapeJqlValue(project)}`);

  const version = draft.versionName.trim();
  if (version) parts.push(`fixVersion = ${escapeJqlValue(version)}`);

  const statuses = draft.selectedStatuses
    .map((s) => s.trim())
    .filter(Boolean);
  if (statuses.length > 0) {
    parts.push(`status IN ${joinOr(statuses)}`);
  }

  if (draft.assigneeScope === "currentUser") {
    parts.push("assignee = currentUser()");
  }

  const ordering = "ORDER BY updated DESC";
  if (parts.length === 0) return ordering;
  return `${parts.join(" AND ")} ${ordering}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_LANE_GROUPING = new Set([
  "none",
  "epic",
  "parent",
  "component",
]);

const VALID_ASSIGNEE_SCOPE = new Set(["anyone", "currentUser"]);

export function validateBuilderDraft(
  draft: LiveBoardBuilderDraft,
): LiveBoardBuilderValidation {
  const errors: string[] = [];
  const name = (draft.name || "").trim();
  if (!name) {
    errors.push("Board name is required");
  } else if (name.length > 120) {
    errors.push("Board name must be 120 characters or fewer");
  }
  if (draft.refreshIntervalSec < 5) {
    errors.push("Refresh interval must be at least 5 seconds");
  }
  if (draft.refreshIntervalSec > 60 * 30) {
    errors.push("Refresh interval must be 30 minutes or less");
  }
  if (!VALID_LANE_GROUPING.has(draft.laneGrouping)) {
    errors.push("Invalid lane grouping");
  }
  if (!VALID_ASSIGNEE_SCOPE.has(draft.assigneeScope)) {
    errors.push("Invalid assignee scope");
  }

  if (draft.mode === "simple") {
    if (!draft.projectKey.trim()) {
      errors.push("Pick a Jira project for the board");
    }
    if (draft.selectedStatuses.length === 0) {
      errors.push("Pick at least one status to include on the board");
    }
  } else {
    if (!draft.customJql.trim()) {
      errors.push("Advanced mode requires a JQL query");
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function deriveDefaultBoardName(
  projectKey: string,
  versionName?: string,
): string {
  const project = (projectKey || "").trim();
  const version = (versionName || "").trim();
  if (project && version) return `${project} • ${version}`;
  if (project) return `${project} board`;
  if (version) return `${version} board`;
  return "Live board";
}

// ---------------------------------------------------------------------------
// Draft -> API payload
// ---------------------------------------------------------------------------

function profileFromSimple(
  draft: LiveBoardBuilderSimpleDraft,
  jql: string,
): LiveBoardProfile {
  return {
    builderMode: "simple",
    projectKey: draft.projectKey.trim(),
    versionName: draft.versionName.trim(),
    selectedStatuses: [...draft.selectedStatuses],
    qaStatusMap: {
      ready: [...draft.qaStatusMap.ready],
      testing: [...draft.qaStatusMap.testing],
      done: [...draft.qaStatusMap.done],
    },
    laneGrouping: draft.laneGrouping,
    assigneeScope: draft.assigneeScope,
    refreshIntervalSec: draft.refreshIntervalSec,
    customJql: jql,
  };
}

function profileFromAdvanced(
  draft: LiveBoardBuilderAdvancedDraft,
): LiveBoardProfile {
  return {
    builderMode: "advanced",
    projectKey: draft.projectKey.trim(),
    versionName: draft.versionName.trim(),
    selectedStatuses: [],
    qaStatusMap: {
      ready: [...draft.qaStatusMap.ready],
      testing: [...draft.qaStatusMap.testing],
      done: [...draft.qaStatusMap.done],
    },
    laneGrouping: draft.laneGrouping,
    assigneeScope: draft.assigneeScope,
    refreshIntervalSec: draft.refreshIntervalSec,
    customJql: draft.customJql,
  };
}

export function buildPayloadFromDraft(
  draft: LiveBoardBuilderDraft,
): LiveBoardBuilderPayload {
  if (draft.mode === "simple") {
    const jql = buildJqlFromSimpleDraft(draft);
    return {
      name: draft.name.trim(),
      jql,
      columns: [...draft.columns],
      profile: profileFromSimple(draft, jql),
    };
  }
  return {
    name: draft.name.trim(),
    jql: draft.customJql.trim(),
    columns: [...draft.columns],
    profile: profileFromAdvanced(draft),
  };
}
