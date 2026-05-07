import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "@/lib/icons";
import { Badge, Button, Spinner } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";
import { listRuns } from "./lib/api";
import { useRoute } from "@/contexts/RouteContext";
import type { CycleRun, CycleRunStatus } from "@/types/cycles";

interface Props {
  cycleId: string;
  cycleName: string;
  onClose: () => void;
}

const STATUS_TONE: Record<CycleRunStatus, BadgeTone> = {
  started: "neutral",
  session_created: "accent",
  abandoned: "warn",
  completed: "ok",
  failed: "err",
};

export function CycleRunHistoryDrawer({ cycleId, cycleName, onClose }: Props) {
  const [runs, setRuns] = useState<CycleRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { goto } = useRoute();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await listRuns(cycleId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[7900] bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      aria-hidden
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Run history for ${cycleName}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-[480px] max-w-[100vw] border-l border-subtle bg-surface-elevated shadow-float flex flex-col animate-slide-in-right"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink truncate">
              {cycleName}
            </h2>
            <p className="text-[10.5px] text-ink-faint">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              leading={
                loading ? <Loader2 size={11} /> : <RefreshCw size={11} />
              }
            >
              Refresh
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && runs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-md border border-err/30 bg-err/10 px-2 py-1.5 text-[11.5px] text-err"
            >
              {error}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              No runs yet. Click Run to start one.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-subtle bg-surface px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11.5px] text-ink">
                      {new Date(r.startedAt).toLocaleString()}
                    </div>
                    <Badge tone={STATUS_TONE[r.status]} size="sm">
                      {r.status}
                    </Badge>
                  </div>
                  {r.sessionId && (
                    <button
                      type="button"
                      onClick={() => goto(["regression", "workbench"])}
                      className="mt-1 font-mono text-[10.5px] text-accent-text hover:underline"
                    >
                      Open session →
                    </button>
                  )}
                  {r.notes && (
                    <p className="mt-1 text-[11px] text-ink-secondary whitespace-pre-wrap">
                      {r.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
