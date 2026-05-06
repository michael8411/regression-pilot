import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { X } from "@/lib/icons";
import {
  JQL_PRESETS,
  applyPreset,
  isValidJql,
} from "@/components/live/lib/jql";
import type { LiveBoard } from "@/types/live";

interface Props {
  /** When set, dialog is in edit mode and pre-fills with these values. */
  initial?: LiveBoard | null;
  defaultProjectKey?: string;
  onClose: () => void;
  onSubmit: (body: {
    name: string;
    jql: string;
    columns?: string[];
  }) => Promise<void>;
}

const DEFAULT_COLUMNS = ["To Do", "In Progress", "In Review", "Done"];

export function BoardCreateDialog({
  initial,
  defaultProjectKey = "FM",
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [jql, setJql] = useState(initial?.jql ?? "");
  const [columnsText, setColumnsText] = useState(
    (initial?.columns ?? DEFAULT_COLUMNS).join(", "),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(
    () =>
      columnsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [columnsText],
  );

  const valid = name.trim().length > 0 && isValidJql(jql);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        jql: jql.trim(),
        columns: columns.length > 0 ? columns : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save board");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit board" : "New board"}
      onClick={onClose}
      className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h3 className="text-[13px] font-semibold text-ink">
            {initial ? "Edit board" : "New board"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="g-input w-full text-[12.5px]"
              placeholder="FM 25.7 in QA"
            />
          </Field>

          <Field label="JQL">
            <textarea
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              rows={3}
              className="g-input w-full text-[12px] font-mono resize-none"
              placeholder='project = FM AND status in ("In Progress", "In Review")'
            />
          </Field>

          <Field label="Quick presets">
            <div className="flex flex-wrap gap-1.5">
              {JQL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setJql(applyPreset(p, defaultProjectKey))}
                  className="px-2 py-1 rounded-md border border-subtle text-[11px] text-ink-secondary hover:border-accent/[0.25] hover:text-ink"
                  title={p.description}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Columns (comma separated)">
            <input
              value={columnsText}
              onChange={(e) => setColumnsText(e.target.value)}
              className="g-input w-full text-[12px]"
            />
            <p className="mt-1 text-[10.5px] text-ink-faint">
              Status names that match Jira workflow values. Order is
              left-to-right.
            </p>
          </Field>

          {error && (
            <div className="text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-2 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="g-btn text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!valid || submitting}
            className={clsx(
              "g-btn-solid text-[12px] px-3",
              !valid && "opacity-30",
            )}
          >
            {submitting
              ? "Saving…"
              : initial
                ? "Save changes"
                : "Create board"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-[11.5px] text-ink-muted mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
