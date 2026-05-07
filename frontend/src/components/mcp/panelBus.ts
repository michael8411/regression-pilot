/**
 * Module-scoped event bus that lets the command palette ask the panel
 * (when next mounted) to immediately open the create dialog.
 *
 * Using an in-memory emitter avoids leaking into localStorage / URL hash.
 * The palette command navigates to the overlay route AND fires `requestOpen`;
 * the panel listens on mount and consumes the request once.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let pendingOpen = false;

export function requestOpenCreateDialog(): void {
  pendingOpen = true;
  for (const l of listeners) l();
}

export function consumePendingOpen(): boolean {
  if (!pendingOpen) return false;
  pendingOpen = false;
  return true;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
