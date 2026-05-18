import {
  classifyStatus,
  type QaBucket,
  type QaStatusOverride,
} from "@/components/live/lib/statusTaxonomy";

export type QaCategory = "new" | "indeterminate" | "done";

export type QaResolution =
  | { bucket: "ready" | "testing" | "done"; source: "taxonomy" | "category" }
  | { bucket: "unresolved" };

export function resolveQaBucket(
  status: string,
  category: QaCategory | undefined,
  override?: QaStatusOverride,
): QaResolution {
  const bucket: QaBucket = classifyStatus(status, override);
  if (bucket !== "other") {
    return { bucket, source: "taxonomy" };
  }
  if (category === "done") return { bucket: "done", source: "category" };
  return { bucket: "unresolved" };
}
