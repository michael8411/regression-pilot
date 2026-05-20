/**
 * Phase 05 — Live test-case generator panel.
 *
 * Used in two places now:
 *   1. (legacy) Direct rendering — kept as a standalone container so callers
 *      that haven't migrated to tabbed IA continue to work.
 *   2. (new) The drawer AI tab — composes the exported subcomponents
 *      (`LiveGeneratePromptField`, `LiveGenerateToggles`, `LiveGenerateToolsRow`,
 *      `LiveGenerateResultList`) so the AI panel never duplicates this markup.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, X, Sparkles } from "@/lib/icons";
import { clsx } from "clsx";
import {
  useLiveGenerate,
  summarizeContextSources,
  type ContextSourceRow,
  type DbContextSummary,
  type PrContextSummary,
} from "./hooks/useLiveGenerate";
import { useLiveGeneratedCases } from "./hooks/useLiveGeneratedCases";
import { useOptionalLiveActivityFeed } from "./activity";
import { GeneratedTestCaseCard } from "./GeneratedTestCaseCard";
import { GenerationSkeletonList } from "./visual";
import type { GeneratedTestCases, JiraTicket } from "@/types";

// ---------------------------------------------------------------------------
// Public toggle state shape (shared between standalone panel and drawer AI tab)
// ---------------------------------------------------------------------------

export interface LiveGenerateOptions {
  includeNegativePaths: boolean;
  includeEdgeCases: boolean;
  maxCases: number;
}

export const DEFAULT_GENERATE_OPTIONS: LiveGenerateOptions = {
  includeNegativePaths: true,
  includeEdgeCases: true,
  maxCases: 6,
};

/** Build a combined "instructions" string from user prompt + named toggles. */
export function composeInstructions(
  prompt: string,
  opts: LiveGenerateOptions,
): string {
  const directives: string[] = [];
  if (opts.includeNegativePaths) directives.push("Include negative paths.");
  if (opts.includeEdgeCases) directives.push("Include edge cases.");
  if (opts.maxCases > 0) directives.push(`Generate up to ${opts.maxCases} cases.`);

  const base = prompt.trim();
  if (!base) return directives.join(" ");
  return [base, ...directives].join("\n\n");
}

// ---------------------------------------------------------------------------
// Subcomponent: PROMPT label + textarea
// ---------------------------------------------------------------------------

interface PromptFieldProps {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}

export function LiveGeneratePromptField({
  value,
  onChange,
  rows = 3,
}: PromptFieldProps) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-muted font-mono mb-1.5">
        Prompt
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Optional focus: edge cases, negative scenarios, specific user roles…"
        rows={rows}
        className="g-input w-full text-[11.5px] min-h-[60px] max-h-[160px] resize-none font-mono"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: named-toggle card
// ---------------------------------------------------------------------------

interface TogglesProps {
  options: LiveGenerateOptions;
  onChange: (next: LiveGenerateOptions) => void;
  disabled?: boolean;
}

export function LiveGenerateToggles({ options, onChange, disabled }: TogglesProps) {
  const set = <K extends keyof LiveGenerateOptions>(
    key: K,
    value: LiveGenerateOptions[K],
  ) => onChange({ ...options, [key]: value });

  return (
    <div
      className="rounded-lg border border-subtle bg-surface-elevated p-3 flex flex-col gap-2.5"
      style={{ borderRadius: "var(--radius-lg, 10px)" }}
    >
      <NamedToggle
        label="Include negative paths"
        checked={options.includeNegativePaths}
        onChange={(v) => set("includeNegativePaths", v)}
        disabled={disabled}
      />
      <NamedToggle
        label="Include edge cases"
        checked={options.includeEdgeCases}
        onChange={(v) => set("includeEdgeCases", v)}
        disabled={disabled}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-ink-secondary">Max cases</span>
        <input
          type="number"
          min={1}
          max={20}
          value={options.maxCases}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) set("maxCases", Math.max(1, Math.min(20, n)));
          }}
          disabled={disabled}
          className="g-input w-16 text-[11.5px] text-right font-mono"
          aria-label="Maximum number of cases"
        />
      </div>
    </div>
  );
}

function NamedToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-[11.5px] text-ink-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0",
          checked ? "bg-accent" : "bg-surface-overlay",
          disabled && "opacity-50",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: "Using tools:" row
// ---------------------------------------------------------------------------

interface ToolsRowProps {
  /** Optional list of tool identifiers the routing layer surfaced. */
  toolsUsed?: ReadonlyArray<string>;
}

/**
 * Mono `--ink-muted` "Using tools:" row. When the MCP context-bundle work
 * surfaces real tool identifiers, callers pass them via `toolsUsed`. Until
 * then we render a stable placeholder so the visual contract is intact.
 */
