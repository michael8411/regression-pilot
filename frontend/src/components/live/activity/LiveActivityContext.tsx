/**
 * Phase 06 — single shared activity feed for the Live workspace.
 *
 * Provider lives at the `LiveWorkspace` boundary so home, board view,
 * pinned view, and the ticket drawer all read the same in-memory feed
 * and all emit through the same `record()` channel.
 *
 * Consumers that fire activity (KanbanBoard transitions, CommentComposer,
 * LiveGeneratePanel, board pin toggles) use `useLiveActivityFeed()`.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  useLiveActivity,
  type UseLiveActivityResult,
} from "./useLiveActivity";

const LiveActivityCtx = createContext<UseLiveActivityResult | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Maximum events retained in-memory; matches the backend list cap. */
  limit?: number;
}

export function LiveActivityProvider({ children, limit }: ProviderProps) {
  const value = useLiveActivity(limit);
  return (
    <LiveActivityCtx.Provider value={value}>
      {children}
    </LiveActivityCtx.Provider>
  );
}

/**
 * Access the shared activity feed. Throws when used outside the provider so
 * misuse surfaces during development instead of silently dropping events.
 */
export function useLiveActivityFeed(): UseLiveActivityResult {
  const ctx = useContext(LiveActivityCtx);
  if (!ctx) {
    throw new Error(
      "useLiveActivityFeed must be used inside <LiveActivityProvider>",
    );
  }
  return ctx;
}

/**
 * Safe variant that returns `null` when the provider is absent — used by
 * components that may render outside the Live workspace shell (e.g. unit
 * tests, storybook stories).
 */
export function useOptionalLiveActivityFeed(): UseLiveActivityResult | null {
  return useContext(LiveActivityCtx);
}
