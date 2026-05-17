/**
 * Phase 06c — single-case editor dialog.
 *
 * Edits one generated case (title, priority, objective, preconditions,
 * ordered steps) and hands the updated object back via `onSave`. The
 * parent is responsible for calling `useLiveGeneratedCases.patchCase`
 * so siblings remain untouched on the server.
 *
 * Validation:
 *  - title required,
 *  - at least one step with a non-empty action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { Loader2, Plus, Trash2, X } from "@/lib/icons";
import { PriorityPill } from "@/components/live/visual";
import type { TestCase, TestStep } from "@/types";

interface Props {
  testCase: TestCase;
  index: number;
  onClose: () => void;
  onSave: (next: TestCase) => Promise<unknown>;
}

type PriorityValue = TestCase["priority"];
const PRIORITY_OPTIONS: PriorityValue[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

function cloneCase(tc: TestCase): TestCase {
  return {
    name: tc.name ?? "",
    objective: tc.objective ?? "",
    preconditions: [...(tc.preconditions ?? [])],
    priority: tc.priority ?? "Medium",
    labels: [...(tc.labels ?? [])],
    steps: (tc.steps ?? []).map((s, i) => ({
      step_number: s.step_number ?? i + 1,
      action: s.action ?? "",
      expected_result: s.expected_result ?? "",
      test_data: s.test_data,
    })),
  };
}

export function GeneratedCaseEditorDialog({
  testCase,
  index,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<TestCase>(() => cloneCase(testCase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Lock background scroll + Esc to close (when not saving).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving]);

  const update = useCallback(
    <K extends keyof TestCase>(key: K, value: TestCase[K]) => {
      setDraft((d) => ({ ...d, [key]: value }));
    },
    [],
  );

  const updatePrecondition = useCallback(
    (i: number, next: string) => {
      setDraft((d) => {
        const list = [...(d.preconditions ?? [])];
        list[i] = next;
        return { ...d, preconditions: list };
      });
    },
    [],
  );

  const addPrecondition = useCallback(() => {
    setDraft((d) => ({
      ...d,
      preconditions: [...(d.preconditions ?? []), ""],
    }));
  }, []);

  const removePrecondition = useCallback((i: number) => {
    setDraft((d) => {
      const list = [...(d.preconditions ?? [])];
      list.splice(i, 1);
      return { ...d, preconditions: list };
    });
  }, []);

  const updateStep = useCallback(
    (i: number, patch: Partial<TestStep>) => {
      setDraft((d) => {
        const steps = [...(d.steps ?? [])];
        steps[i] = { ...steps[i], ...patch };
        return { ...d, steps };
      });
    },
    [],
  );

  const addStep = useCallback(() => {
    setDraft((d) => {
      const steps = [...(d.steps ?? [])];
      steps.push({
        step_number: steps.length + 1,
        action: "",
        expected_result: "",
      });
      return { ...d, steps };
    });
  }, []);

  const removeStep = useCallback((i: number) => {
    setDraft((d) => {
      const steps = [...(d.steps ?? [])];
      steps.splice(i, 1);
      steps.forEach((s, idx) => (s.step_number = idx + 1));
      return { ...d, steps };
    });
  }, []);

  const validationError = useMemo<string | null>(() => {
    if (!draft.name?.trim()) return "Title is required.";
    const stepsWithAction = (draft.steps ?? []).filter((s) =>
      (s.action ?? "").trim(),
    );
    if (stepsWithAction.length === 0)
      return "At least one step with an action is required.";
    return null;
  }, [draft]);

  const handleSave = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Normalize: trim title, drop empty preconditions, renumber steps.
      const normalized: TestCase = {
        ...draft,
        name: draft.name.trim(),
        objective: (draft.objective ?? "").trim(),
        preconditions: (draft.preconditions ?? [])
          .map((p) => (p ?? "").trim())
          .filter(Boolean),
        steps: (draft.steps ?? [])
          .filter((s) => (s.action ?? "").trim())
          .map((s, i) => ({
            step_number: i + 1,
            action: (s.action ?? "").trim(),
            expected_result: (s.expected_result ?? "").trim(),
            test_data: s.test_data,
          })),
      };
      await onSave(normalized);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to save case";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, onClose, validationError]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit case ${index + 1}`}
      onClick={() => {
        if (!saving) onClose();
      }}
      className="fixed inset-0 z-[7900] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "w-[640px] max-w-[94vw] max-h-[90vh] rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col",
          "focus:outline-none",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Edit case #{index + 1}
            </h3>
            <PriorityPill priority={draft.priority} />
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex flex-col gap-3">
          <Field label="Title">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              disabled={saving}
              className="g-input w-full text-[12px]"
              placeholder="Case title"
            />
          </Field>

          <Field label="Priority">
            <select
              value={draft.priority}
              onChange={(e) =>
                update("priority", e.target.value as PriorityValue)
              }
              disabled={saving}
              className="g-input text-[12px]"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Objective">
            <textarea
              value={draft.objective ?? ""}
              onChange={(e) => update("objective", e.target.value)}
              disabled={saving}
              rows={3}
              className="g-input w-full text-[12px] resize-none min-h-[64px]"
              placeholder="What this case verifies"
            />
          </Field>

          <Field
            label="Preconditions"
            action={
              <button
                type="button"
                onClick={addPrecondition}
                disabled={saving}
                className="g-btn text-[11px] px-2 py-1 inline-flex items-center gap-1"
              >
                <Plus size={11} /> Add
              </button>
            }
          >
            {(draft.preconditions ?? []).length === 0 ? (
              <p className="text-[11px] text-ink-faint italic">
                No preconditions.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(draft.preconditions ?? []).map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[10px] text-ink-faint font-mono mt-2">
                      •
                    </span>
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => updatePrecondition(i, e.target.value)}
                      disabled={saving}
                      className="g-input flex-1 text-[12px]"
                    />
                    <button
                      type="button"
                      aria-label={`Remove precondition ${i + 1}`}
                      onClick={() => removePrecondition(i)}
                      disabled={saving}
                      className="w-7 h-7 inline-flex items-center justify-center text-ink-muted hover:text-err"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field
            label="Steps"
            action={
              <button
                type="button"
                onClick={addStep}
                disabled={saving}
                className="g-btn text-[11px] px-2 py-1 inline-flex items-center gap-1"
              >
                <Plus size={11} /> Add step
              </button>
            }
          >
            <ol className="flex flex-col gap-2">
              {(draft.steps ?? []).map((step, i) => (
                <li
                  key={i}
                  className="rounded-md border border-subtle bg-surface-overlay/40 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-ink-faint font-mono">
                      Step {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      disabled={saving}
                      aria-label={`Remove step ${i + 1}`}
                      className="ml-auto text-ink-muted hover:text-err"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">
                        Action
                      </span>
                      <textarea
                        value={step.action ?? ""}
                        onChange={(e) =>
                          updateStep(i, { action: e.target.value })
                        }
                        disabled={saving}
                        rows={2}
                        className="g-input text-[12px] resize-none min-h-[44px]"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">
                        Expected result
                      </span>
                      <textarea
                        value={step.expected_result ?? ""}
                        onChange={(e) =>
                          updateStep(i, { expected_result: e.target.value })
                        }
                        disabled={saving}
                        rows={2}
                        className="g-input text-[12px] resize-none min-h-[44px]"
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          </Field>

          {error && (
            <div
              role="alert"
              className="text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-2 py-1.5"
            >
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-subtle">
          <p className="text-[10.5px] text-ink-faint">
            {validationError ?? "Changes save to the stored draft."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="g-btn text-[12px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !!validationError}
              className={clsx(
                "g-btn-solid text-[12px] px-3 inline-flex items-center gap-1.5",
                (saving || !!validationError) && "opacity-50",
              )}
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              {saving ? "Saving…" : "Save case"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">
          {label}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}
