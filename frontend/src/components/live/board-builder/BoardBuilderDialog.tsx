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
import {
  buildJqlFromSimpleDraft,
  deriveDefaultBoardName,
  validateBuilderDraft,
} from "@/components/live/lib/boardBuilder";
import {
  DEFAULT_BUILDER_VIEW_PREFS,
  DEFAULT_QA_STATUS_MAP,
  DEFAULT_REFRESH_INTERVAL_SEC,
  type LiveBoardBuilderSimpleDraft,
} from "@/components/live/types";
import type {
  LiveBoard,
  LiveBoardProfile,
  LiveBoardQaStatusMap,
  LiveBoardViewPreferences,
} from "@/types/live";
import { SimpleBuilderStep } from "./SimpleBuilderStep";
import { StructureMappingStep } from "./StructureMappingStep";
import { AdvancedJqlSection } from "./AdvancedJqlSection";
import { BuilderPreviewPanel } from "./BuilderPreviewPanel";
import {
  summarizeStatuses,
  useBoardPreview,
} from "./useBoardPreview";

export interface BoardBuilderSubmitPayload {
  name: string;
  jql: string;
  columns: string[];
  profile: LiveBoardProfile;
  view_prefs: LiveBoardViewPreferences;
  pinned: boolean;
}

interface Props {
  /** When provided, dialog opens in edit mode. */
  initial?: LiveBoard | null;
  /** Fallback project key when initial has no profile/JQL hint. */
  defaultProjectKey?: string;
  onClose: () => void;
  onSubmit: (payload: BoardBuilderSubmitPayload) => Promise<void>;
}

interface BuilderState {
  name: string;
  projectKey: string;
  versionName: string;
  selectedStatuses: string[];
  assigneeScope: "anyone" | "currentUser";
  laneGrouping: "none" | "epic" | "parent" | "component";
  refreshIntervalSec: number;
  pinned: boolean;
  qaStatusMap: LiveBoardQaStatusMap;
  // Advanced
  customJql: boolean;
  manualJql: string;
  viewPrefs: LiveBoardViewPreferences;
}

const PROJECT_PREFIX_RE = /project\s*=\s*"?([A-Z][A-Z0-9_]+)"?/i;

function inferProjectKey(
  initial: LiveBoard | null | undefined,
  fallback: string,
): string {
  if (initial?.profile?.projectKey) return initial.profile.projectKey;
  if (initial?.jql) {
    const m = initial.jql.match(PROJECT_PREFIX_RE);
    if (m) return m[1].toUpperCase();
  }
  return fallback;
}

const DEFAULT_QA_STATUS_SET = new Set([
  ...DEFAULT_QA_STATUS_MAP.ready,
  ...DEFAULT_QA_STATUS_MAP.testing,
  ...DEFAULT_QA_STATUS_MAP.done,
]);

function buildInitialState(
  initial: LiveBoard | null | undefined,
  defaultProjectKey: string,
): BuilderState {
  const profile = initial?.profile ?? null;
  const projectKey = inferProjectKey(initial, defaultProjectKey);
  const versionName = profile?.versionName ?? "";

  const selectedStatuses = profile?.selectedStatuses?.length
    ? [...profile.selectedStatuses]
    : Array.from(DEFAULT_QA_STATUS_SET);
  const qaStatusMap = profile?.qaStatusMap
    ? {
        ready: [...profile.qaStatusMap.ready],
        testing: [...profile.qaStatusMap.testing],
        done: [...profile.qaStatusMap.done],
      }
    : {
        ready: [...DEFAULT_QA_STATUS_MAP.ready],
        testing: [...DEFAULT_QA_STATUS_MAP.testing],
        done: [...DEFAULT_QA_STATUS_MAP.done],
      };

  const builderMode = profile?.builderMode ?? "simple";

  return {
    name:
      initial?.name ?? deriveDefaultBoardName(projectKey, versionName || ""),
    projectKey,
    versionName,
    selectedStatuses,
    assigneeScope: profile?.assigneeScope ?? "anyone",
    laneGrouping: profile?.laneGrouping ?? "none",
    refreshIntervalSec:
      profile?.refreshIntervalSec ?? DEFAULT_REFRESH_INTERVAL_SEC,
    pinned: initial?.pinned ?? false,
    qaStatusMap,
    customJql: builderMode === "advanced" || (!!initial && !profile),
    manualJql: initial?.jql ?? "",
    viewPrefs: initial?.view_prefs ?? { ...DEFAULT_BUILDER_VIEW_PREFS },
  };
}

