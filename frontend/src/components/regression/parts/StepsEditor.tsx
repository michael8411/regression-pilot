import { Button, IconButton } from "@/components/ui";
import { Plus, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/cn";
import type { TestStep } from "@/types";

export interface StepsEditorProps {
  value: TestStep[];
  onChange: (steps: TestStep[]) => void;
}

/**
 * Editor for the steps of a single test case. Each step exposes an
 * action textarea, an expected-result textarea, and an opt-in test_data
 * field. Reordering is out of scope for 4e — Phase 11 polish.
 */
export function StepsEditor({ value, onChange }: StepsEditorProps) {
  const update = (i: number, patch: Partial<TestStep>) => {
    const next = value.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };

  const remove = (i: number) => {
    const next = value
      .filter((_, idx) => idx !== i)
      .map((s, j) => ({ ...s, step_number: j + 1 }));
    onChange(next);
  };

  const add = () => {
    onChange([
      ...value,
      {
        step_number: value.length + 1,
        action: "",
        expected_result: "",
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {value.map((step, i) => (
        <div
          key={i}
          className="rounded-md border border-subtle bg-surface-elevated p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-muted tabular-nums">
              Step {step.step_number}
            </span>
            <IconButton
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              aria-label={`Delete step ${step.step_number}`}
              tooltip="Delete step"
              onClick={() => remove(i)}
              className="ml-auto"
            />
          </div>
          <textarea
            value={step.action}
            placeholder="Action"
            aria-label={`Action for step ${step.step_number}`}
            onChange={(e) => update(i, { action: e.target.value })}
            className={cn(
              "w-full min-h-[40px] resize-y p-2 rounded-md",
              "bg-surface-input text-[12.5px] text-ink placeholder:text-ink-muted",
              "border border-subtle outline-none",
              "focus:border-accent focus:ring-2 focus:ring-accent/30",
            )}
          />
          <textarea
            value={step.expected_result}
            placeholder="Expected result"
            aria-label={`Expected result for step ${step.step_number}`}
            onChange={(e) => update(i, { expected_result: e.target.value })}
            className={cn(
              "w-full min-h-[40px] resize-y p-2 rounded-md",
              "bg-surface-input text-[12.5px] text-ink placeholder:text-ink-muted",
              "border border-subtle outline-none",
              "focus:border-accent focus:ring-2 focus:ring-accent/30",
            )}
          />
          {step.test_data !== undefined ? (
            <textarea
              value={step.test_data}
              placeholder="Test data"
              aria-label={`Test data for step ${step.step_number}`}
              onChange={(e) => update(i, { test_data: e.target.value })}
              className={cn(
                "w-full min-h-[36px] resize-y p-2 rounded-md",
                "bg-surface-input text-[12.5px] text-ink placeholder:text-ink-muted",
                "border border-subtle outline-none",
                "focus:border-accent focus:ring-2 focus:ring-accent/30",
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => update(i, { test_data: "" })}
              className="text-[11px] text-accent-text hover:text-accent transition-colors"
            >
              + Add test data
            </button>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={add}
        leading={<Plus size={12} />}
      >
        Add step
      </Button>
    </div>
  );
}
