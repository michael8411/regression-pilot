/**
 * Phase 01 — canonical QA status taxonomy.
 *
 * The Live workspace normalizes per-team Jira status names into three
 * QA-meaningful groups (`ready`, `testing`, `done`). These helpers are
 * pure, deterministic, and case-insensitive so insight builders and
 * board-builder forms can share the same vocabulary.
 *
 * Phase 02+ may wire user-defined overrides via `LiveBoardProfile.qaStatusMap`;
 * the helpers below intentionally accept an optional override map for that
 * future use, and otherwise fall back to the curated defaults.
 */

export const QA_READY_STATUSES: ReadonlyArray<string> = [
  "Ready to Test",
  "Ready for QA",
  "Ready for Test",
  "QA Ready",
];

export const QA_TESTING_STATUSES: ReadonlyArray<string> = [
  "In Testing",
  "Testing",
  "QA In Progress",
  "QA Testing",
];

export const DONE_STATUSES: ReadonlyArray<string> = [
  "Done",
  "Closed",
  "Resolved",
  "Completed",
];

function normalize(name: string): string {
  return (name || "").trim().toLowerCase();
}

function toSet(list: ReadonlyArray<string>): Set<string> {
  return new Set(list.map(normalize));
}

const READY_SET = toSet(QA_READY_STATUSES);
const TESTING_SET = toSet(QA_TESTING_STATUSES);
const DONE_SET = toSet(DONE_STATUSES);

export interface QaStatusOverride {
  ready?: ReadonlyArray<string>;
  testing?: ReadonlyArray<string>;
  done?: ReadonlyArray<string>;
}

function check(
  name: string,
  fallback: Set<string>,
  override?: ReadonlyArray<string>,
): boolean {
  if (!name) return false;
  const n = normalize(name);
  if (override && override.length > 0) {
    return override.some((s) => normalize(s) === n);
  }
  return fallback.has(n);
}

export function isReadyStatus(
  name: string,
  override?: QaStatusOverride,
): boolean {
  return check(name, READY_SET, override?.ready);
}

export function isTestingStatus(
  name: string,
  override?: QaStatusOverride,
): boolean {
  return check(name, TESTING_SET, override?.testing);
}

export function isDoneStatus(
  name: string,
  override?: QaStatusOverride,
): boolean {
  return check(name, DONE_SET, override?.done);
}

export type QaBucket = "ready" | "testing" | "done" | "other";

export function classifyStatus(
  name: string,
  override?: QaStatusOverride,
): QaBucket {
  if (isReadyStatus(name, override)) return "ready";
  if (isTestingStatus(name, override)) return "testing";
  if (isDoneStatus(name, override)) return "done";
  return "other";
}
