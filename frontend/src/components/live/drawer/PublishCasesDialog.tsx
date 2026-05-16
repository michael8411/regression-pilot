/**
 * Phase 06b — modal dialog that drives a publish-to-Jira attempt.
 *
 * Wraps `usePublishLiveCases` and renders the case-set selection / target
 * controls / duplicate confirmation. Once the hook returns a result, the
 * dialog hands off to `PublishResultPanel` for honest outcome rendering.
 *
 * Accessibility:
 *  - Escape closes the dialog unless a publish is in flight.
 *  - The dialog itself receives focus on open.
 *  - The primary CTA is the last interactive element inside the form so
 *    keyboard users can Tab to it directly from the case list.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { AlertTriangle, Loader2, MessageSquare, Send, X } from "@/lib/icons";
import { usePublishLiveCases } from "../hooks/usePublishLiveCases";
import { PublishResultPanel } from "./PublishResultPanel";
import type {
  LiveGeneratedCases,
  LivePublishMode,
} from "@/types/live";
import type { TestCase } from "@/types";

interface Props {
  /** The persisted generated case set being published. */
  draft: LiveGeneratedCases;
  /** Jira ticket key the cases will publish to. */
  ticketKey: string;
  /** Project key used for Zephyr `projectKey`. */
  projectKey: string;
  /** Called when the dialog should close. */
  onClose: () => void;
  /** Called after a successful publish so callers can refresh drafts. */
  onPublished?: () => void;
}

function isAlreadyPublished(status: LiveGeneratedCases["status"]): boolean {
  return (
    status === "exported"
    || status === "partial_export"
    || status === "commented"
  );
}

