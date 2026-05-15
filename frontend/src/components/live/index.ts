export { LiveWorkspace } from "./LiveWorkspace";
export { LiveHome } from "./LiveHome";
export { BoardProvider, useBoard, type BoardContextValue } from "./BoardProvider";
export { useLiveBoards } from "./hooks/useLiveBoards";

// Phase 02 — Live home dashboard scaffolding.
export {
  LiveHomeHeader,
  LiveStatsStrip,
  LiveBoardFilters,
  LiveBoardsGrid,
  AddBoardTile,
  LiveActivityRail,
  type LiveBoardFilterChip,
  type LiveActivityRailEntry,
} from "./home";

// Phase 03 — guided board builder.
export {
  BoardBuilderDialog,
  SimpleBuilderStep,
  StructureMappingStep,
  AdvancedJqlSection,
  BuilderPreviewPanel,
  useBoardPreview,
  summarizeStatuses,
  type BoardBuilderSubmitPayload,
  type PreviewState,
} from "./board-builder";

// Phase 01 — foundation contracts. Pure helpers and type-only exports;
// no runtime UI is touched in this phase.
export {
  QA_READY_STATUSES,
  QA_TESTING_STATUSES,
  DONE_STATUSES,
  isReadyStatus,
  isTestingStatus,
  isDoneStatus,
  classifyStatus,
  type QaBucket,
  type QaStatusOverride,
} from "./lib/statusTaxonomy";
export {
  buildBoardInsights,
  buildEmptyInsights,
} from "./lib/boardInsights";
export {
  buildJqlFromSimpleDraft,
  validateBuilderDraft,
  deriveDefaultBoardName,
  buildPayloadFromDraft,
} from "./lib/boardBuilder";
export type {
  LiveBoardBuilderSimpleDraft,
  LiveBoardBuilderAdvancedDraft,
  LiveBoardBuilderDraft,
  LiveBoardBuilderPayload,
  LiveBoardBuilderValidation,
} from "./types";
export {
  DEFAULT_QA_STATUS_MAP,
  DEFAULT_REFRESH_INTERVAL_SEC,
  DEFAULT_BUILDER_VIEW_PREFS,
} from "./types";
