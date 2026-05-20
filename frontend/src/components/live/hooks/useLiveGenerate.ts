import { useCallback, useMemo, useState } from "react";
import * as api from "@/components/live/lib/api";
import type { JiraTicket } from "@/types";
import type { ContextMetadata, LiveGenerateResponse } from "@/types/live";

export type PrContextState =
  | "linked_prs_used"
  | "no_linked_prs"
  | "dev_links_unavailable"
  | "provider_not_connected"
  | "dev_links_unparseable"
  | "ticket_enrichment_failed"
  | "none";

export interface PrContextSummary {
  state: PrContextState;
  message: string;
}

export type DbContextState =
  | "schema_used"
  | "skipped_no_signal"
  | "not_configured"
  | "pyodbc_missing"
  | "odbc_driver_missing"
  | "connection_failed"
  | "login_failed"
  | "database_unavailable"
  | "metadata_permission_denied"
  | "schema_allowlist_empty"
  | "table_allowlist_filtered_all"
  | "unavailable"
  | "none";

export interface DbContextSummary {
  state: DbContextState;
  message: string;
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "SQL Server not configured",
  pyodbc_missing: "SQL backend dependency missing",
  odbc_driver_missing: "SQL ODBC driver missing",
  connection_failed: "SQL connection failed",
  login_failed: "SQL login failed",
  database_unavailable: "SQL database unavailable",
  metadata_permission_denied: "SQL metadata permission denied",
  schema_allowlist_empty: "SQL schema allowlist empty",
  table_allowlist_filtered_all: "SQL table allowlist excluded all tables",
  unavailable: "SQL unavailable",
};

export interface UseLiveGenerateResult {
  generating: boolean;
  result: LiveGenerateResponse | null;
  error: string | null;
  /** Compact provider/tool labels for the "Using tools:" indicator. */
  toolsUsed: string[];
  contextMetadata: ContextMetadata | null;
  prContext: PrContextSummary | null;
  dbContext: DbContextSummary | null;
  reset: () => void;
  generate: (ticket: JiraTicket, instructions: string) => Promise<void>;
}

const PROVIDER_LABEL: Record<string, string> = {
  atlassian: "jira.ticket",
  github: "github.pr_diff",
  ado: "ado.pr_diff",
  sql_server: "sql.schema",
  zephyr_read: "zephyr.existing_tests",
};

function compactToolLabels(meta: ContextMetadata | null | undefined): string[] {
  if (!meta) return [];
  const errored = new Set(meta.errors.map((e) => e.provider));
  // Show only providers that ran without an error, in routing order.
  const ordered = meta.routing_decisions
    .filter((d) => d.included && !errored.has(d.provider))
    .map((d) => PROVIDER_LABEL[d.provider] ?? d.provider);
  return Array.from(new Set(ordered));
}

function summarizePrContext(
  meta: ContextMetadata | null | undefined,
): PrContextSummary | null {
  if (!meta) return null;

  const errored = new Set(meta.errors.map((e) => e.provider));
  const repoUsed = meta.routing_decisions.some(
    (d) => (d.provider === "github" || d.provider === "ado") && d.included && !errored.has(d.provider),
  );
  if (repoUsed) {
    return { state: "linked_prs_used", message: "Linked PRs found" };
  }

  // Inspect ticket-level enrichment errors (added in the live route).
  const codes = new Set(meta.errors.map((e) => e.code));
  if (codes.has("ticket_enrichment_failed")) {
    return {
      state: "ticket_enrichment_failed",
      message: "Could not re-fetch ticket; PR context skipped",
    };
  }
  if (codes.has("development_links_unavailable")) {
    return {
      state: "dev_links_unavailable",
      message: "Jira Development links could not be loaded",
    };
  }
  if (codes.has("repo_provider_not_configured")) {
    return {
      state: "provider_not_connected",
      message: "PR link found but provider is not connected",
    };
  }
  if (codes.has("development_links_unparseable")) {
    return {
      state: "dev_links_unparseable",
      message: "PR link found but could not be parsed",
    };
  }
  if (codes.has("no_development_links")) {
    return { state: "no_linked_prs", message: "No linked PRs found in Jira Development" };
  }
  return null;
}

