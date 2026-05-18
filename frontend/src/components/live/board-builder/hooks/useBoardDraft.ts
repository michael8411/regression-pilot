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
import { buildSimpleJql } from "../lib/buildSimpleJql";
import { classifyStatus } from "@/components/live/lib/statusTaxonomy";
import type { ProjectStatus } from "./useProjectStatuses";
import type {
  LiveBoard,
  LiveBoardAssigneeScope,
  LiveBoardProfile,
  LiveBoardQaStatusMap,
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
  };
}

export interface UseBoardDraftArgs {
  initial?: LiveBoard | null;
  defaultProjectKey?: string;
  /** Live project workflow; drives smart defaults + Auto-map. */
  projectStatuses: ReadonlyArray<ProjectStatus>;
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

  // Auto-name when user hasn't manually edited the name yet.
  useEffect(() => {
    if (userTouchedNameRef.current) return;
    setState((s) => ({
      ...s,
      name: deriveDefaultBoardName(s.projectKey, s.versionName),
    }));
  }, [state.projectKey, state.versionName]);

  const autoJql = useMemo(
    () =>
      buildSimpleJql({
        projectKey: state.projectKey,
        versionName: state.versionName,
        components: state.components,
        selectedStatuses: state.selectedStatuses,
        assigneeScope: state.assigneeScope,
      }),
    [
      state.projectKey,
      state.versionName,
      state.components,
      state.selectedStatuses,
      state.assigneeScope,
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
    return {
      name: state.name.trim(),
      jql: effectiveJql.trim(),
      columns:
        state.selectedStatuses.length > 0
          ? [...state.selectedStatuses]
          : [
              ...state.qaStatusMap.ready,
              ...state.qaStatusMap.testing,
              ...state.qaStatusMap.done,
            ],
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
    applyAutoMap,
    buildPayload,
  };
}
