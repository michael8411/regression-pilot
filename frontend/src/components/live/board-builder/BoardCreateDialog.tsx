import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { X } from "@/lib/icons";
import { useBoardDraft, type BoardDraftPayload } from "./hooks/useBoardDraft";
import { useProjectStatuses } from "./hooks/useProjectStatuses";
import { shouldOpenAdvanced } from "./lib/shouldOpenAdvanced";
import { listJiraComponentsForLive } from "@/components/live/lib/api";
import { QuickStep } from "./steps/QuickStep";
import { AdvancedDisclosure } from "./steps/AdvancedDisclosure";
import { BoardPreviewMini } from "./parts/BoardPreviewMini";
import { BoardScopeWarning } from "./BoardScopeWarning";
import { useBoardPreview } from "./useBoardPreview";
import { type LaneGroupingOption } from "./lib/defaultBoardProfile";
import { deriveDefaultBoardName } from "@/components/live/lib/boardBuilder";
import type { LiveBoard } from "@/types/live";

export type BoardCreateSubmitPayload = BoardDraftPayload;

interface Props {
  initial?: LiveBoard | null;
  defaultProjectKey?: string;
  onClose: () => void;
  onSubmit: (payload: BoardCreateSubmitPayload) => Promise<void>;
}

type ToastKind = "ok" | "warn";

