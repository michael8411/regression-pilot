/**
 * Phase 06b / 06c — modal dialog that drives a publish-to-Jira attempt.
 *
 * Phase 06c product rule: Live publishes target the Jira ticket's
 * `Test Cases` custom field by default. Posting as a Jira comment is the
 * optional fallback path. Linked Zephyr test cases are not surfaced as a
 * selectable option here.
 *
 * Accessibility:
 *  - Escape closes the dialog unless a publish is in flight.
 *  - The dialog itself receives focus on open.
 *  - The primary CTA copy matches the chosen publish target.
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
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "@/lib/icons";
import { usePublishLiveCases } from "../hooks/usePublishLiveCases";
import { PublishResultPanel } from "./PublishResultPanel";
import { PriorityPill } from "@/components/live/visual";
import { formatJiraCommentBody } from "../lib/jiraCommentFormatter";
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
  /** Project key (kept for parity with the linked-tests legacy path). */
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
  const allIndexes = useMemo(() => cases.map((_, i) => i), [cases]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(allIndexes),
  );
  // Phase 06c — Live Testing default is `jira_test_cases_field`.
  const [mode, setMode] = useState<LivePublishMode>("jira_test_cases_field");
  const [fallbackToComment, setFallbackToComment] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isDuplicate = isAlreadyPublished(draft.status) || !!draft.exported_at;
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  const publish = usePublishLiveCases({
    onSuccess: () => onPublished?.(),
  });
  const isPublishing = publish.status === "publishing";
  const isCommentMode = mode === "jira_comment";
  const isFieldMode = mode === "jira_test_cases_field";

  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Lock Esc + body scroll while open. Escape only closes when no publish
  // is in flight so the user can't accidentally abandon a server round-trip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPublishing) onClose();
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

  const selectedCases = useMemo(
    () =>
      Array.from(selected)
        .sort((a, b) => a - b)
        .map((i) => cases[i])
        .filter((c): c is TestCase => Boolean(c)),
    [selected, cases],
  );

  // Frontend-rendered preview is the source of truth for the posted body.
  const body = useMemo(
    () => formatJiraCommentBody({ ticketKey, cases: selectedCases }),
    [ticketKey, selectedCases],
  );

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
      // Field-write failures should always have a comment fallback
      // available; the customer can opt out via the advanced toggle.
      fallback_to_comment: isFieldMode ? fallbackToComment : false,
      folder_id: null,
      confirm_duplicate: isDuplicate ? duplicateConfirmed : false,
      body,
    });
  }, [
    canPublish,
    publish,
    draft.id,
    ticketKey,
    projectKey,
    selected,
    mode,
    isFieldMode,
    fallbackToComment,
    isDuplicate,
    duplicateConfirmed,
    body,
  ]);

  const primaryCta = isFieldMode
    ? "Post test cases to Jira"
    : isCommentMode
      ? "Post as Jira comment"
      : "Publish";

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
              {isCommentMode ? (
                <MessageSquare size={12} className="text-info" />
              ) : (
                <Send size={12} className="text-accent" />
              )}
              {isCommentMode
                ? "Post test cases as Jira comment"
                : "Post test cases to Jira"}
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

              <ContentPreview
                body={body}
                emptySelection={selected.size === 0}
                mode={mode}
              />

              {isFieldMode && (
                <FieldFallbackOption
                  fallback={fallbackToComment}
                  onChange={setFallbackToComment}
                  disabled={isPublishing}
                />
              )}

              <AdvancedSection
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((v) => !v)}
                mode={mode}
                onModeChange={setMode}
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
                  : isFieldMode
                    ? "Updates the ticket's Test Cases field."
                    : isCommentMode
                      ? "Posts into the ticket's comments."
                      : "Cases will be published to Jira."}
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
                  {isPublishing ? "Publishing…" : primaryCta}
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
          Publishing again may overwrite the Jira Test Cases field or post a
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
              className="mt-1 h-3 w-3"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-ink truncate">
                {tc.name ?? `Case ${i + 1}`}
              </div>
              {tc.objective && (
                <div className="text-[10.5px] text-ink-faint truncate">
                  {tc.objective}
                </div>
              )}
            </div>
            <PriorityPill priority={tc.priority} className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContentPreview({
  body,
  emptySelection,
  mode,
}: {
  body: string;
  emptySelection: boolean;
  mode: LivePublishMode;
}) {
  const heading =
    mode === "jira_comment"
      ? "Jira comment preview"
      : "Jira Test Cases content preview";
  return (
    <section className="rounded-md border border-subtle">
      <header className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-overlay/40">
        <span className="text-[11px] font-semibold text-ink flex items-center gap-1.5">
          {mode === "jira_comment" ? (
            <MessageSquare size={11} className="text-info" />
          ) : (
            <Send size={11} className="text-accent" />
          )}
          {heading}
        </span>
        <span className="text-[10px] font-mono text-ink-faint uppercase tracking-wider">
          posted verbatim
        </span>
      </header>
      <pre
        className="text-[11px] font-mono text-ink-secondary whitespace-pre-wrap break-words p-3 max-h-[240px] overflow-y-auto"
        style={{ background: "var(--surface-sunken, transparent)" }}
      >
        {emptySelection ? "Select cases above to preview the content." : body}
      </pre>
    </section>
  );
}

