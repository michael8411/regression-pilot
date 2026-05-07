export interface ThemeSpec {
  id: string;
  label: string;
  ticketKeys: string[];
}

export interface CycleSummary {
  id: string;
  name: string;
  projectKey: string;
  versionHint: string;
  ticketCount: number;
  themeCount: number;
  pinned: boolean;
  archived: boolean;
  lastRunAt: string | null;
  runCount: number;
  updatedAt: string;
}

export interface Cycle extends CycleSummary {
  description: string;
  ticketKeys: string[];
  themes: ThemeSpec[];
  testCaseRefs: string[];
  createdAt: string;
}

export interface CycleCreate {
  name: string;
  description?: string;
  projectKey: string;
  versionHint?: string;
  ticketKeys: string[];
  themes?: ThemeSpec[];
  testCaseRefs?: string[];
  pinned?: boolean;
}

export type CyclePatch = Partial<CycleCreate> & { archived?: boolean };

export type CycleRunStatus =
  | "started"
  | "session_created"
  | "abandoned"
  | "completed"
  | "failed";

export interface CycleRun {
  id: string;
  cycleId: string;
  sessionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: CycleRunStatus;
  notes: string;
}

export interface CycleRunRequest {
  sessionName?: string;
}
