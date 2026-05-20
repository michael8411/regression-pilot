import { isFeatureEnabled } from "@/lib/featureFlags";
import { cn } from "@/lib/cn";
import { McpEnvEditor } from "./McpEnvEditor";
import type { McpTransport } from "@/types/mcp";

export type HttpAuthType = "none" | "bearer" | "token";

export interface TransportFormState {
  transport: McpTransport;
  // stdio
  command: string;
  args: string;
  env: Record<string, string>;
  // http / sse
  url: string;
  authType: HttpAuthType;
  authToken: string;
}

interface Props {
  value: TransportFormState;
  onChange: (next: TransportFormState) => void;
}

const TRANSPORTS: { id: McpTransport; label: string; flag?: string }[] = [
  { id: "stdio", label: "STDIO" },
  { id: "http", label: "HTTP", flag: "mcpTransportHttpV1" },
  { id: "sse", label: "SSE", flag: "mcpTransportSseV1" },
];

export function McpTransportFields({ value, onChange }: Props) {
  const set = <K extends keyof TransportFormState>(
    k: K,
    v: TransportFormState[K],
  ) => onChange({ ...value, [k]: v });

  const enabledTabs = TRANSPORTS.filter(
    (t) => !t.flag || isFeatureEnabled(t.flag as any),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Transport tabs (mockup STDIO / HTTP / SSE) */}
      <div className="flex border-b border-subtle gap-1">
        {enabledTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange({ ...value, transport: t.id })}
            className={cn(
              "px-3 py-1.5 text-[11.5px] font-mono uppercase tracking-wider transition-colors",
              "border-b-2 -mb-px",
              value.transport === t.id
                ? "border-accent text-accent-text"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {value.transport === "stdio" && (
        <>
          <Field label="Command">
            <input
              value={value.command}
              onChange={(e) => set("command", e.target.value)}
              placeholder="npx"
              className="g-input text-[12px] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Args"
            hint="Space-separated. Quote args containing spaces."
          >
            <input
              value={value.args}
              onChange={(e) => set("args", e.target.value)}
              placeholder="-y @modelcontextprotocol/server-github"
              className="g-input text-[12px] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <McpEnvEditor
            value={value.env}
            onChange={(env) => set("env", env)}
          />
        </>
      )}

      {value.transport === "http" && (
        <>
          <Field label="URL">
            <input
              value={value.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://mcp.company.internal/confluence"
              className="g-input text-[12px] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Auth">
            <select
              value={value.authType}
              onChange={(e) =>
                set("authType", e.target.value as HttpAuthType)
              }
              className="g-input text-[12px]"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="token">Token</option>
            </select>
          </Field>
          {value.authType !== "none" && (
            <Field label="Token">
              <input
                type="password"
                value={value.authToken}
                onChange={(e) => set("authToken", e.target.value)}
                placeholder="••••••••••••••••"
                className="g-input text-[12px] font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
        </>
      )}

      {value.transport === "sse" && (
        <>
          <Field label="URL">
            <input
              value={value.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://..."
              className="g-input text-[12px] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Token">
            <input
              type="password"
              value={value.authToken}
              onChange={(e) => set("authToken", e.target.value)}
              placeholder="••••••••••••••••"
              className="g-input text-[12px] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] text-ink-secondary leading-snug">
            SSE transport is gated behind a server flag and may not yet
            handshake successfully. Use STDIO or HTTP for production
            workloads today.
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-medium text-ink mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}

/** Translate auth fields into the env dict the backend already encrypts. */
export function authToEnv(state: TransportFormState): Record<string, string> {
  if (state.transport === "stdio") return state.env;
  const env: Record<string, string> = {};
  if (state.authType !== "none" && state.authToken) {
    env.AUTH_TYPE = state.authType;
    env.AUTH_TOKEN = state.authToken;
  } else if (state.transport === "sse" && state.authToken) {
    env.AUTH_TYPE = "bearer";
    env.AUTH_TOKEN = state.authToken;
  }
  return env;
}

export function envToAuth(
  transport: McpTransport,
  env: Record<string, string>,
): { authType: HttpAuthType; authToken: string } {
  if (transport === "stdio") return { authType: "none", authToken: "" };
  const t = (env.AUTH_TYPE as HttpAuthType) || "none";
  return {
    authType: t === "bearer" || t === "token" ? t : "none",
    authToken: env.AUTH_TOKEN ?? "",
  };
}