export function LiveGenerateToolsRow({ toolsUsed }: ToolsRowProps) {
  const list = toolsUsed && toolsUsed.length > 0 ? toolsUsed : ["Gemini"];
  return (
    <div className="text-[10.5px] font-mono text-ink-muted">
      Using tools: <span className="text-ink-secondary">{list.join(" · ")}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: generated test-case result list
// ---------------------------------------------------------------------------

interface ResultListProps {
  result: GeneratedTestCases;
}

export function LiveGenerateResultList({ result }: ResultListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {(result.test_cases ?? []).map((tc, i) => (
        <li key={i}>
          <GeneratedTestCaseCard testCase={tc} index={i} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Legacy standalone panel (kept so older call sites continue to work).
// New code should use the AI drawer panel which composes the subcomponents
// above.
// ---------------------------------------------------------------------------

interface Props {
  ticket: JiraTicket;
  onClose: () => void;
}

const PR_CONTEXT_TONE: Record<PrContextSummary["state"], string> = {
  linked_prs_used: "text-success",
  no_linked_prs: "text-ink-muted",
  dev_links_unavailable: "text-warn",
  provider_not_connected: "text-warn",
  dev_links_unparseable: "text-warn",
  ticket_enrichment_failed: "text-warn",
  none: "text-ink-muted",
};

const DB_CONTEXT_TONE: Record<DbContextSummary["state"], string> = {
  schema_used: "text-success",
  skipped_no_signal: "text-ink-muted",
  not_configured: "text-ink-muted",
  pyodbc_missing: "text-warn",
  odbc_driver_missing: "text-warn",
  connection_failed: "text-warn",
  login_failed: "text-warn",
  database_unavailable: "text-warn",
  metadata_permission_denied: "text-warn",
  schema_allowlist_empty: "text-warn",
  table_allowlist_filtered_all: "text-warn",
  unavailable: "text-warn",
  none: "text-ink-muted",
};

const SOURCE_STATUS_TONE: Record<ContextSourceRow["status"], string> = {
  used: "text-success",
  skipped: "text-ink-muted",
  unavailable: "text-warn",
  not_configured: "text-ink-muted",
};

export function LiveGeneratePanel({ ticket, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<LiveGenerateOptions>(
    DEFAULT_GENERATE_OPTIONS,
  );
  const { generate, generating, result, error, reset, toolsUsed, prContext, dbContext } =
    useLiveGenerate();
  const sources = summarizeContextSources(result?.context_metadata);
  const { save: persistCases } = useLiveGeneratedCases(ticket.key);
  const activity = useOptionalLiveActivityFeed();

  // Persist + emit activity exactly once per successful generation.
  const persistedResultRef = useRef<GeneratedTestCases | null>(null);
  useEffect(() => {
    if (!result || persistedResultRef.current === result) return;
    persistedResultRef.current = result;
    const cases = result.test_cases ?? [];
    void persistCases({
      ticketKey: ticket.key,
      instructions: composeInstructions(prompt, options),
      cases,
      status: "draft",
    });
    if (activity) {
      void activity.record({
        intent: "cases_generated",
        summary: `generated ${ticket.key}`,
        detail: `${cases.length} test cases`,
        ticket_key: ticket.key,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(result.test_cases, null, 2),
      );
    } catch {
      /* ignore */
    }
  };

  const handleGenerate = () => {
    void generate(ticket, composeInstructions(prompt, options));
  };

  return (
    <section className="px-4 py-3 border-b border-subtle bg-surface-overlay/30">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold flex items-center gap-1.5">
          <Sparkles size={11} className="text-ai" />
          Generate live test cases
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close generator"
          className="text-ink-muted hover:text-ink"
        >
          <X size={11} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <LiveGeneratePromptField value={prompt} onChange={setPrompt} />
        <LiveGenerateToggles options={options} onChange={setOptions} disabled={generating} />
        <LiveGenerateToolsRow />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="g-btn-solid text-[12px] px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {generating && <Loader2 size={11} className="animate-spin" />}
          {generating ? "Generating…" : result ? "Regenerate" : "Generate"}
        </button>
        {result && (
          <>
            <button
              type="button"
              onClick={() => void copyJson()}
              className="g-btn text-[12px] px-3 py-1.5"
            >
              Copy as JSON
            </button>
            <button
              type="button"
              onClick={reset}
              className="g-btn text-[12px] px-3 py-1.5"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-2 py-1.5"
        >
          {error}
        </div>
      )}

      {(generating || toolsUsed.length > 0) && (
        <div className="mt-2 font-mono text-[10.5px] text-ink-muted truncate">
          Using tools:{" "}
          {generating && toolsUsed.length === 0 ? (
            <span className="text-ink-muted">routing…</span>
          ) : (
            toolsUsed.map((t, i) => (
              <span key={t}>
                {i > 0 && <span className="text-ink-faint">, </span>}
                <span className="text-accent-text">{t}</span>
              </span>
            ))
          )}
        </div>
      )}

      {prContext && (
        <div
          className={`mt-1 text-[10.5px] ${PR_CONTEXT_TONE[prContext.state]}`}
        >
          PR context: {prContext.message}
        </div>
      )}

      {dbContext && (
        <div
          className={`mt-1 text-[10.5px] ${DB_CONTEXT_TONE[dbContext.state]}`}
        >
          SQL context: {dbContext.message}
        </div>
      )}

      {result && sources.length > 0 && (
        <div className="mt-2 rounded-md border border-subtle bg-surface-overlay/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted mb-1">
            Context sources
          </div>
          <ul className="text-[10.5px] flex flex-col gap-0.5">
            {sources.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-ink-secondary">{row.label}</span>
                <span className={SOURCE_STATUS_TONE[row.status]}>
                  {row.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {generating && (
        <div className="mt-3">
          <GenerationSkeletonList
            count={options.maxCases}
            ticketKey={ticket.key}
          />
        </div>
      )}

      {!generating && result && (
        <div className="mt-3">
          <LiveGenerateResultList result={result} />
        </div>
      )}
    </section>
  );
}
