import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Upload,
  X,
} from "@/lib/icons";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { pushTestCases } from "@/lib/api";
import type { JiraProject, PushResult, TestCase } from "@/types";
import { useRegressionSession } from "./hooks/useRegressionSession";
import { PushPreflight } from "./parts/PushPreflight";
import { PushResultPanel } from "./parts/PushResultPanel";
import { EmptyState } from "./parts/EmptyState";

type PushPhase =
  | { kind: "preflight" }
  | { kind: "pushing" }
  | { kind: "success"; result: PushResult }
  | { kind: "error"; message: string };

export function PushDialog() {
  const { goto } = useRoute();
  const { state, isRestoring, saveStateImmediate } = useRegressionSession();

  const onCloseGoto = useCallback(
    () => goto(["regression", "review"]),
    [goto],
  );
  const onNewSessionGoto = useCallback(
    () => goto(["regression", "workbench"]),
    [goto],
  );
  const onEditGoto = useCallback(
    () => goto(["regression", "review"]),
    [goto],
  );
  const onGenerateGoto = useCallback(
    () => goto(["regression", "generate"]),
    [goto],
  );

  if (isRestoring) return <PushSkeleton />;

  if (state.testCases.length === 0) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <EmptyState
          icon={Upload}
          title="No test cases to push"
          description="Generate test cases first."
          action={{
            label: "Go to Generate",
            onClick: () => goto(["regression", "generate"]),
          }}
        />
      </div>
    );
  }

  return (
    <PushDialogInner
      testCases={state.testCases}
      project={state.selectedProject}
      initialResult={state.pushResult ?? null}
      saveStateImmediate={saveStateImmediate}
      onCloseGoto={onCloseGoto}
      onNewSessionGoto={onNewSessionGoto}
      onEditGoto={onEditGoto}
      onGenerateGoto={onGenerateGoto}
    />
  );
}

interface InnerProps {
  testCases: TestCase[];
  project: JiraProject | undefined;
  initialResult: PushResult | null;
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
  onCloseGoto: () => void;
  onNewSessionGoto: () => void;
  onEditGoto: () => void;
  onGenerateGoto: () => void;
}