export function BoardCreateDialog({
  initial,
  defaultProjectKey = "FM",
  onClose,
  onSubmit,
}: Props) {
  const statusesHook = useProjectStatuses(
    initial?.profile?.projectKey ?? defaultProjectKey ?? null,
  );
  const draft = useBoardDraft({
    initial,
    defaultProjectKey,
    projectStatuses: statusesHook.statuses,
  });
  const {
    state,
    effectiveJql,
    detectedStatuses,
    setName,
    setProjectKey,
    setVersionName,
    setComponents,
    setSelectedStatuses,
    setAssigneeScope,
    setLaneGrouping,
    setRefreshIntervalSec,
    setPinned,
    setQaStatusMap,
    setCustomJql,
    applyAutoMap,
    buildPayload,
  } = draft;

  const preview = useBoardPreview();
  const [previewSucceeded, setPreviewSucceeded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    shouldOpenAdvanced(initial),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(
    null,
  );
  const advancedRef = useRef<HTMLDivElement | null>(null);

  // Auto-refresh statuses on hook change clears unresolved.
  useEffect(() => {
    setUnresolved((u) =>
      u.filter((s) => state.selectedStatuses.includes(s)),
    );
  }, [state.selectedStatuses]);

  useEffect(() => {
    if (preview.state.kind === "ok") setPreviewSucceeded(true);
  }, [preview.state]);

  useEffect(() => {
    setPreviewSucceeded(false);
  }, [effectiveJql]);

  // Optional components endpoint.
  const [componentOptions, setComponentOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!state.projectKey) {
      setComponentOptions([]);
      return;
    }
    void (async () => {
      try {
        const list = await listJiraComponentsForLive(state.projectKey);
        if (!cancelled) setComponentOptions(list);
      } catch {
        if (!cancelled) setComponentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.projectKey]);

  // Lock Esc + body scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, submitting]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Project-switch confirm: only when user has Advanced edits.
  const initialProjectRef = useRef(state.projectKey);
  const onProjectChange = useCallback(
    (next: string) => {
      if (next === state.projectKey) return;
      const hasManualEdits =
        state.customJql ||
        state.qaStatusMap.ready.length +
          state.qaStatusMap.testing.length +
          state.qaStatusMap.done.length >
          0;
      if (
        hasManualEdits &&
        state.projectKey &&
        state.projectKey !== initialProjectRef.current
      ) {
        const ok = window.confirm(
          "Switching project will reset your status selections. Continue?",
        );
        if (!ok) return;
      }
      setProjectKey(next);
    },
    [state, setProjectKey],
  );

  const onAutoMap = useCallback(() => {
    const out = applyAutoMap();
    setUnresolved(out.unresolved);
    if (out.idempotent) {
      setToast({ text: "All statuses already classified.", kind: "ok" });
    } else if (out.unresolved.length > 0) {
      setToast({
        text: `Mapped ${out.changedCount} statuses. ${out.unresolved.length} need your input.`,
        kind: "warn",
      });
    } else {
      setToast({
        text: `Mapped ${out.changedCount} statuses.`,
        kind: "ok",
      });
    }
  }, [applyAutoMap]);

  const onToggleStatus = useCallback(
    (name: string) => {
      const next = new Set(state.selectedStatuses);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelectedStatuses(Array.from(next));
    },
    [state.selectedStatuses, setSelectedStatuses],
  );

  const onCustomize = useCallback(() => {
    setAdvancedOpen(true);
    setTimeout(() => {
      advancedRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }, []);

  // Validation + Save reason.
  const hasReadyOrTesting =
    state.qaStatusMap.ready.length + state.qaStatusMap.testing.length > 0;
  const saveDisabledReason = useMemo<string | null>(() => {
    if (!state.name.trim()) return "Enter a board name.";
    if (!state.projectKey) return "Pick a project.";
    if (statusesHook.error) return "Resolve the project status error.";
    if (!previewSucceeded) return "Run a preview to enable save.";
    if (!hasReadyOrTesting) {
      return "Map at least one Ready or Testing status.";
    }
    if (advancedOpen && unresolved.length > 0) {
      return `Resolve ${unresolved.length} unmapped status${
        unresolved.length === 1 ? "" : "es"
      }.`;
    }
    return null;
  }, [
    state.name,
    state.projectKey,
    statusesHook.error,
    previewSucceeded,
    hasReadyOrTesting,
    advancedOpen,
    unresolved,
  ]);

  const handleSubmit = useCallback(async () => {
    if (saveDisabledReason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(buildPayload());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save board");
    } finally {
      setSubmitting(false);
    }
  }, [saveDisabledReason, submitting, onSubmit, buildPayload, onClose]);

  const suggestedName = deriveDefaultBoardName(
    state.projectKey,
    state.versionName,
  );

  const resolveLaneOption = (
    lane: LaneGroupingOption,
  ): LaneGroupingOption => lane;

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
        className={clsx(
          "w-[760px] max-w-[94vw] max-h-[88vh] rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">
              {initial ? "Edit board" : "New board"}
            </h3>
            <p className="text-[10.5px] text-ink-faint">
              Quick setup. Advanced options when you need them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={13} />
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 px-4 py-4 overflow-y-auto">
          <div className="flex flex-col gap-4 min-w-0">
            <QuickStep
              name={state.name}
              projectKey={state.projectKey}
              versionName={state.versionName}
              pinned={state.pinned}
              suggestedName={suggestedName}
              selectedCount={state.selectedStatuses.length}
              totalStatuses={statusesHook.statuses.length}
              statusesLoading={statusesHook.loading}
              statusesError={statusesHook.error}
              onNameChange={setName}
              onProjectChange={onProjectChange}
              onVersionChange={setVersionName}
              onPinnedChange={setPinned}
              onCustomize={onCustomize}
              onRetryStatuses={statusesHook.retry}
            />

            <AdvancedDisclosure
              ref={advancedRef}
              open={advancedOpen}
              onToggle={() => setAdvancedOpen((v) => !v)}
              projectKey={state.projectKey}
              projectStatuses={statusesHook.statuses}
              statusesLoading={statusesHook.loading}
              statusesError={statusesHook.error}
              onRetryStatuses={statusesHook.retry}
              selectedStatuses={state.selectedStatuses}
              onToggleStatus={onToggleStatus}
              qaStatusMap={state.qaStatusMap}
              qaUnresolved={unresolved}
              onQaStatusMapChange={setQaStatusMap}
              onAutoMap={onAutoMap}
              laneGrouping={resolveLaneOption(state.laneGrouping)}
              onLaneGroupingChange={setLaneGrouping}
              componentOptions={componentOptions}
              components={state.components}
              onComponentsChange={setComponents}
              assigneeScope={state.assigneeScope}
              onAssigneeScopeChange={setAssigneeScope}
              refreshIntervalSec={state.refreshIntervalSec}
              onRefreshIntervalChange={setRefreshIntervalSec}
              effectiveJql={effectiveJql}
              autoJql={effectiveJql}
              customJql={state.customJql}
              onJqlChange={setCustomJql}
            />
          </div>

          <aside className="flex flex-col gap-3 min-w-0 lg:sticky lg:top-0 lg:self-start">
            <BoardPreviewMini
              state={preview.state}
              effectiveJql={effectiveJql}
              onRun={() => void preview.run(effectiveJql)}
              selectedStatuses={state.selectedStatuses}
            />
            <section className="rounded-md border border-subtle bg-surface-overlay/40 px-3 py-2.5">
              <h4 className="text-[11px] font-semibold text-ink mb-1">
                Effective JQL
              </h4>
              <code className="block text-[10.5px] font-mono text-ink-muted whitespace-pre-wrap break-words">
                {effectiveJql || "(empty)"}
              </code>
            </section>
            <BoardScopeWarning
              previewState={preview.state}
              jql={effectiveJql}
              hasNarrowingFilter={
                !!state.versionName ||
                state.components.length > 0 ||
                state.assigneeScope === "currentUser"
              }
              onGroupByEpic={() => setLaneGrouping("epic")}
            />
            {detectedStatuses.length > 0 && advancedOpen && (
              <p className="text-[10px] text-ink-faint">
                {detectedStatuses.length} status
                {detectedStatuses.length === 1 ? "" : "es"} discovered.
              </p>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-subtle">
          <p className="text-[10.5px] text-ink-faint">
            {saveDisabledReason ?? "Preview verified. You can save."}
          </p>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-[11.5px] text-err truncate max-w-[260px]">
                {error}
              </span>
            )}
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
              disabled={!!saveDisabledReason || submitting}
              className={clsx(
                "g-btn-solid text-[12px] px-3",
                (!!saveDisabledReason || submitting) && "opacity-50",
              )}
              title={saveDisabledReason ?? undefined}
            >
              {submitting
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Create board"}
            </button>
          </div>
        </footer>

        {toast && (
          <div
            role="status"
            className={clsx(
              "absolute bottom-16 right-4 px-3 py-2 rounded-md border text-[11.5px]",
              toast.kind === "warn"
                ? "bg-warn/10 border-warn/30 text-warn"
                : "bg-ok/10 border-ok/30 text-ok",
            )}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
