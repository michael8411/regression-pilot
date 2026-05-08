import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Layers,
  Send,
  Sparkles,
  X,
} from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { generateTestCases } from "@/lib/api";
import type { JiraTicket } from "@/types";
import { useRegressionSession } from "./hooks/useRegressionSession";
import { ThemesSummary } from "./parts/ThemesSummary";
import { GenerationProgress } from "./parts/GenerationProgress";
import { EmptyState } from "./parts/EmptyState";

const MAX_CHARS = 4000;
const WARN_THRESHOLD = 200;

const EXAMPLE_CHIPS = [
  "Focus on edge cases",
  "Include negative paths",
  "Short and sharp steps",
  "Cover validation rules",
];

export function GenerateCases() {
  const { goto } = useRoute();
  const {
    state,
    isRestoring,
    saveState,
    saveStateBatch,
  } = useRegressionSession();

  const onEditThemes = useCallback(
    () => goto(["regression", "themes"]),
    [goto],
  );
  const onContinueToReview = useCallback(
    () => goto(["regression", "review"]),
    [goto],
  );

  if (isRestoring) return <GenerateSkeleton />;

  if (state.selectedTickets.length === 0) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <EmptyState
          icon={Layers}
          title="Pick tickets first"
          description="Generate needs tickets to work from."
          action={{
            label: "Go to Workbench",
            onClick: () => goto(["regression", "workbench"]),
          }}
        />
      </div>
    );
  }

  return (
    <GenerateCasesInner
      tickets={state.selectedTickets}
      themes={state.editableGroups ?? {}}
      initialInstructions={state.instructions}
      saveState={saveState}
      saveStateBatch={saveStateBatch}
      onEditThemes={onEditThemes}
      onContinueToReview={onContinueToReview}
    />
  );
}

interface InnerProps {
  tickets: JiraTicket[];
  themes: Record<string, JiraTicket[]>;
  initialInstructions: string;
  saveState: (key: string, value: unknown) => void;
  saveStateBatch: (items: Record<string, unknown>) => Promise<void>;
  onEditThemes: () => void;
  onContinueToReview: () => void;
}

function GenerateCasesInner({
  tickets,
  themes,
  initialInstructions,
  saveState,
  saveStateBatch,
  onEditThemes,
  onContinueToReview,
}: InnerProps) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the first save when the value already matches what was hydrated
  // from the session — prevents the "first-mount empty-string clobber"
  // pitfall called out in 4d §11.
  const lastSavedRef = useRef(initialInstructions);
  useEffect(() => {
    if (instructions === lastSavedRef.current) return;
    lastSavedRef.current = instructions;
    saveState("instructions", instructions);
  }, [instructions, saveState]);

  const themeCount = useMemo(
    () => Object.entries(themes).filter(([, list]) => list.length > 0).length,
    [themes],
  );

  const handleGenerate = useCallback(async () => {
    if (busy || tickets.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateTestCases(tickets, instructions);
      if (result.error) {
        setError(result.error);
        return;
      }
      // New test cases invalidate any stale push artifacts.
      await saveStateBatch({
        testCases: result.test_cases,
        pushResult: null,
        currentRoute: ["regression", "review"],
      });
      onContinueToReview();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Generation failed";
      setError(
        msg === "Failed to fetch"
          ? "Backend not reachable. Check that the local API is running."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    tickets,
    instructions,
    saveStateBatch,
    onContinueToReview,
  ]);

  // Command palette: "Generate test cases" (Mod+Enter)
  const generateCmd = useMemo<CommandItem | false>(
    () =>
      tickets.length === 0 || busy
        ? false
        : {
            id: "generate.run",
            group: "ai",
            ai: true,
            label: "Generate test cases",
            sub: "generate",
            icon: Sparkles,
            kbd: "Mod+Enter",
            action: { type: "run", run: handleGenerate },
          },
    [tickets.length, busy, handleGenerate],
  );
  useRegisterCommand(generateCmd);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <Header
        ticketCount={tickets.length}
        themeCount={themeCount}
        busy={busy}
        canGenerate={!busy && tickets.length > 0}
        onGenerate={handleGenerate}
      />
      <div className="flex flex-1 min-h-0 gap-4 px-6 py-5 overflow-auto">
        <ThemesSummary
          themes={themes}
          onEditThemes={onEditThemes}
          disabled={busy}
        />
        {busy ? (
          <GenerationProgress themes={themes} />
        ) : (
          <GuidancePanel
            value={instructions}
            onChange={setInstructions}
            error={error}
            onDismissError={() => setError(null)}
            onGenerate={handleGenerate}
            disabled={busy}
          />
        )}
      </div>
    </div>
  );
}

interface HeaderProps {
  ticketCount: number;
  themeCount: number;
  busy: boolean;
  canGenerate: boolean;
  onGenerate: () => Promise<void>;
}

