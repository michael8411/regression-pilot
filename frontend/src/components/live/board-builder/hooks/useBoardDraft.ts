import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveDefaultBoardName } from "@/components/live/lib/boardBuilder";
import {
  AUTO_LANE_GROUPING,
  defaultBoardProfile,
  defaultViewPrefs,
  smartDefaultSelectedStatuses,
  type LaneGroupingOption,
} from "../lib/defaultBoardProfile";
import { applyAutoQaMap } from "../lib/applyAutoQaMap";
import { buildBoardJql } from "../lib/buildBoardJql";
import { deriveWorkflowColumnOrder } from "../lib/deriveWorkflowColumnOrder";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import type { ProjectStatus } from "./useProjectStatuses";
import type {
  LiveBoard,
  LiveBoardAssigneeScope,
  LiveBoardProfile,
  LiveBoardQaStatusMap,
  LiveBoardTemplate,
  LiveBoardViewPreferences,
} from "@/types/live";

export interface BoardDraftState {
  name: string;
  projectKey: string;
  versionName: string;
  components: string[];
  selectedStatuses: string[];
  assigneeScope: LiveBoardAssigneeScope;
  laneGrouping: LaneGroupingOption;
  refreshIntervalSec: number;
  pinned: boolean;
  qaStatusMap: LiveBoardQaStatusMap;
  customJql: boolean;
  manualJql: string;
  viewPrefs: LiveBoardViewPreferences;
  // Layer 1 PR3 — template-aware JQL + persisted workflow column order.
  boardTemplate: LiveBoardTemplate;
  workflowColumnOrder: string[];
}