function FieldFallbackOption({
  fallback,
  onChange,
  disabled,
}: {
  fallback: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-md border border-subtle px-3 py-2.5">
      <label className="flex items-center gap-2 cursor-pointer text-[11.5px] text-ink-secondary">
        <input
          type="checkbox"
          checked={fallback}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-3 w-3"
        />
        Fall back to Jira comment if the Test Cases field write fails
      </label>
    </section>
  );
}

function AdvancedSection({
  open,
  onToggle,
  mode,
  onModeChange,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  mode: LivePublishMode;
  onModeChange: (next: LivePublishMode) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-md border border-subtle">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-subtle text-left bg-surface-overlay/40"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="text-[11px] font-semibold text-ink">
          Publish target
        </span>
        <span className="ml-auto text-[10px] font-mono text-ink-faint uppercase tracking-wider">
          {mode === "jira_test_cases_field"
            ? "Test Cases field (default)"
            : mode === "jira_comment"
              ? "Comment"
              : "Linked tests"}
        </span>
      </button>
      {open && (
        <fieldset className="flex flex-col gap-2 px-3 py-2.5">
          <ModeRadio
            value="jira_test_cases_field"
            current={mode}
            onChange={onModeChange}
            disabled={disabled}
            tone="accent"
            icon={<Send size={11} className="text-accent" />}
            title="Update the ticket's Test Cases field"
            recommended
            description="Writes the formatted cases into the Jira Test Cases custom field. This is the standard Live Testing path."
          />
          <ModeRadio
            value="jira_comment"
            current={mode}
            onChange={onModeChange}
            disabled={disabled}
            tone="info"
            icon={<MessageSquare size={11} className="text-info" />}
            title="Post as Jira comment"
            description="Adds a structured comment to the ticket instead of editing the Test Cases field."
          />
        </fieldset>
      )}
    </section>
  );
}

function ModeRadio({
  value,
  current,
  onChange,
  disabled,
  tone,
  icon,
  title,
  description,
  recommended,
}: {
  value: LivePublishMode;
  current: LivePublishMode;
  onChange: (next: LivePublishMode) => void;
  disabled: boolean;
  tone: "accent" | "info";
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
}) {
  const selected = current === value;
  return (
    <label
      className={clsx(
        "flex items-start gap-2 cursor-pointer p-2 rounded-md",
        selected
          ? tone === "accent"
            ? "bg-accent/[0.08] border border-accent/30"
            : "bg-info/[0.08] border border-info/30"
          : "border border-subtle",
      )}
    >
      <input
        type="radio"
        name="publish-mode"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-ink flex items-center gap-1.5">
          {icon}
          {title}
          {recommended && (
            <span
              className={clsx(
                "text-[9px] font-mono uppercase tracking-wider ml-1 inline-flex items-center gap-0.5",
                tone === "accent" ? "text-accent" : "text-info",
              )}
            >
              <CheckCircle2 size={9} />
              Recommended
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-ink-faint">{description}</div>
      </div>
    </label>
  );
}
