/**
 * Module-scoped event bus for cycle-builder open requests.
 *
 * The TicketWorkbench's "Save as cycle…" entrypoint navigates to
 * `["regression","cycles"]` and fires `requestOpenBuilder({...prefill})`;
 * `CyclesView` listens on mount and consumes the request once.
 *
 * Mirrors the panelBus pattern from Phase 9b's MCP settings.
 */

import type { CycleCreate } from "@/types/cycles";

type Listener = () => void;

const listeners = new Set<Listener>();
let pendingPrefill: CycleCreate | null = null;

export function requestOpenBuilder(prefill?: CycleCreate): void {
  pendingPrefill = prefill ?? {
    name: "",
    projectKey: "",
    ticketKeys: [],
  };
  for (const l of listeners) l();
}

export function consumePendingPrefill(): CycleCreate | null {
  if (!pendingPrefill) return null;
  const out = pendingPrefill;
  pendingPrefill = null;
  return out;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
