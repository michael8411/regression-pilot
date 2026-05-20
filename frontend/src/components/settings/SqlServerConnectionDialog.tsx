import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  X,
} from "@/lib/icons";
import { Button, IconButton } from "@/components/ui";
import { BrandTile } from "./CoreConnectionDialog";
import { saveSqlServerCredentials, testSqlServer } from "./lib/coreConnectionsApi";
import type {
  SqlServerConnectionPayload,
  SqlServerDiagnostics,
} from "@/types/coreConnections";

interface Props {
  initial?: {
    database?: string;
    schemaAllowlist?: string;
    tableAllowlist?: string;
    includeProcs?: boolean;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function SqlServerConnectionDialog({ initial, onClose, onSaved }: Props) {
  const [connStr, setConnStr] = useState("");
  const [revealConn, setRevealConn] = useState(false);
  const [database, setDatabase] = useState(initial?.database ?? "");
  const [schemaAllowlist, setSchemaAllowlist] = useState(
    initial?.schemaAllowlist ?? "dbo"
  );
  const [tableAllowlist, setTableAllowlist] = useState(
    initial?.tableAllowlist ?? ""
  );
  const [includeProcs, setIncludeProcs] = useState(
    initial?.includeProcs ?? false
  );
  const [testState, setTestState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "result"; diag: SqlServerDiagnostics }
    | { kind: "err"; detail: string }
  >({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canTest = Boolean(connStr.trim());

  const buildPayload = (): SqlServerConnectionPayload => ({
    sql_server_connection_string: connStr.trim() || undefined,
    sql_server_database: database.trim() || undefined,
    sql_server_schema_allowlist: schemaAllowlist.trim() || undefined,
    sql_server_table_allowlist: tableAllowlist.trim() || undefined,
    sql_server_include_procs: includeProcs,
  });

  const handleTest = async () => {
    setTestState({ kind: "running" });
    try {
      await saveSqlServerCredentials(buildPayload());
      const diag = await testSqlServer();
      setTestState({ kind: "result", diag });
    } catch (e: any) {
      setTestState({ kind: "err", detail: e?.message ?? "Connection failed" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSqlServerCredentials(buildPayload());
      onSaved();
    } catch (e: any) {
      setTestState({ kind: "err", detail: e?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect SQL Server"
      onClick={onClose}
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 92vw)", maxHeight: "90vh" }}
        className="flex flex-col overflow-hidden rounded-2xl border border-muted bg-surface-elevated shadow-float"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <BrandTile color="#CC2927" label="SQL" size={28} />
            <h2 className="text-[14px] font-semibold text-ink">
              Connect SQL Server
            </h2>
          </div>
          <IconButton
            size="sm"
            icon={<X size={14} />}
            aria-label="Close"
            onClick={onClose}
          />
        </header>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {/* Info banner */}
          <div className="rounded-md border border-info/20 bg-info/5 px-3 py-2 flex gap-2 items-start">
            <Info size={13} className="text-info mt-0.5 shrink-0" />
            <span className="text-[11.5px] text-ink-secondary leading-snug">
              Use a read-only SQL account. Testdeck reads schema metadata only
              and does not run arbitrary queries or sample table data.
            </span>
          </div>

          {/* Connection string */}
          <div>
            <label className="text-[11px] text-ink-muted mb-1 block">
              Connection string <span className="text-err">*</span>
            </label>
            <div className="relative">
              <input
                type={revealConn ? "text" : "password"}
                value={connStr}
                onChange={(e) => {
                  setConnStr(e.target.value);
                  if (testState.kind !== "idle") setTestState({ kind: "idle" });
                }}
                placeholder="Driver={ODBC Driver 18 for SQL Server};Server=...;Database=...;Trusted_Connection=yes;"
                spellCheck={false}
                autoComplete="off"
                className="g-input text-[11.5px] pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setRevealConn((v) => !v)}
                aria-label={revealConn ? "Hide value" : "Show value"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                {revealConn ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Database name */}
          <Field
            label="Database (optional — if not in connection string)"
            value={database}
            onChange={setDatabase}
            placeholder="MyDatabase"
          />

          {/* Schema allowlist */}
          <Field
            label="Schema allowlist"
            value={schemaAllowlist}
            onChange={setSchemaAllowlist}
            placeholder="dbo"
            hint="Comma-separated schemas. Defaults to dbo."
          />

          {/* Table allowlist */}
          <Field
            label="Table allowlist (optional)"
            value={tableAllowlist}
            onChange={setTableAllowlist}
            placeholder="dbo.TimeCard, dbo.Employee"
            hint="Leave empty to allow all tables in the schema allowlist."
          />

          {/* Include stored procedures */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeProcs}
              onChange={(e) => setIncludeProcs(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="text-[12px] text-ink-secondary leading-snug">
              Include stored procedure definitions
              <span className="block text-[11px] text-ink-muted mt-0.5">
                Adds truncated procedure definitions to the prompt context.
                Disable for large schemas to stay within the prompt budget.
              </span>
            </span>
          </label>

          {/* Test button */}
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              leading={<Activity size={12} />}
              onClick={handleTest}
              disabled={!canTest || testState.kind === "running"}
              loading={testState.kind === "running"}
            >
              Test connection
            </Button>
          </div>

          {testState.kind === "result" && (
            <DiagnosticsCard diag={testState.diag} />
          )}
          {testState.kind === "err" && (
            <div className="rounded-md border border-err/30 bg-err/10 px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={13} className="text-err" />
              <span className="text-[11.5px] text-err">{testState.detail}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving || !connStr.trim()}
            loading={saving}
          >
            Save
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

const DIAGNOSTIC_NEXT_STEPS: Record<string, string> = {
  not_configured: "Enter a SQL Server connection string and save.",
  pyodbc_missing:
    "pyodbc is not installed in the backend environment. Install backend requirements, then restart Testdeck.",
  odbc_driver_missing:
    "No SQL Server ODBC driver was detected. Install Microsoft ODBC Driver 18 or 17 for SQL Server.",
  connection_failed:
    "Verify the server is reachable and the connection string is correct.",
  login_failed:
    "Check the credentials in the connection string. Use a read-only account.",
  database_unavailable:
    "Check the Database name and confirm the account has access.",
  metadata_permission_denied:
    "Grant the account VIEW DEFINITION (or use a read-only account with metadata access).",
  schema_allowlist_empty:
    "Adjust the schema allowlist so it matches a schema visible on this server.",
  table_allowlist_filtered_all:
    "Adjust the table allowlist or remove it to let inference pick candidates.",
  unknown_error: "Check the backend logs for the error class and retry.",
};

function DiagnosticsCard({ diag }: { diag: SqlServerDiagnostics }) {
  const tone = diag.ok
    ? "border-ok/30 bg-ok/10"
    : "border-warn/30 bg-warn/5";
  const headline = diag.ok
    ? `Connected${diag.database ? ` · ${diag.database}` : ""}`
    : diag.error_message || "SQL Server diagnostic complete";
  const nextStep = diag.ok
    ? null
    : DIAGNOSTIC_NEXT_STEPS[diag.error_code] ?? null;

  return (
    <div className={`rounded-md border ${tone} px-3 py-2 space-y-1`}>
      <div className="flex items-center gap-2">
        {diag.ok ? (
          <CheckCircle2 size={13} className="text-ok" />
        ) : (
          <AlertTriangle size={13} className="text-warn" />
        )}
        <span
          className={`text-[11.5px] ${diag.ok ? "text-ok" : "text-ink-secondary"}`}
        >
          {headline}
        </span>
      </div>
      <ul className="pl-5 list-disc text-[11px] text-ink-muted space-y-0.5">
        <li>
          ODBC driver: {diag.driver_detected ? "detected" : "not detected"}
        </li>
        <li>
          Connection: {diag.connection_ok ? "ok" : "—"}
        </li>
        <li>
          Metadata read: {diag.metadata_ok ? "ok" : "—"}
        </li>
        <li>
          Visible schemas:{" "}
          {diag.accessible_schemas.length > 0
            ? diag.accessible_schemas.join(", ")
            : "—"}
        </li>
        <li>
          Tables in allowed schemas: {diag.table_count}
        </li>
      </ul>
      {nextStep && (
        <div className="text-[11px] text-ink-muted pt-1">
          Next step: {nextStep}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[11px] text-ink-muted mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="g-input text-[12.5px] font-mono"
      />
      {hint && (
        <div className="mt-1 text-[10.5px] text-ink-faint">{hint}</div>
      )}
    </div>
  );
}
