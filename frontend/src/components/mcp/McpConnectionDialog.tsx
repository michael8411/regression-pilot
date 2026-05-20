import { useEffect, useState } from "react";
import { Button, Spinner, Toggle } from "@/components/ui";
import { useMcpConnections } from "./McpConnectionsProvider";
import { McpAutoApproveEditor } from "./McpAutoApproveEditor";
import { McpModal } from "./McpModal";
import {
  McpTransportFields,
  authToEnv,
  envToAuth,
  type TransportFormState,
} from "./McpTransportFields";
import { findPreset, MCP_PRESETS } from "./lib/presets";
import { getConnection } from "./lib/api";
import type { McpConnection } from "@/types/mcp";

interface FormState extends TransportFormState {
  name: string;
  autoApprove: string[];
  enabled: boolean;
}

const empty: FormState = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  env: {},
  url: "",
  authType: "none",
  authToken: "",
  autoApprove: [],
  enabled: true,
};

interface Props {
  mode: "create" | "edit";
  existing?: McpConnection;
  onClose: () => void;
}

function parseArgs(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const tokens = trimmed.match(/("[^"]*"|\S+)/g) ?? [];
  return tokens.map((a) => a.replace(/^"|"$/g, ""));
}

export function McpConnectionDialog({ mode, existing, onClose }: Props) {
  const { create, update } = useMcpConnections();
  const [form, setForm] = useState<FormState>(empty);
  const [presetId, setPresetId] = useState<string>("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !existing) return;
    let cancelled = false;
    void (async () => {
      try {
        const full = await getConnection(existing.id);
        if (cancelled) return;
        const auth = envToAuth(full.transport, full.env);
        setForm({
          name: full.name,
          transport: full.transport,
          command: full.command,
          args: full.args.join(" "),
          env: full.env,
          url: full.url,
          authType: auth.authType,
          authToken: auth.authToken,
          autoApprove: full.autoApprove,
          enabled: full.enabled,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load connection");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existing, mode]);

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = findPreset(id);
    if (!preset || preset.id === "custom") return;
    setForm((prev) => ({
      ...prev,
      transport: "stdio",
      name: preset.label,
      command: preset.command,
      args: preset.args.join(" "),
      env: Object.fromEntries(
        preset.envKeys.map((k) => [k, prev.env[k] ?? ""]),
      ),
      autoApprove: preset.suggestedAutoApprove,
    }));
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const env = authToEnv(form);
      const payload = {
        name: form.name.trim(),
        command: form.transport === "stdio" ? form.command.trim() : "",
        args: form.transport === "stdio" ? parseArgs(form.args) : [],
        env,
        autoApprove: form.autoApprove,
        enabled: form.enabled,
        transport: form.transport,
        url: form.transport === "stdio" ? "" : form.url.trim(),
      };
      if (mode === "create") {
        await create(payload);
      } else if (existing) {
        await update(existing.id, payload);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "create"
      ? "Add MCP server"
      : `Edit ${existing?.name ?? "connection"}`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={() => void save()}
        disabled={busy || loading}
        leading={busy ? <Spinner size={12} /> : undefined}
      >
        Save
      </Button>
    </>
  );

  return (
    <McpModal title={title} ariaLabel={title} onClose={onClose} footer={footer}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {mode === "create" && form.transport === "stdio" && (
            <Field label="Preset">
              <select
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
                className="g-input text-[12px]"
              >
                {MCP_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-ink-faint">
                {findPreset(presetId)?.description ?? ""}
              </p>
            </Field>
          )}

          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder={
                form.transport === "stdio" ? "GitHub MCP" : "Confluence Search"
              }
              className="g-input text-[12.5px]"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <McpTransportFields value={form} onChange={(s) => setForm({ ...form, ...s })} />

          <McpAutoApproveEditor
            value={form.autoApprove}
            onChange={(autoApprove) =>
              setForm((f) => ({ ...f, autoApprove }))
            }
          />

          <div className="flex items-center gap-2">
            <Toggle
              checked={form.enabled}
              onChange={(enabled) =>
                setForm((f) => ({ ...f, enabled }))
              }
              aria-label="Enabled"
            />
            <span className="text-[12px] text-ink">Enabled</span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-err/30 bg-err/10 px-2 py-1.5 text-[11.5px] text-err"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </McpModal>
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