export function PublishCasesDialog({
  draft,
  ticketKey,
  projectKey,
  onClose,
  onPublished,
}: Props) {
  const cases = useMemo<TestCase[]>(
    () => ((draft.cases as TestCase[] | null) ?? []),
    [draft.cases],
  );
  const allIndexes = useMemo(
    () => cases.map((_, i) => i),
    [cases],
  );
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(allIndexes),
  );
  const [mode, setMode] = useState<LivePublishMode>("linked_test_cases");
  const [fallbackToComment, setFallbackToComment] = useState(true);
  const isDuplicate = isAlreadyPublished(draft.status) || !!draft.exported_at;
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  const publish = usePublishLiveCases({
    onSuccess: () => onPublished?.(),
  });
  const isPublishing = publish.status === "publishing";

  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Lock Esc + body scroll while open. Escape only closes when no publish
  // is in flight so the user can't accidentally abandon a server round-trip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPublishing) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, isPublishing]);

  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === cases.length ? new Set() : new Set(allIndexes),
    );
  }, [cases.length, allIndexes]);

  const canPublish = useMemo(() => {
    if (isPublishing) return false;
    if (selected.size === 0) return false;
    if (isDuplicate && !duplicateConfirmed) return false;
    return true;
  }, [isPublishing, selected.size, isDuplicate, duplicateConfirmed]);

  const handlePublish = useCallback(async () => {
    if (!canPublish) return;
    await publish.publishCases(draft.id, {
      ticket_key: ticketKey,
      project_key: projectKey,
      case_indexes: Array.from(selected).sort((a, b) => a - b),
      mode,
      fallback_to_comment: fallbackToComment,
      folder_id: null,
      confirm_duplicate: isDuplicate ? duplicateConfirmed : false,
    });
  }, [
    canPublish,
    publish,
    draft.id,
    ticketKey,
    projectKey,
    selected,
    mode,
    fallbackToComment,
    isDuplicate,
    duplicateConfirmed,
  ]);

  // The dialog renders into a portal so it always sits above the drawer.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish test cases to Jira"
      onClick={() => {
        if (!isPublishing) onClose();
      }}
      className="fixed inset-0 z-[7800] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "w-[640px] max-w-[94vw] max-h-[88vh] rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col",
          "focus:outline-none",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div>
            <h3 className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
              <Send size={12} className="text-accent" />
              Publish to Jira ticket
            </h3>
            <p className="text-[10.5px] text-ink-faint">
              Source: <span className="font-mono">{ticketKey}</span> ·{" "}
              {cases.length} case{cases.length === 1 ? "" : "s"} in this draft
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            aria-label="Close"
            className="text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex flex-col gap-4">
          {publish.status === "success" && publish.result ? (
            <PublishResultPanel
              ticketKey={ticketKey}
              result={publish.result}
            />
          ) : (
            <>
              {isDuplicate && (
                <DuplicateBanner
                  confirmed={duplicateConfirmed}
                  onConfirmChange={setDuplicateConfirmed}
                />
              )}
              <CaseSelection
                cases={cases}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                disabled={isPublishing}
              />
              <TargetSelector
                mode={mode}
                onModeChange={setMode}
                fallbackToComment={fallbackToComment}
                onFallbackChange={setFallbackToComment}
                disabled={isPublishing}
              />
              {publish.status === "error" && publish.error && (
                <div
                  role="alert"
                  className="text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-3 py-2"
                >
                  {publish.error.message}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-subtle">
          <p className="text-[10.5px] text-ink-faint">
            {publish.status === "success"
              ? "Publish completed."
              : selected.size === 0
                ? "Select at least one case to publish."
                : isDuplicate && !duplicateConfirmed
                  ? "Confirm duplicate before re-publishing."
                  : "Cases will be linked to the source Jira ticket."}
          </p>
          <div className="flex items-center gap-2">
            {publish.status === "success" ? (
              <button
                type="button"
                onClick={onClose}
                className="g-btn-solid text-[12px] px-3"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPublishing}
                  className="g-btn text-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={!canPublish}
                  className={clsx(
                    "g-btn-solid text-[12px] px-3 inline-flex items-center gap-1.5",
                    !canPublish && "opacity-50",
                  )}
                >
                  {isPublishing && (
                    <Loader2 size={11} className="animate-spin" />
                  )}
                  {isPublishing ? "Publishing…" : "Publish to Jira ticket"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function DuplicateBanner({
  confirmed,
  onConfirmChange,
}: {
  confirmed: boolean;
  onConfirmChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-warn/40 bg-warn/[0.08] px-3 py-2.5 flex gap-2">
      <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] font-medium text-ink">
          This set was already published.
        </p>
        <p className="text-[10.5px] text-ink-secondary leading-relaxed mt-0.5">
          Publishing again may create duplicate test cases in Zephyr or a
          duplicate Jira comment. Confirm to proceed.
        </p>
        <label className="mt-2 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmChange(e.target.checked)}
            className="h-3 w-3"
          />
          <span className="text-[11px] text-ink-secondary">
            Yes, publish again
          </span>
        </label>
      </div>
    </div>
  );
}

function CaseSelection({
  cases,
  selected,
  onToggle,
  onToggleAll,
  disabled,
}: {
  cases: TestCase[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-md border border-subtle">
      <header className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-overlay/40">
        <span className="text-[11px] font-semibold text-ink">
          Cases ({selected.size}/{cases.length})
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          disabled={disabled}
          className="text-[11px] text-accent hover:underline disabled:opacity-50"
        >
          {selected.size === cases.length ? "Deselect all" : "Select all"}
        </button>
      </header>
      <ul className="divide-y divide-subtle">
        {cases.map((tc, i) => (
          <li key={i} className="flex items-start gap-2 px-3 py-2">
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => onToggle(i)}
              disabled={disabled}
              aria-label={`Select case ${tc.name ?? `#${i + 1}`}`}
              className="mt-0.5 h-3 w-3"
            />
            <div className="min-w-0">
              <div className="text-[11.5px] text-ink truncate">
                {tc.name ?? `Case ${i + 1}`}
              </div>
              {tc.objective && (
                <div className="text-[10.5px] text-ink-faint truncate">
                  {tc.objective}
                </div>
              )}
            </div>
            {tc.priority && (
              <span className="ml-auto text-[10px] text-ink-muted font-mono uppercase">
                {tc.priority}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TargetSelector({
  mode,
  onModeChange,
  fallbackToComment,
  onFallbackChange,
  disabled,
}: {
  mode: LivePublishMode;
  onModeChange: (next: LivePublishMode) => void;
  fallbackToComment: boolean;
  onFallbackChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-md border border-subtle">
      <header className="px-3 py-2 border-b border-subtle bg-surface-overlay/40">
        <span className="text-[11px] font-semibold text-ink">Target</span>
      </header>
      <fieldset className="flex flex-col gap-2 px-3 py-2.5">
        <label
          className={clsx(
            "flex items-start gap-2 cursor-pointer p-2 rounded-md",
            mode === "linked_test_cases"
              ? "bg-accent/[0.08] border border-accent/30"
              : "border border-subtle",
          )}
        >
          <input
            type="radio"
            name="publish-mode"
            value="linked_test_cases"
            checked={mode === "linked_test_cases"}
            onChange={() => onModeChange("linked_test_cases")}
            disabled={disabled}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-ink">
              Publish as linked test cases on Jira ticket
            </div>
            <div className="text-[10.5px] text-ink-faint">
              Creates Zephyr Scale test cases and links them to the Jira
              issue. Recommended.
            </div>
          </div>
        </label>
        <label
          className={clsx(
            "flex items-start gap-2 cursor-pointer p-2 rounded-md",
            mode === "jira_comment"
              ? "bg-info/[0.08] border border-info/30"
              : "border border-subtle",
          )}
        >
          <input
            type="radio"
            name="publish-mode"
            value="jira_comment"
            checked={mode === "jira_comment"}
            onChange={() => onModeChange("jira_comment")}
            disabled={disabled}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-ink flex items-center gap-1.5">
              <MessageSquare size={11} className="text-info" />
              Post as Jira comment
            </div>
            <div className="text-[10.5px] text-ink-faint">
              Posts a structured comment with the cases. They may not appear
              in the Test Cases panel.
            </div>
          </div>
        </label>

        {mode === "linked_test_cases" && (
          <label className="flex items-center gap-2 px-2 py-1 text-[11px] text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={fallbackToComment}
              onChange={(e) => onFallbackChange(e.target.checked)}
              disabled={disabled}
              className="h-3 w-3"
            />
            Fallback to Jira comment if linked publishing fails
          </label>
        )}
      </fieldset>
    </section>
  );
}