function Header({
  ticketCount,
  themeCount,
  busy,
  canGenerate,
  onGenerate,
}: HeaderProps) {
  const themeText =
    themeCount === 0
      ? "no themes yet"
      : `${themeCount} ${themeCount === 1 ? "theme" : "themes"}`;
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
      <div className="min-w-0">
        <h1 className="t-h2 text-ink">Generate</h1>
        <p className="t-meta text-ink-muted">
          Build test cases from {ticketCount}{" "}
          {ticketCount === 1 ? "ticket" : "tickets"} across {themeText}.
        </p>
      </div>
      <Button
        variant="primary"
        size="md"
        loading={busy}
        disabled={!canGenerate}
        onClick={() => void onGenerate()}
        leading={<Send size={14} />}
        trailing={<ArrowRight size={14} />}
      >
        Generate ({ticketCount})
      </Button>
    </div>
  );
}

interface GuidancePanelProps {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  onDismissError: () => void;
  onGenerate: () => Promise<void>;
  disabled: boolean;
}

function GuidancePanel({
  value,
  onChange,
  error,
  onDismissError,
  onGenerate,
  disabled,
}: GuidancePanelProps) {
  const remaining = MAX_CHARS - value.length;
  const counterTone =
    value.length >= MAX_CHARS
      ? "text-err"
      : remaining < WARN_THRESHOLD
      ? "text-warn"
      : "text-ink-muted";

  const onTextareaKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "Enter" &&
      (e.metaKey || e.ctrlKey) &&
      !disabled &&
      !error
    ) {
      e.preventDefault();
      void onGenerate();
    }
  };

  const appendChip = (chip: string) => {
    const base = value.replace(/\s+$/, "");
    const next = base.length === 0 ? chip : `${base} ${chip}`;
    if (next.length > MAX_CHARS) return;
    onChange(next);
  };

  return (
    <div
      className={cn(
        "flex-1 min-w-0 flex flex-col",
        "rounded-lg border border-subtle bg-surface-elevated",
      )}
    >
      <header className="px-4 py-3 border-b border-subtle">
        <h2 className="t-title text-ink">Guidance</h2>
        <p className="t-meta text-ink-muted">
          Optional. Tell the AI what to focus on.
        </p>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0">
        <textarea
          value={value}
          maxLength={MAX_CHARS}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onTextareaKey}
          placeholder="Add anything you want the AI to consider when writing test cases…"
          aria-label="Guidance for the AI"
          disabled={disabled}
          className={cn(
            "flex-1 min-h-[180px] resize-none p-3 rounded-md",
            "bg-surface-input text-[13px] text-ink placeholder:text-ink-muted",
            "border border-subtle outline-none",
            "focus:border-accent focus:ring-2 focus:ring-accent/30",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        />

        <div className="flex items-center gap-1.5 flex-wrap">
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => appendChip(chip)}
              disabled={disabled || value.length + chip.length + 1 > MAX_CHARS}
              className={cn(
                "inline-flex items-center h-6 px-2 rounded-full text-[11px]",
                "bg-surface-overlay text-ink-muted border border-subtle",
                "hover:text-ink hover:bg-surface-overlay/80 hover:border-strong",
                "transition-colors duration-fast ease-smooth",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-overlay",
              )}
            >
              + {chip}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("tabular-nums", counterTone)}>
            {value.length} / {MAX_CHARS} chars
          </span>
          <span className="text-ink-muted">
            <kbd className="font-mono text-[10px]">⌘ Enter</kbd> to generate
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-err/40 bg-err/10 px-3 py-2 text-[12px] text-err flex items-start gap-2"
          >
            <CircleAlert size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0 break-words">{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="text-err/70 hover:text-err shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      <footer className="px-4 py-3 border-t border-subtle">
        <Button
          variant="primary"
          size="md"
          disabled={disabled}
          onClick={() => void onGenerate()}
          leading={<Send size={14} />}
          fullWidth
        >
          Generate test cases
        </Button>
      </footer>
    </div>
  );
}

function GenerateSkeleton() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
        <div className="space-y-2">
          <div className="h-5 w-28 rounded bg-surface-overlay animate-pulse" />
          <div className="h-3 w-72 rounded bg-surface-overlay animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-surface-overlay animate-pulse" />
      </div>
      <div className="flex flex-1 gap-4 px-6 py-5">
        <div className="w-[320px] shrink-0 rounded-lg border border-subtle bg-surface-elevated p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-6 rounded bg-surface-overlay animate-pulse"
            />
          ))}
        </div>
        <div className="flex-1 rounded-lg border border-subtle bg-surface-elevated p-4 space-y-3">
          <div className="h-40 rounded bg-surface-overlay animate-pulse" />
          <div className="h-9 w-full rounded bg-surface-overlay animate-pulse" />
        </div>
      </div>
    </div>
  );
}
