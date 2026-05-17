/**
 * Phase 06c — editable, expand/collapse-friendly generated test case card.
 *
 * Renders one persisted generated case row inside the drawer Test Cases
 * panel. Visual rules from `00b-live-testing-visual-design-language.md`:
 *  - 2px top accent strip in `priorityColor(case.priority).fg`
 *  - `<PriorityPill>` for the scannable priority chip
 *  - clamped preview lines on collapse, full markdown-friendly body on expand
 *
 * The card is purely presentational — `onEdit` opens the editor dialog
 * and `onSaved` lets the parent refresh after a successful save.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "@/lib/icons";
import { PriorityPill } from "@/components/live/visual";
import { CardTopAccent } from "@/components/live/visual/CardTopAccent";
import { priorityColor } from "@/components/live/lib/priorityColors";
import type { TestCase } from "@/types";

interface Props {
  testCase: TestCase;
  index: number;
  /** Open the editor dialog for this case. */
  onEdit: () => void;
  /** Disable edit affordance while the parent draft is mid-publish. */
  disabled?: boolean;
}

export function EditableGeneratedCaseCard({
  testCase,
  index,
  onEdit,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const tone = priorityColor(testCase.priority);
  const stepCount = testCase.steps?.length ?? 0;
  const precCount = testCase.preconditions?.length ?? 0;

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-subtle bg-surface-elevated"
      style={{ borderRadius: "var(--radius-lg, 10px)" }}
    >
      <CardTopAccent varOverride={`var(${tone.varName})`} />

      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Collapse case" : "Expand case"}
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-ink-muted hover:text-ink shrink-0"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-ink-faint font-mono shrink-0">
              #{index + 1}
            </span>
            <span
              className={`text-[12px] text-ink font-medium ${open ? "" : "line-clamp-1"}`}
            >
              {testCase.name?.trim() || "Untitled case"}
            </span>
            <PriorityPill priority={testCase.priority} className="ml-auto" />
          </div>

          {/* Collapsed preview — objective gets 2-line clamp, no horizontal clip */}
          {!open && testCase.objective?.trim() && (
            <p
              className="text-[11px] text-ink-secondary leading-relaxed mt-1 break-words"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {testCase.objective}
            </p>
          )}
          {!open && (stepCount > 0 || precCount > 0) && (
            <p className="text-[10px] text-ink-faint font-mono mt-1">
              {stepCount} step{stepCount === 1 ? "" : "s"}
              {precCount > 0 && (
                <>
                  {" · "}
                  {precCount} precondition{precCount === 1 ? "" : "s"}
                </>
              )}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label="Edit case"
          title="Edit case"
          className="g-btn text-[11px] px-2 py-1 inline-flex items-center gap-1 disabled:opacity-40"
        >
          <Pencil size={11} />
          Edit
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 -mt-1 text-[11.5px] text-ink-secondary leading-relaxed break-words">
          {testCase.objective?.trim() && (
            <p className="mb-2 italic text-ink-muted whitespace-pre-wrap">
              {testCase.objective}
            </p>
          )}

          {testCase.preconditions?.length > 0 && (
            <>
              <h4 className="text-[10px] uppercase tracking-wider text-ink-faint font-mono mb-1">
                Preconditions
              </h4>
              <ul className="list-disc pl-4 mb-2">
                {testCase.preconditions.map((p, i) => (
                  <li key={i} className="whitespace-pre-wrap break-words">
                    {p}
                  </li>
                ))}
              </ul>
            </>
          )}

          {testCase.steps?.length > 0 && (
            <>
              <h4 className="text-[10px] uppercase tracking-wider text-ink-faint font-mono mb-1">
                Steps
              </h4>
              <ol className="list-decimal pl-4 space-y-1.5">
                {testCase.steps.map((s, i) => (
                  <li key={s.step_number ?? i} className="break-words">
                    <div className="whitespace-pre-wrap">{s.action}</div>
                    {s.expected_result && (
                      <div className="text-ink-faint whitespace-pre-wrap">
                        → {s.expected_result}
                      </div>
                    )}
                    {s.test_data && (
                      <div className="text-ink-faint text-[10.5px]">
                        data: {s.test_data}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
