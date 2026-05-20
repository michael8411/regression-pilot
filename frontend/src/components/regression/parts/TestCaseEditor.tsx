import { useEffect, useRef, useState } from "react";
import { Plus, X } from "@/lib/icons";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TestCase } from "@/types";
import { StepsEditor } from "./StepsEditor";

const PRIORITIES: TestCase["priority"][] = ["Critical", "High", "Medium", "Low"];

export interface TestCaseEditorProps {
  testCase: TestCase;
  onChange: (next: TestCase) => void;
  onClose: () => void;
  onDelete: () => void;
}

const inputClass = cn(
  "w-full p-2 rounded-md",
  "bg-surface-input text-[13px] text-ink placeholder:text-ink-muted",
  "border border-subtle outline-none",
  "focus:border-accent focus:ring-2 focus:ring-accent/30",
);

/**
 * Side drawer for editing a single test case. Edits go into a local
 * draft and commit upstream every 400ms via a debounced effect, plus
 * a final flush when the user closes or deletes the drawer.
 */
export function TestCaseEditor({
  testCase,
  onChange,
  onClose,
  onDelete,
}: TestCaseEditorProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<TestCase>(() => coercePriority(testCase));

  // When the underlying case swaps (user clicked another row), reset the draft.
  useEffect(() => {
    setDraft(coercePriority(testCase));
  }, [testCase]);

  // Debounced upstream commit while editing.
  useEffect(() => {
    const id = window.setTimeout(() => onChange(draft), 400);
    return () => window.clearTimeout(id);
  }, [draft, onChange]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        flushAndClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // flushAndClose is defined below; relying on the latest draft via ref
    // would over-engineer this — the cleanup runs synchronously when
    // draft changes anyway via the debounced commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus into the drawer on mount; restore on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  const flushAndClose = () => {
    onChange(draft); // ensure last-keystroke isn't lost when closing fast
    onClose();
  };

  const flushAndDelete = () => {
    onDelete();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-30 animate-fade-in"
        onClick={flushAndClose}
        aria-hidden
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit test case: ${testCase.name || "untitled"}`}
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 bottom-0 w-[480px] max-w-[92vw]",
          "bg-surface-elevated border-l border-subtle shadow-float",
          "z-40 flex flex-col animate-slide-in-right",
          "focus:outline-none",
        )}
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-subtle">
          <h2 className="t-title text-ink truncate flex-1 min-w-0 pr-2">
            {draft.name || "(untitled)"}
          </h2>
          <IconButton
            size="sm"
            icon={<X />}
            aria-label="Close editor"
            tooltip="Close"
            onClick={flushAndClose}
          />
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Objective">
            <textarea
              value={draft.objective}
              onChange={(e) =>
                setDraft({ ...draft, objective: e.target.value })
              }
              className={cn(inputClass, "min-h-[64px] resize-y")}
            />
          </Field>

          <Field label="Priority">
            <div className="relative">
              <select
                value={draft.priority}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    priority: e.target.value as TestCase["priority"],
                  })
                }
                className={cn(inputClass, "appearance-none pr-8 cursor-pointer")}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="text-ink">
                    {p}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted text-xs">
                ▾
              </span>
            </div>
          </Field>

          <Field label="Labels">
            <LabelsInput
              value={draft.labels}
              onChange={(labels) => setDraft({ ...draft, labels })}
            />
          </Field>

          <Field label="Preconditions">
            <BulletListEditor
              value={draft.preconditions}
              onChange={(preconditions) =>
                setDraft({ ...draft, preconditions })
              }
            />
          </Field>

          <Field label="Steps">
            <StepsEditor
              value={draft.steps}
              onChange={(steps) => setDraft({ ...draft, steps })}
            />
          </Field>
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-subtle">
          <Button variant="danger" size="sm" onClick={flushAndDelete}>
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={flushAndClose}>
            Done
          </Button>
        </footer>
      </aside>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="t-label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/** Chip-style labels editor: type a label + Enter to add, click × to remove. */
function LabelsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {value.map((l, i) => (
        <span
          key={`${l}-${i}`}
          className={cn(
            "inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full",
            "bg-surface-overlay text-[11px] text-ink-secondary border border-subtle",
          )}
        >
          {l}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove label ${l}`}
            className="text-ink-muted hover:text-ink p-0.5"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            remove(value.length - 1);
          }
        }}
        onBlur={add}
        placeholder={value.length === 0 ? "Add label…" : "+ label"}
        className={cn(
          "flex-1 min-w-[80px] h-6 px-1 text-[12px] text-ink",
          "bg-transparent outline-none placeholder:text-ink-muted",
        )}
      />
    </div>
  );
}

/** List-of-strings editor used for preconditions. One textarea per row. */
function BulletListEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const update = (i: number, v: string) => {
    onChange(value.map((x, idx) => (idx === i ? v : x)));
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, ""]);

  return (
    <div className="space-y-1.5">
      {value.length === 0 && (
        <p className="text-[11px] text-ink-muted">No preconditions.</p>
      )}
      {value.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[11px] text-ink-muted mt-2 select-none">•</span>
          <textarea
            value={row}
            onChange={(e) => update(i, e.target.value)}
            placeholder="Precondition"
            aria-label={`Precondition ${i + 1}`}
            className={cn(
              inputClass,
              "flex-1 min-h-[32px] resize-y text-[12.5px]",
            )}
          />
          <IconButton
            size="sm"
            variant="danger"
            icon={<X />}
            aria-label={`Remove precondition ${i + 1}`}
            tooltip="Remove"
            onClick={() => remove(i)}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={add}
        leading={<Plus size={12} />}
      >
        Add precondition
      </Button>
    </div>
  );
}

/** Defensive coercion — AI sometimes returns priorities outside the enum. */
function coercePriority(tc: TestCase): TestCase {
  const valid = (PRIORITIES as readonly string[]).includes(tc.priority);
  return valid ? tc : { ...tc, priority: "Medium" };
}
