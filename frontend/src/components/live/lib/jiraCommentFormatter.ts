/**
 * Phase 06c — canonical Jira-comment body formatter for Live publishes.
 *
 * The publish dialog renders this output as a read-only preview, then
 * sends the same string to the backend via `comment_body` on the publish
 * request. The backend posts it verbatim, so what the user sees in the
 * preview is byte-for-byte what lands in Jira.
 *
 * Kept in sync with `backend/services/live_publish_service.py::
 * _format_comment_body`. Update both when the structure changes.
 *
 * Output structure:
 *   `Testdeck generated test cases`
 *   blank line
 *   `Source ticket: <TICKET-KEY>`
 *   blank line
 *   per case:
 *     `Case N: <name>  [<priority>]`
 *     `Objective: ...`
 *     `Preconditions:`
 *       `  - ...`
 *     `Steps:`
 *       `  1. <action>`
 *       `     Expected: <expected>`
 *     `Expected result: ...` (only if the case carries a top-level expected)
 *   between cases: blank line, `----`, blank line.
 */

import type { TestCase, TestStep } from "@/types";

export interface JiraCommentFormatOptions {
  ticketKey: string;
  cases: ReadonlyArray<TestCase>;
}

function stepLines(step: TestStep, index: number): string[] {
  const action = (step.action ?? "").toString().trim();
  const expected = (step.expected_result ?? "").toString().trim();
  const lines: string[] = [];
  lines.push(action ? `  ${index + 1}. ${action}` : `  ${index + 1}.`);
  if (expected) lines.push(`     Expected: ${expected}`);
  return lines;
}

function caseLines(tc: TestCase, index: number): string[] {
  const name = (tc.name ?? "").toString().trim() || "Untitled";
  const priority = (tc.priority ?? "").toString().trim();
  const header = priority
    ? `Case ${index + 1}: ${name}  [${priority}]`
    : `Case ${index + 1}: ${name}`;

  const lines: string[] = [header];
  const objective = (tc.objective ?? "").toString().trim();
  if (objective) lines.push(`Objective: ${objective}`);

  const precs = (tc.preconditions ?? [])
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean);
  if (precs.length > 0) {
    lines.push("Preconditions:");
    for (const p of precs) lines.push(`  - ${p}`);
  }

  const steps = tc.steps ?? [];
  if (steps.length > 0) {
    lines.push("Steps:");
    steps.forEach((step, j) => {
      lines.push(...stepLines(step, j));
    });
  }

  // The TestCase type does not surface a top-level `expected_result`, but
  // older drafts may carry one. Surface it if present at runtime.
  const topExpected = (tc as { expected_result?: string }).expected_result;
  if (topExpected && String(topExpected).trim()) {
    lines.push(`Expected result: ${String(topExpected).trim()}`);
  }

  return lines;
}

export function formatJiraCommentBody({
  ticketKey,
  cases,
}: JiraCommentFormatOptions): string {
  const out: string[] = [];
  out.push("Testdeck generated test cases");
  out.push("");
  out.push(`Source ticket: ${ticketKey}`);
  out.push("");

  cases.forEach((tc, i) => {
    out.push(...caseLines(tc, i));
    if (i < cases.length - 1) {
      out.push("");
      out.push("----");
    }
    out.push("");
  });

  return out.join("\n").replace(/\s+$/g, "") + "\n";
}