function PushDialogInner({
  testCases,
  project,
  initialResult,
  saveStateImmediate,
  onCloseGoto,
  onNewSessionGoto,
  onEditGoto,
  onGenerateGoto,
}: InnerProps) {
  // Restoring after a successful push lands the user back on the success
  // panel rather than re-running the call. The route encodes that state.
  const [phase, setPhase] = useState<PushPhase>(() =>
    initialResult
      ? { kind: "success", result: initialResult }
      : { kind: "preflight" },
  );
  const [folderId, setFolderId] = useState<number | null>(null);
  const [tagWithPrefix, setTagWithPrefix] = useState(true);

  const projectKey = project?.key ?? "";
  const count = testCases.length;

  const onPush = useCallback(async () => {
    if (!projectKey || count === 0) return;
    setPhase({ kind: "pushing" });
    try {
      const decorated = decorate(testCases, tagWithPrefix, projectKey);
      const result = await pushTestCases(
        projectKey,
        decorated,
        folderId ?? undefined,
      );
      // Critical write — bypass the debounce so a crash doesn't lose
      // record of a successful Zephyr push (which is irreversible).
      await saveStateImmediate("pushResult", result);
      setPhase({ kind: "success", result });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Push failed";
      setPhase({
        kind: "error",
        message:
          msg === "Failed to fetch"
            ? "Backend not reachable. Check that the local API is running."
            : msg,
      });
    }
  }, [
    projectKey,
    count,
    testCases,
    tagWithPrefix,
    folderId,
    saveStateImmediate,
  ]);

  const onNewSession = useCallback(async () => {
    // Clear the pushResult so the next push doesn't open straight into
    // the success panel for the prior batch.
    await saveStateImmediate("pushResult", null);
    onNewSessionGoto();
  }, [saveStateImmediate, onNewSessionGoto]);

  // Esc to close, except during pushing — abandoning a request mid-flight
  // would leave Zephyr in an unknown state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase.kind === "pushing") return;
      // Don't intercept Esc inside native select dropdowns — the browser
      // already handles dismissing them.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "SELECT") return;
      e.preventDefault();
      onCloseGoto();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase.kind, onCloseGoto]);

  // Command palette: Close (Esc) — only when not pushing.
  const closeCmd = useMemo<CommandItem | false>(
    () =>
      phase.kind === "pushing"
        ? false
        : {
            id: "push.close",
            group: "action",
            label: "Close push dialog",
            sub: "push",
            icon: X,
            kbd: "Esc",
            action: { type: "run", run: onCloseGoto },
          },
    [phase.kind, onCloseGoto],
  );
  useRegisterCommand(closeCmd);

  const canPush = count > 0 && !!projectKey;

  return (
    <div className="flex items-start justify-center flex-1 min-h-0 px-6 py-8 overflow-y-auto">
      <div
        className={cn(
          "w-full max-w-[560px] rounded-xl",
          "border border-subtle bg-surface-elevated shadow-float",
          "animate-slide-up flex flex-col",
        )}
        role="dialog"
        aria-modal="false"
        aria-label="Push test cases to Zephyr"
      >
        <header className="flex items-center justify-between gap-2 px-5 py-4 border-b border-subtle">
          <h1 className="t-h2 text-ink">Push to Zephyr</h1>
          <IconButton
            size="sm"
            icon={<X />}
            aria-label="Close"
            tooltip="Close (Esc)"
            onClick={onCloseGoto}
            disabled={phase.kind === "pushing"}
          />
        </header>

        <div className="px-6 py-6">
          {phase.kind === "preflight" && (
            <PushPreflight
              count={count}
              projectKey={projectKey}
              folderId={folderId}
              onFolderChange={setFolderId}
              tagWithPrefix={tagWithPrefix}
              onTagChange={setTagWithPrefix}
            />
          )}

          {phase.kind === "pushing" && <PushingState count={count} />}

          {phase.kind === "error" && (
            <ErrorState
              message={phase.message}
              onRetry={onPush}
              onEdit={onEditGoto}
            />
          )}

          {phase.kind === "success" && (
            <PushResultPanel
              result={phase.result}
              projectKey={projectKey}
              onNewSession={() => void onNewSession()}
            />
          )}
        </div>

        {phase.kind === "preflight" && (
          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-subtle">
            <Button variant="ghost" size="md" onClick={onCloseGoto}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => void onPush()}
              disabled={!canPush}
              leading={<Upload size={14} />}
            >
              Push {count} test case{count === 1 ? "" : "s"}
            </Button>
          </footer>
        )}

        {phase.kind === "error" && !canPush && (
          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-subtle">
            <Button variant="ghost" size="md" onClick={onGenerateGoto}>
              Back to Generate
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}

function PushingState({ count }: { count: number }) {
  return (
    <div
      className="flex flex-col items-center py-6 gap-4"
      role="status"
      aria-live="polite"
    >
      <Loader2
        size={36}
        className="animate-spin-fast text-accent"
        aria-hidden
      />
      <div className="text-center">
        <p className="t-title text-ink">
          Pushing {count} test case{count === 1 ? "" : "s"}…
        </p>
        <p className="t-meta text-ink-muted mt-1 max-w-xs">
          Don’t close the app — this can take a moment for large batches.
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  onEdit,
}: {
  message: string;
  onRetry: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-err/40 bg-err/10 px-3 py-2 text-[13px] text-err"
      >
        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
        <p className="flex-1 min-w-0 break-words">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="md"
          onClick={onEdit}
          leading={<ArrowLeft size={14} />}
        >
          Edit cases
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onRetry}
          leading={<Upload size={14} />}
        >
          Retry push
        </Button>
      </div>
    </div>
  );
}

function PushSkeleton() {
  return (
    <div className="flex items-start justify-center flex-1 px-6 py-8 animate-fade-in">
      <div className="w-full max-w-[560px] rounded-xl border border-subtle bg-surface-elevated shadow-float">
        <div className="px-5 py-4 border-b border-subtle">
          <div className="h-5 w-40 rounded bg-surface-overlay animate-pulse" />
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="h-5 w-3/4 mx-auto rounded bg-surface-overlay animate-pulse" />
          <div className="h-9 rounded bg-surface-overlay animate-pulse" />
          <div className="h-5 w-1/2 rounded bg-surface-overlay animate-pulse" />
          <div className="h-12 rounded bg-surface-overlay animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/** Optionally tag every test case name with `[KEY]` if not already prefixed. */
function decorate(
  cases: TestCase[],
  tagPrefix: boolean,
  projectKey: string,
): TestCase[] {
  if (!tagPrefix || !projectKey) return cases;
  const prefix = `[${projectKey}]`;
  return cases.map((c) => ({
    ...c,
    name: c.name.startsWith(prefix) ? c.name : `${prefix} ${c.name}`,
  }));
}