function toSimpleDraft(state: BuilderState): LiveBoardBuilderSimpleDraft {
  return {
    mode: "simple",
    name: state.name,
    projectKey: state.projectKey,
    versionName: state.versionName,
    selectedStatuses: state.selectedStatuses,
    qaStatusMap: state.qaStatusMap,
    laneGrouping: state.laneGrouping,
    assigneeScope: state.assigneeScope,
    refreshIntervalSec: state.refreshIntervalSec,
    columns: state.selectedStatuses,
  };
}

function buildProfile(state: BuilderState, jql: string): LiveBoardProfile {
  return {
    builderMode: state.customJql ? "advanced" : "simple",
    projectKey: state.projectKey,
    versionName: state.versionName,
    selectedStatuses: [...state.selectedStatuses],
    qaStatusMap: {
      ready: [...state.qaStatusMap.ready],
      testing: [...state.qaStatusMap.testing],
      done: [...state.qaStatusMap.done],
    },
    laneGrouping: state.laneGrouping,
    assigneeScope: state.assigneeScope,
    refreshIntervalSec: state.refreshIntervalSec,
    customJql: jql,
  };
}

export function BoardBuilderDialog({
  initial,
  defaultProjectKey = "FM",
  onClose,
  onSubmit,
}: Props) {
  const [state, setState] = useState<BuilderState>(() =>
    buildInitialState(initial ?? null, defaultProjectKey),
  );
  const [previewSucceededOnce, setPreviewSucceededOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userTouchedNameRef = useRef<boolean>(!!initial);

  const preview = useBoardPreview();

  // Lock Esc + body scroll while open.
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

  // Auto-name when user hasn't manually edited the name yet.
  useEffect(() => {
    if (userTouchedNameRef.current) return;
    setState((s) => ({
      ...s,
      name: deriveDefaultBoardName(s.projectKey, s.versionName),
    }));
  }, [state.projectKey, state.versionName]);

  const update = useCallback((patch: Partial<BuilderState>) => {
    setState((s) => ({ ...s, ...patch }));
    if (patch.name !== undefined) userTouchedNameRef.current = true;
    setPreviewSucceededOnce(false);
  }, []);

  const autoJql = useMemo(
    () => buildJqlFromSimpleDraft(toSimpleDraft(state)),
    [state],
  );

  const effectiveJql = state.customJql ? state.manualJql : autoJql;

  // Detected statuses from preview, merged with selected statuses so the
  // mapping step is never empty after the user picks at least one option.
  const detectedStatuses = useMemo(() => {
    const fromPreview =
      preview.state.kind === "ok"
        ? summarizeStatuses(preview.state.response).map((r) => r.name)
        : [];
    const merged = new Set<string>([
      ...state.selectedStatuses,
      ...fromPreview,
    ]);
    return Array.from(merged);
  }, [preview.state, state.selectedStatuses]);

  // Mark preview success so the save button can unlock.
  useEffect(() => {
    if (preview.state.kind === "ok") setPreviewSucceededOnce(true);
  }, [preview.state]);

  const runPreview = useCallback(() => {
    setError(null);
    void preview.run(effectiveJql);
  }, [preview, effectiveJql]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!state.name.trim()) errors.push("Board name is required");
    if (effectiveJql.trim().length === 0) errors.push("JQL must not be empty");
    if (!state.customJql) {
      const draft = toSimpleDraft(state);
      const v = validateBuilderDraft(draft);
      for (const e of v.errors) if (!errors.includes(e)) errors.push(e);
    }
    const hasReadyOrTesting =
      state.qaStatusMap.ready.length > 0 ||
      state.qaStatusMap.testing.length > 0;
    if (!hasReadyOrTesting) {
      errors.push(
        "QA mapping must include at least one Ready or Testing status",
      );
    }
    return { ok: errors.length === 0, errors };
  }, [state, effectiveJql]);

  // Save is blocked until the user has previewed at least once (per phase
  // spec). For edit flows, a successful re-preview is still required if the
  // user changes effective JQL.
  const canSave =
    validation.ok && previewSucceededOnce && preview.state.kind !== "error";

  const handleSubmit = useCallback(async () => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const profile = buildProfile(state, effectiveJql);
      await onSubmit({
        name: state.name.trim(),
        jql: effectiveJql.trim(),
        columns:
          state.selectedStatuses.length > 0
            ? state.selectedStatuses
            : [...state.qaStatusMap.ready, ...state.qaStatusMap.testing, ...state.qaStatusMap.done],
        profile,
        view_prefs: state.viewPrefs,
        pinned: state.pinned,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save board");
    } finally {
      setSubmitting(false);
    }
  }, [canSave, submitting, state, effectiveJql, onClose, onSubmit]);

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
          "w-[720px] max-w-[94vw] max-h-[88vh] rounded-xl border border-subtle bg-surface-elevated shadow-float flex flex-col",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">
              {initial ? "Edit board" : "New board"}
            </h3>
            <p className="text-[10.5px] text-ink-faint">
              Pick a project and statuses — JQL is generated for you.
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
            <SimpleBuilderStep
              value={{
                name: state.name,
                projectKey: state.projectKey,
                versionName: state.versionName,
                selectedStatuses: state.selectedStatuses,
                assigneeScope: state.assigneeScope,
                laneGrouping: state.laneGrouping,
                refreshIntervalSec: state.refreshIntervalSec,
                pinned: state.pinned,
              }}
              statusOptions={detectedStatuses}
              onChange={update}
            />

            <StructureMappingStep
              statuses={detectedStatuses}
              value={state.qaStatusMap}
              onChange={(qaStatusMap) =>
                setState((s) => ({ ...s, qaStatusMap }))
              }
            />

            <AdvancedJqlSection
              effectiveJql={effectiveJql}
              autoJql={autoJql}
              customJql={state.customJql}
              onChange={({ jql, customJql }) => {
                setState((s) => ({
                  ...s,
                  customJql,
                  manualJql: customJql ? jql : s.manualJql,
                }));
                setPreviewSucceededOnce(false);
              }}
              defaultOpen={state.customJql}
            />
          </div>

          <aside className="flex flex-col gap-3 min-w-0">
            <BuilderPreviewPanel
              state={preview.state}
              effectiveJql={effectiveJql}
              onRun={runPreview}
              laneGrouping={state.laneGrouping}
            />
            <section className="rounded-md border border-subtle bg-surface-overlay/40 px-3 py-2.5">
              <h4 className="text-[11px] font-semibold text-ink mb-1">
                Effective JQL
              </h4>
              <code className="block text-[10.5px] font-mono text-ink-muted whitespace-pre-wrap break-words">
                {effectiveJql || "(empty)"}
              </code>
            </section>
            {validation.errors.length > 0 && (
              <ul className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] text-ink-secondary flex flex-col gap-0.5">
                {validation.errors.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-subtle">
          <p className="text-[10.5px] text-ink-faint">
            {previewSucceededOnce
              ? "Preview verified. You can save."
              : "Run a preview to enable save."}
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
              disabled={!canSave || submitting}
              className={clsx(
                "g-btn-solid text-[12px] px-3",
                (!canSave || submitting) && "opacity-50",
              )}
            >
              {submitting
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Create board"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