export function useLiveGenerate(): UseLiveGenerateResult {
  const [generating, setGenerating] = useState<boolean>(false);
  const [result, setResult] = useState<LiveGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const generate = useCallback(
    async (ticket: JiraTicket, instructions: string) => {
      setGenerating(true);
      setError(null);
      setResult(null);
      try {
        const r = await api.liveGenerate(ticket, instructions);
        setResult(r);
      } catch (e: any) {
        setError(e?.message ?? "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const toolsUsed = useMemo(
    () => compactToolLabels(result?.context_metadata),
    [result],
  );

  const prContext = useMemo(
    () => summarizePrContext(result?.context_metadata),
    [result],
  );

  const dbContext = useMemo(
    () => summarizeDbContext(result?.context_metadata),
    [result],
  );

  return {
    generating,
    result,
    error,
    toolsUsed,
    contextMetadata: result?.context_metadata ?? null,
    prContext,
    dbContext,
    reset,
    generate,
  };
}

export type ContextSourceLabel =
  | "Jira ticket"
  | "GitHub PR"
  | "Azure DevOps PR"
  | "SQL schema"
  | "Zephyr";

export type ContextSourceStatus = "used" | "skipped" | "unavailable" | "not_configured";

export interface ContextSourceRow {
  label: ContextSourceLabel;
  status: ContextSourceStatus;
  detail: string;
}

const SOURCE_BY_PROVIDER: Record<string, ContextSourceLabel> = {
  atlassian: "Jira ticket",
  github: "GitHub PR",
  ado: "Azure DevOps PR",
  sql_server: "SQL schema",
  zephyr_read: "Zephyr",
};

const SOURCES_IN_ORDER: ContextSourceLabel[] = [
  "Jira ticket",
  "GitHub PR",
  "Azure DevOps PR",
  "SQL schema",
  "Zephyr",
];

const REASON_FRIENDLY: Record<string, string> = {
  skipped_no_pr: "no PR linked",
  skipped_no_mapping: "no repo mapping",
  skipped_no_signal: "no backend/database signal",
  skipped_provider_unavailable: "provider not connected",
  no_development_links: "no PR linked",
  development_links_unavailable: "Jira Development links could not be loaded",
  development_links_unparseable: "PR link could not be parsed",
  ticket_enrichment_failed: "ticket re-fetch failed",
  repo_provider_not_configured: "provider not connected",
  not_configured: "not configured",
  pyodbc_missing: "backend dependency missing",
  odbc_driver_missing: "ODBC driver missing",
  connection_failed: "connection failed",
  login_failed: "login failed",
  database_unavailable: "database unavailable",
  metadata_permission_denied: "metadata permission denied",
};

export function summarizeContextSources(
  meta: ContextMetadata | null | undefined,
): ContextSourceRow[] {
  if (!meta) return [];

  const decisionByProvider: Record<string, { included: boolean; reasons: string[] }> = {};
  for (const d of meta.routing_decisions) {
    decisionByProvider[d.provider] = { included: d.included, reasons: d.reasons };
  }
  const errorsByProvider: Record<string, string[]> = {};
  for (const e of meta.errors) {
    (errorsByProvider[e.provider] ??= []).push(e.code);
  }

  const rows: ContextSourceRow[] = [];
  for (const label of SOURCES_IN_ORDER) {
    const provider = Object.keys(SOURCE_BY_PROVIDER).find(
      (k) => SOURCE_BY_PROVIDER[k] === label,
    )!;
    const decision = decisionByProvider[provider];
    const errs = errorsByProvider[provider] ?? [];
    const friendly = errs
      .map((c) => REASON_FRIENDLY[c] ?? c)
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .join(", ");

    if (decision?.included && errs.length === 0) {
      rows.push({ label, status: "used", detail: "Used" });
    } else if (errs.length > 0) {
      rows.push({
        label,
        status: "unavailable",
        detail: friendly || "Unavailable",
      });
    } else if (decision && !decision.included) {
      const reason = decision.reasons
        .map((r) => REASON_FRIENDLY[r] ?? "")
        .filter(Boolean)[0];
      rows.push({
        label,
        status: reason === "not configured" ? "not_configured" : "skipped",
        detail: reason ? `Skipped — ${reason}` : "Skipped",
      });
    } else {
      // No decision recorded at all (provider not in routing): leave hidden by
      // returning a not_configured row that callers can choose to omit.
      rows.push({ label, status: "not_configured", detail: "Not configured" });
    }
  }
  return rows;
}

function summarizeDbContext(
  meta: ContextMetadata | null | undefined,
): DbContextSummary | null {
  if (!meta) return null;

  const sqlDecision = meta.routing_decisions.find((d) => d.provider === "sql_server");
  const sqlErrors = meta.errors.filter((e) => e.provider === "sql_server");
  const erroredCodes = new Set(sqlErrors.map((e) => e.code));

  if (sqlDecision?.included && sqlErrors.length === 0) {
    return { state: "schema_used", message: "Database schema used" };
  }

  if (sqlDecision && !sqlDecision.included) {
    if (sqlDecision.reasons.includes("skipped_no_signal")) {
      return {
        state: "skipped_no_signal",
        message: "Skipped (no backend/database signal)",
      };
    }
    if (sqlDecision.reasons.includes("skipped_provider_unavailable")) {
      // The adapter error (if any) gives us the precise reason.
      const code = sqlErrors[0]?.code ?? "unavailable";
      return {
        state: (code as DbContextState),
        message: DB_ERROR_MESSAGES[code] ?? "SQL unavailable",
      };
    }
  }

  if (sqlErrors.length > 0) {
    const code = sqlErrors[0].code;
    return {
      state: (erroredCodes.has(code) ? code : "unavailable") as DbContextState,
      message: DB_ERROR_MESSAGES[code] ?? "SQL unavailable",
    };
  }

  return null;
}
