/**
 * Phase 07 — Live module surface.
 *
 * The public boundary of the Live workspace is intentionally narrow: only
 * `LiveWorkspace` is consumed from outside this directory. Every helper,
 * type, and sub-component is reached via relative imports inside `live/`
 * itself, so we do NOT re-export them here. Anything that needs to cross
 * the directory boundary should be promoted to this index explicitly.
 *
 * Audit search:
 *   rg 'from "@/components/live"' frontend/src   → only `App.tsx`
 */

export { LiveWorkspace } from "./LiveWorkspace";