export interface BoardDraftPayload {
  name: string;
  jql: string;
  columns: string[];
  profile: LiveBoardProfile;
  view_prefs: LiveBoardViewPreferences;
  pinned: boolean;
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

function buildInitial(
  initial: LiveBoard | null | undefined,
  fallbackProjectKey: string,
): BoardDraftState {
  const profile = initial?.profile ?? null;
  const projectKey = inferProjectKey(initial, fallbackProjectKey);
  const versionName = profile?.versionName ?? "";
  const defaults = defaultBoardProfile(projectKey, versionName);

  const selectedStatuses = profile?.selectedStatuses?.length
    ? [...profile.selectedStatuses]
    : [];
  const qaStatusMap = profile?.qaStatusMap
    ? {
        ready: [...profile.qaStatusMap.ready],
        testing: [...profile.qaStatusMap.testing],
        done: [...profile.qaStatusMap.done],
      }
    : { ready: [], testing: [], done: [] };

  const builderMode = profile?.builderMode ?? "simple";
  const laneGrouping: LaneGroupingOption = initial
    ? (profile?.laneGrouping ?? defaults.laneGrouping)
    : AUTO_LANE_GROUPING;

  return {
    name:
      initial?.name ?? deriveDefaultBoardName(projectKey, versionName || ""),
    projectKey,
    versionName,
    components: [],
    selectedStatuses,
    assigneeScope: profile?.assigneeScope ?? defaults.assigneeScope,
    laneGrouping,
    refreshIntervalSec:
      profile?.refreshIntervalSec ?? defaults.refreshIntervalSec,
    pinned: initial?.pinned ?? false,
    qaStatusMap,
    customJql: builderMode === "advanced" || (!!initial && !profile),
    manualJql: initial?.jql ?? "",
    viewPrefs: initial?.view_prefs ?? defaultViewPrefs(),
    // Layer 1 PR3 — default template is "workflow"; existing boards preserve
    // whatever they saved. workflowColumnOrder is seeded from projectStatuses
    // (see effect below) when the user hasn't already saved one.
    boardTemplate: profile?.boardTemplate ?? defaults.boardTemplate ?? "workflow",
    workflowColumnOrder: profile?.workflowColumnOrder
      ? [...profile.workflowColumnOrder]
      : [],
  };
}

export interface UseBoardDraftArgs {
  initial?: LiveBoard | null;
  defaultProjectKey?: string;
  /** Live project workflow; drives smart defaults + Auto-map. */
  projectStatuses: ReadonlyArray<ProjectStatus>;
  /**
   * Layer 1 PR3 — server-supplied workflow_column_order from the
   * /jira/projects/{key}/statuses response. When present and non-empty,
   * `deriveWorkflowColumnOrder` trusts it directly.
   */
  apiWorkflowColumnOrder?: ReadonlyArray<string>;
}

export interface UseBoardDraftResult {
  state: BoardDraftState;
  effectiveJql: string;
  detectedStatuses: string[];
  /** True once user has manually changed selection or mapping. */
  touched: boolean;
  setName: (next: string) => void;
  setProjectKey: (next: string) => void;
  setVersionName: (next: string) => void;
  setComponents: (next: string[]) => void;
  setSelectedStatuses: (next: string[]) => void;
  setAssigneeScope: (next: LiveBoardAssigneeScope) => void;
  setLaneGrouping: (next: LaneGroupingOption) => void;
  setRefreshIntervalSec: (next: number) => void;
  setPinned: (next: boolean) => void;
  setQaStatusMap: (next: LiveBoardQaStatusMap) => void;
  setCustomJql: (jql: string, isCustom: boolean) => void;
  setViewPrefs: (next: LiveBoardViewPreferences) => void;
  setBoardTemplate: (next: LiveBoardTemplate) => void;
  applyAutoMap: () => {
    changedCount: number;
    unresolved: string[];
    idempotent: boolean;
  };
  buildPayload: () => BoardDraftPayload;
}

function resolveLaneGrouping(
  option: LaneGroupingOption,
): LiveBoardProfile["laneGrouping"] {
  return option === AUTO_LANE_GROUPING ? "none" : option;
}

export function useBoardDraft({
  initial,
  defaultProjectKey = "FM",
  projectStatuses,
  apiWorkflowColumnOrder,
}: UseBoardDraftArgs): UseBoardDraftResult {
  const [state, setState] = useState<BoardDraftState>(() =>
    buildInitial(initial ?? null, defaultProjectKey),
  );
  const userTouchedNameRef = useRef<boolean>(!!initial);
  const [touched, setTouched] = useState(false);

  const update = useCallback(
    (patch: Partial<BoardDraftState>, opts: { touched?: boolean } = {}) => {
      setState((s) => ({ ...s, ...patch }));
      if (opts.touched) setTouched(true);
    },
    [],
  );

  const setName = useCallback((next: string) => {
    userTouchedNameRef.current = true;
    setState((s) => ({ ...s, name: next }));
  }, []);

  const setProjectKey = useCallback(
    (next: string) =>
      setState((s) => ({
        ...s,
        projectKey: next,
        versionName: "",
        // wipe smart defaults so they re-seed against the new project
        selectedStatuses: [],
        qaStatusMap: { ready: [], testing: [], done: [] },
      })),
    [],
  );

  const setVersionName = useCallback(
    (next: string) => setState((s) => ({ ...s, versionName: next })),
    [],
  );
  const setComponents = useCallback(
    (next: string[]) => update({ components: next }, { touched: true }),
    [update],
  );
  const setSelectedStatuses = useCallback(
    (next: string[]) =>
      update({ selectedStatuses: next }, { touched: true }),
    [update],
  );
  const setAssigneeScope = useCallback(
    (next: LiveBoardAssigneeScope) => update({ assigneeScope: next }),
    [update],
  );
  const setLaneGrouping = useCallback(
    (next: LaneGroupingOption) =>
      update({ laneGrouping: next }, { touched: next !== AUTO_LANE_GROUPING }),
    [update],
  );
  const setRefreshIntervalSec = useCallback(
    (next: number) => update({ refreshIntervalSec: next }),
    [update],
  );
  const setPinned = useCallback(
    (next: boolean) => update({ pinned: next }),
    [update],
  );
  const setQaStatusMap = useCallback(
    (next: LiveBoardQaStatusMap) =>
      update({ qaStatusMap: next }, { touched: true }),
    [update],
  );
  const setCustomJql = useCallback(
    (jql: string, isCustom: boolean) =>
      update(
        {
          customJql: isCustom,
          manualJql: isCustom ? jql : state.manualJql,
        },
        { touched: isCustom },
      ),
    [state.manualJql, update],
  );
  const setViewPrefs = useCallback(
    (next: LiveBoardViewPreferences) => update({ viewPrefs: next }),
    [update],
  );
  const setBoardTemplate = useCallback(
    (next: LiveBoardTemplate) => update({ boardTemplate: next }, { touched: true }),
    [update],
  );

  // Seed smart defaults when statuses arrive and user hasn't touched anything.
  useEffect(() => {
    if (projectStatuses.length === 0) return;
    if (state.selectedStatuses.length > 0) return;
    if (initial?.profile) return;
    const picked = smartDefaultSelectedStatuses(projectStatuses);
    if (picked.length === 0) return;
    const map: LiveBoardQaStatusMap = { ready: [], testing: [], done: [] };
    for (const name of picked) {
      const meta = projectStatuses.find((x) => x.name === name);
      const bucket = classifyStatus(name);
      if (bucket === "ready") map.ready.push(name);
      else if (bucket === "testing") map.testing.push(name);
      else if (bucket === "done" || meta?.category === "done") {
        map.done.push(name);
      }
    }
    setState((s) =>
      s.selectedStatuses.length === 0
        ? { ...s, selectedStatuses: picked, qaStatusMap: map }
        : s,
    );
  }, [projectStatuses, initial?.profile, state.selectedStatuses.length]);

  // Layer 1 PR3 — seed workflowColumnOrder from project statuses + server
  // hint as soon as it resolves, unless the user is editing an existing
  // board that already has one saved.
  useEffect(() => {
    if (projectStatuses.length === 0) return;
    if (state.workflowColumnOrder.length > 0) return;
    const order = deriveWorkflowColumnOrder(
      projectStatuses,
      apiWorkflowColumnOrder,
    );
    if (order.length === 0) return;
    setState((s) =>
      s.workflowColumnOrder.length === 0
        ? { ...s, workflowColumnOrder: order }
        : s,
    );
  }, [projectStatuses, apiWorkflowColumnOrder, state.workflowColumnOrder.length]);

  // Auto-name when user hasn't manually edited the name yet.
  useEffect(() => {
    if (userTouchedNameRef.current) return;
    setState((s) => ({
      ...s,
      name: deriveDefaultBoardName(s.projectKey, s.versionName),
    }));
  }, [state.projectKey, state.versionName]);

  // Layer 1 PR3 — template-driven JQL. The workflow template stops adding
  // `status in (...)` so the resulting board renders the full pipeline; the
  // qa_release template keeps the QA-slice behavior for callers who want it.
  const autoJql = useMemo(
    () =>
      buildBoardJql({
        template: state.boardTemplate,
        projectKey: state.projectKey,
        versionName: state.versionName,
        components: state.components,
        assigneeScope: state.assigneeScope,
        qaStatusMap: state.qaStatusMap,
        qaStatusFallback: state.selectedStatuses,
      }),
    [
      state.boardTemplate,
      state.projectKey,
      state.versionName,
      state.components,
      state.assigneeScope,
      state.qaStatusMap,
      state.selectedStatuses,
    ],
  );
  const effectiveJql = state.customJql ? state.manualJql : autoJql;

  const detectedStatuses = useMemo(() => {
    const merged = new Set<string>([
      ...state.selectedStatuses,
      ...projectStatuses.map((s) => s.name),
    ]);
    return Array.from(merged);
  }, [projectStatuses, state.selectedStatuses]);

  const applyAutoMap = useCallback(() => {
    const categoryByStatus: Record<string, "new" | "indeterminate" | "done"> =
      {};
    for (const s of projectStatuses) categoryByStatus[s.name] = s.category;
    const result = applyAutoQaMap({
      statuses: state.selectedStatuses,
      current: state.qaStatusMap,
      projectCategoryByStatus: categoryByStatus,
    });
    setState((s) => ({ ...s, qaStatusMap: result.next }));
    return {
      changedCount: result.changedCount,
      unresolved: result.unresolved,
      idempotent: result.changedCount === 0 && result.unresolved.length === 0,
    };
  }, [projectStatuses, state.selectedStatuses, state.qaStatusMap]);

  const buildPayload = useCallback((): BoardDraftPayload => {
    // Layer 1 PR3 — `columns` mirrors `workflowColumnOrder` for back-compat
    // with code paths that still read the legacy field. When the order
    // hasn't loaded yet (network failed pre-create), fall back to the
    // legacy selected-status list so we never persist an empty columns
    // array on first save.
    const columns =
      state.workflowColumnOrder.length > 0
        ? [...state.workflowColumnOrder]
        : state.selectedStatuses.length > 0
          ? [...state.selectedStatuses]
          : [
              ...state.qaStatusMap.ready,
              ...state.qaStatusMap.testing,
              ...state.qaStatusMap.done,
            ];

    return {
      name: state.name.trim(),
      jql: effectiveJql.trim(),
      columns,
      profile: {
        builderMode: state.customJql ? "advanced" : "simple",
        projectKey: state.projectKey,
        versionName: state.versionName,
        selectedStatuses: [...state.selectedStatuses],
        qaStatusMap: {
          ready: [...state.qaStatusMap.ready],
          testing: [...state.qaStatusMap.testing],
          done: [...state.qaStatusMap.done],
        },
        laneGrouping: resolveLaneGrouping(state.laneGrouping),
        assigneeScope: state.assigneeScope,
        refreshIntervalSec: state.refreshIntervalSec,
        customJql: effectiveJql,
        boardTemplate: state.boardTemplate,
        workflowColumnOrder: [...state.workflowColumnOrder],
      },
      view_prefs: state.viewPrefs,
      pinned: state.pinned,
    };
  }, [state, effectiveJql]);

  return {
    state,
    effectiveJql,
    detectedStatuses,
    touched,
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
    setViewPrefs,
    setBoardTemplate,
    applyAutoMap,
    buildPayload,
  };
}
