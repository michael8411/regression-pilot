import { useSession } from "@/hooks/useSession";
import type {
  JiraProject,
  JiraTicket,
  JiraVersion,
  PushResult,
  TestCase,
} from "@/types";

export interface RegressionState {
  selectedProject: JiraProject | undefined;
  selectedVersion: JiraVersion | undefined;
  selectedTickets: JiraTicket[];
  editableGroups: Record<string, JiraTicket[]> | undefined;
  instructions: string;
  testCases: TestCase[];
  pushResult: PushResult | undefined;
}

const EMPTY: RegressionState = {
  selectedProject: undefined,
  selectedVersion: undefined,
  selectedTickets: [],
  editableGroups: undefined,
  instructions: "",
  testCases: [],
  pushResult: undefined,
};

/**
 * Narrowed view over the persisted regression session.
 *
 * Returns EMPTY until the session has hydrated. After hydration, every
 * key is validated so a partially corrupt session never surfaces NaN /
 * undefined-shaped data to a screen.
 */
export function useRegressionSession() {
  const session = useSession();
  const r = session.restoredState ?? null;

  const state: RegressionState = r
    ? {
        selectedProject: validateObject<JiraProject>(r.selectedProject),
        selectedVersion: validateObject<JiraVersion>(r.selectedVersion),
        selectedTickets: Array.isArray(r.selectedTickets)
          ? (r.selectedTickets as JiraTicket[])
          : [],
        editableGroups: isStringMap(r.editableGroups)
          ? (r.editableGroups as Record<string, JiraTicket[]>)
          : undefined,
        instructions:
          typeof r.instructions === "string" ? r.instructions : "",
        testCases: Array.isArray(r.testCases) ? (r.testCases as TestCase[]) : [],
        pushResult: validateObject<PushResult>(r.pushResult),
      }
    : EMPTY;

  return {
    ...session,
    state,
  };
}

function validateObject<T>(v: unknown): T | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : undefined;
}

function isStringMap(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
