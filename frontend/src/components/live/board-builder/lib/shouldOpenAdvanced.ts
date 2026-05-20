import type { LiveBoard } from "@/types/live";

export function shouldOpenAdvanced(
  initial: LiveBoard | null | undefined,
): boolean {
  if (!initial) return false;
  const profile = initial.profile;
  if (!profile) return false;
  if (profile.builderMode === "advanced") return true;
  if (profile.laneGrouping && profile.laneGrouping !== "none") return true;
  const buckets = new Set([
    ...(profile.qaStatusMap?.ready ?? []),
    ...(profile.qaStatusMap?.testing ?? []),
    ...(profile.qaStatusMap?.done ?? []),
  ]);
  for (const s of profile.selectedStatuses ?? []) {
    if (!buckets.has(s)) return true;
  }
  return false;
}
