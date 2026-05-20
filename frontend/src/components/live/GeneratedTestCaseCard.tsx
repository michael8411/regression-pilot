import { useState } from "react";
import { ChevronDown, ChevronRight } from "@/lib/icons";
import { PriorityPill } from "./visual";
import type { TestCase } from "@/types";

interface Props {
  testCase: TestCase;
  index: number;
}

export function GeneratedTestCaseCard({ testCase, index }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-subtle bg-surface-elevated">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="text-[10.5px] text-ink-faint font-mono">
          #{index + 1}
        </span>
        <span className="text-[12px] text-ink truncate font-medium">
          {testCase.name}
        </span>
        <PriorityPill priority={testCase.priority} className="ml-auto" />
      </button>
      {open && (
        <div className="px-3 pb-3 text-[11.5px] text-ink-secondary leading-relaxed">
          {testCase.objective && (
            <p className="mb-2 italic text-ink-muted">{testCase.objective}</p>
          )}
          {testCase.preconditions?.length > 0 && (
            <>
              <h4 className="text-[10.5px] uppercase tracking-wide text-ink-faint mb-1">
                Preconditions
              </h4>
              <ul className="list-disc pl-4 mb-2">
                {testCase.preconditions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {testCase.steps?.length > 0 && (
            <>
              <h4 className="text-[10.5px] uppercase tracking-wide text-ink-faint mb-1">
                Steps
              </h4>
              <ol className="list-decimal pl-4">
                {testCase.steps.map((s) => (
                  <li key={s.step_number} className="mb-1.5">
                    <div>{s.action}</div>
                    <div className="text-ink-faint">→ {s.expected_result}</div>
                    {s.test_data && (
                      <div className="text-ink-faint">data: {s.test_data}</div>
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
