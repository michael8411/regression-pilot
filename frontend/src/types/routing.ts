/* Route tuple type — forward-compatible path for Phase 2 refactor */

export type Workspace = "regression" | "live" | "assistant";

/* TODO Phase 2: discriminated union
export type Route =
  | ["regression", "home" | "tickets" | "themes" | "generate" | "review" | "cycles"]
  | ["live", "home" | "board" | "pinned"]
  | ["assistant", "home" | "chat"];
*/

export type Route = [Workspace, string];
