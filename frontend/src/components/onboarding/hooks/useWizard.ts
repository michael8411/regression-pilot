import { useCallback, useMemo, useReducer } from "react";

export type StepId =
  | "welcome"
  | "jira"
  | "gemini"
  | "zephyr"
  | "preferences"
  | "done";

export interface StepState {
  complete: boolean;
  skipped?: boolean;
}

export interface WizardState {
  current: StepId;
  visited: StepId[];
  steps: Record<StepId, StepState>;
}

type Action =
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; id: StepId }
  | { type: "markComplete"; id: StepId }
  | { type: "markSkipped"; id: StepId }
  | { type: "reset" };

const ORDER: StepId[] = ["welcome", "jira", "gemini", "zephyr", "preferences", "done"];

const initial: WizardState = {
  current: "welcome",
  visited: ["welcome"],
  steps: {
    welcome:     { complete: true },
    jira:        { complete: false },
    gemini:      { complete: false },
    zephyr:      { complete: false, skipped: false },
    preferences: { complete: true },
    done:        { complete: false },
  },
};

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "next": {
      const idx = ORDER.indexOf(state.current);
      const next = ORDER[Math.min(idx + 1, ORDER.length - 1)];
      return { ...state, current: next, visited: dedupe([...state.visited, next]) };
    }
    case "back": {
      const idx = ORDER.indexOf(state.current);
      const prev = ORDER[Math.max(idx - 1, 0)];
      return { ...state, current: prev };
    }
    case "goto":
      return {
        ...state,
        current: action.id,
        visited: dedupe([...state.visited, action.id]),
      };
    case "markComplete":
      return {
        ...state,
        steps: {
          ...state.steps,
          [action.id]: { ...state.steps[action.id], complete: true },
        },
      };
    case "markSkipped":
      return {
        ...state,
        steps: {
          ...state.steps,
          [action.id]: { complete: true, skipped: true },
        },
      };
    case "reset":
      return initial;
  }
}

export function useWizard() {
  const [state, dispatch] = useReducer(reducer, initial);

  const next = useCallback(() => dispatch({ type: "next" }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const goto = useCallback((id: StepId) => dispatch({ type: "goto", id }), []);
  const markComplete = useCallback(
    (id: StepId) => dispatch({ type: "markComplete", id }),
    [],
  );
  const markSkipped = useCallback(
    (id: StepId) => dispatch({ type: "markSkipped", id }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const isLast = state.current === "preferences";

  const canAdvance = useMemo(
    () => state.steps[state.current]?.complete ?? false,
    [state.current, state.steps],
  );

  return { state, next, back, goto, markComplete, markSkipped, reset, isLast, canAdvance };
}
