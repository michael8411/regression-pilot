import { useState, useEffect, useRef, useCallback } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { clsx } from "clsx";
import {
  Settings,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import {
  getConfigStatus,
  getPreferences,
  savePreferences,
  updateCredentials,
  testJiraConnection,
  testGeminiConnection,
  testZephyrConnection,
  getProjects,
  getZephyrFolders,
} from "@/lib/api";
import { useTheme } from "@/contexts/ThemeContext";
import type {
  ConfigStatus,
  Preferences,
  TestConnectionResult,
  JiraProject,
  ZephyrFolder,
} from "@/types";

interface SetupViewProps {
  onStatusResolved: (status: ConfigStatus) => void;
}

type TestState = "idle" | "loading" | "success" | "error";

const AI_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
];

export function SetupView({ onStatusResolved }: SetupViewProps) {
  // ── Preferences state ──
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Credentials state ──
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [zephyrToken, setZephyrToken] = useState("");
  const [credSaving, setCredSaving] = useState(false);
  const [credSaved, setCredSaved] = useState(false);

  // ── Connection test state ──
  const [jiraTest, setJiraTest] = useState<TestState>("idle");
  const [jiraResult, setJiraResult] = useState<TestConnectionResult | null>(null);
  const [geminiTest, setGeminiTest] = useState<TestState>("idle");
  const [geminiResult, setGeminiResult] = useState<TestConnectionResult | null>(null);
  const [zephyrTest, setZephyrTest] = useState<TestState>("idle");
  const [zephyrResult, setZephyrResult] = useState<TestConnectionResult | null>(null);

  // ── Visibility toggles ──
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showZephyrToken, setShowZephyrToken] = useState(false);

  // ── Dropdown data ──
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [folders, setFolders] = useState<ZephyrFolder[]>([]);

  // ── Theme ──
  const { theme, setTheme } = useTheme();

  // ── Load initial data ──
  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(() => {});

    getConfigStatus()
      .then((status) => {
        onStatusResolved(status);
        if (status.jira.base_url) setJiraUrl(status.jira.base_url);
        if (status.jira.email) setJiraEmail(status.jira.email);
        if (status.jira.configured) {
          getProjects()
            .then(setProjects)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch folders when zephyr is connected and scope has entries ──
  useEffect(() => {
    if (prefs?.project_scope?.length && zephyrResult?.ok) {
      getZephyrFolders(prefs.project_scope[0])
        .then(setFolders)
        .catch(() => {});
    }
  }, [prefs?.project_scope, zephyrResult?.ok]);

  // ── Preference auto-save with debounce ──
  const savePref = useCallback(
    (updates: Partial<Preferences>) => {
      setPrefs((prev) => (prev ? { ...prev, ...updates } : prev));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        savePreferences(updates).catch(() => {});
      }, 500);
    },
    [],
  );

  // ── Credential save ──
  const handleSaveCredentials = async () => {
    setCredSaving(true);
    setCredSaved(false);
    const payload: Record<string, string> = {};
    if (jiraUrl) payload.jira_base_url = jiraUrl;
    if (jiraEmail) payload.jira_email = jiraEmail;
    if (jiraToken) payload.jira_api_token = jiraToken;
    if (geminiKey) payload.gemini_api_key = geminiKey;
    if (zephyrToken) payload.zephyr_api_token = zephyrToken;
    try {
      await updateCredentials(payload);
      setCredSaved(true);
      const status = await getConfigStatus();
      onStatusResolved(status);
      if (status.jira.configured) {
        getProjects()
          .then(setProjects)
          .catch(() => {});
      }
      setTimeout(() => setCredSaved(false), 3000);
    } catch {
    } finally {
      setCredSaving(false);
    }
  };

  // ── Connection test handlers ──
  // Auto-save the relevant credentials before testing so the backend always
  // uses whatever is currently typed in the fields, not stale .env values.
  const handleTestJira = async () => {
    setJiraTest("loading");
    setJiraResult(null);
    const payload: Record<string, string> = {};
    if (jiraUrl) payload.jira_base_url = jiraUrl;
    if (jiraEmail) payload.jira_email = jiraEmail;
    if (jiraToken) payload.jira_api_token = jiraToken;
    if (Object.keys(payload).length) {
      try { await updateCredentials(payload); } catch { /* ignore */ }
    }
    const r = await testJiraConnection();
    setJiraResult(r);
    setJiraTest(r.ok ? "success" : "error");
  };

  const handleTestGemini = async () => {
    setGeminiTest("loading");
    setGeminiResult(null);
    if (geminiKey) {
      try { await updateCredentials({ gemini_api_key: geminiKey }); } catch { /* ignore */ }
    }
    const r = await testGeminiConnection();
    setGeminiResult(r);
    setGeminiTest(r.ok ? "success" : "error");
  };

  const handleTestZephyr = async () => {
    setZephyrTest("loading");
    setZephyrResult(null);
    if (zephyrToken) {
      try { await updateCredentials({ zephyr_api_token: zephyrToken }); } catch { /* ignore */ }
    }
    const r = await testZephyrConnection();
    setZephyrResult(r);
    setZephyrTest(r.ok ? "success" : "error");
  };

  // ── Theme helper for syncing to backend ──
  const handleThemeChange = (t: "dark" | "light" | "system") => {
    setTheme(t);
    savePref({ theme: t });
  };

  if (!prefs) {
    return (
      <div className="flex flex-1 justify-center items-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 p-6 animate-fade">
      <div className="mx-auto space-y-6 max-w-2xl">
        {/* Page Header */}
        <div className="flex gap-3 items-center mb-2">
          <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent/[0.15] flex items-center justify-center">
            <Settings size={18} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Settings</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Manage connections, preferences, and appearance
            </p>
          </div>
        </div>

        {/* ═══ Connections Section ═══ */}
        <section className="p-5 space-y-5 surface">
          <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-ink-muted">
            Connections
          </h3>

          {/* Jira */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-[12.5px] font-medium text-ink">Jira</label>
              <button
                onClick={() => openUrl("https://id.atlassian.com/manage-profile/security/api-tokens")}
                className="flex items-center gap-1 text-[10px] text-accent-text/60 hover:text-accent-text transition-colors"
              >
                Get API token <ExternalLink size={10} />
              </button>
            </div>
            <input
              value={jiraUrl}
              onChange={(e) => setJiraUrl(e.target.value)}
              placeholder="https://yoursite.atlassian.net"
              className="g-input text-[12.5px]"
            />
            <input
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="you@company.com"
              className="g-input text-[12.5px]"
            />
            <PasswordInput
              value={jiraToken}
              onChange={setJiraToken}
              placeholder="Jira API token"
              visible={showJiraToken}
              onToggleVisibility={() => setShowJiraToken(!showJiraToken)}
            />
            <TestButton
              state={jiraTest}
              result={jiraResult}
              onClick={handleTestJira}
              label="Test Jira"
            />
          </div>

          <hr className="border-subtle" />

          {/* Gemini */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-[12.5px] font-medium text-ink">Gemini</label>
              <button
                onClick={() => openUrl("https://aistudio.google.com/apikey")}
                className="flex items-center gap-1 text-[10px] text-accent-text/60 hover:text-accent-text transition-colors"
              >
                Get API key <ExternalLink size={10} />
              </button>
            </div>
            <PasswordInput
              value={geminiKey}
              onChange={setGeminiKey}
              placeholder="Gemini API key"
              visible={showGeminiKey}
              onToggleVisibility={() => setShowGeminiKey(!showGeminiKey)}
            />
            <TestButton
              state={geminiTest}
              result={geminiResult}
              onClick={handleTestGemini}
              label="Test Gemini"
            />
          </div>

          <hr className="border-subtle" />

          {/* Zephyr */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-[12.5px] font-medium text-ink flex items-center gap-1.5">
                Zephyr Scale
                <span className="text-[9px] text-ink-muted bg-surface-overlay px-1.5 py-0.5 rounded-md font-normal">
                  optional
                </span>
              </label>
              <button
                onClick={() => openUrl("https://support.smartbear.com/zephyr-scale-cloud/docs/rest-api/generating-api-access-tokens/")}
                className="flex items-center gap-1 text-[10px] text-accent-text/60 hover:text-accent-text transition-colors"
              >
                Get token <ExternalLink size={10} />
              </button>
            </div>
            <PasswordInput
              value={zephyrToken}
              onChange={setZephyrToken}
              placeholder="Zephyr API token"
              visible={showZephyrToken}
              onToggleVisibility={() => setShowZephyrToken(!showZephyrToken)}
            />
            <TestButton
              state={zephyrTest}
              result={zephyrResult}
              onClick={handleTestZephyr}
              label="Test Zephyr"
            />
          </div>

          <button
            onClick={handleSaveCredentials}
            disabled={credSaving}
            className="g-btn-solid w-full py-2.5 text-[13px] flex items-center justify-center gap-2"
          >
            {credSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : credSaved ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              "Save Credentials"
            )}
          </button>
        </section>

        {/* ═══ Preferences Section ═══ */}
        <section className="p-5 space-y-4 surface">
          <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-ink-muted">
            Preferences
          </h3>

          {/* Project Scope */}
          {projects.length > 0 && (
            <div>
              <label className="text-[12px] text-ink-secondary font-medium mb-2 block">
                Project Scope
              </label>
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => {
                  const active = prefs.project_scope.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      onClick={() => {
                        const next = active
                          ? prefs.project_scope.filter((k) => k !== p.key)
                          : [...prefs.project_scope, p.key];
                        savePref({ project_scope: next });
                      }}
                      className={clsx(
                        "text-[11px] px-2.5 py-1.5 rounded-md border transition-colors font-medium",
                        active
                          ? "bg-accent-dim text-accent-text border-accent/20"
                          : "bg-surface-input text-ink-muted border-subtle hover:border-muted",
                      )}
                    >
                      {p.key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Version Status */}
          <div>
            <label className="text-[12px] text-ink-secondary font-medium mb-1.5 block">
              Default Version Status
            </label>
            <select
              value={prefs.default_version_status}
              onChange={(e) =>
                savePref({
                  default_version_status: e.target.value as Preferences["default_version_status"],
                })
              }
              className="g-input text-[12.5px]"
            >
              <option value="unreleased">Unreleased</option>
              <option value="released">Released</option>
              <option value="all">All</option>
            </select>
          </div>

          {/* Auto-select tickets */}
          <div className="flex justify-between items-center">
            <label className="text-[12px] text-ink-secondary font-medium">
              Auto-select tickets
            </label>
            <Toggle
              checked={prefs.auto_select_tickets}
              onChange={(v) => savePref({ auto_select_tickets: v })}
            />
          </div>

          {/* Zephyr Folder */}
          {folders.length > 0 && (
            <div>
              <label className="text-[12px] text-ink-secondary font-medium mb-1.5 block">
                Default Zephyr Folder
              </label>
              <select
                value={prefs.default_zephyr_folder ?? ""}
                onChange={(e) =>
                  savePref({
                    default_zephyr_folder: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="g-input text-[12.5px]"
              >
                <option value="">None</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* ═══ AI Section ═══ */}
        <section className="p-5 space-y-4 surface">
          <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-ink-muted">
            AI
          </h3>

          <div>
            <label className="text-[12px] text-ink-secondary font-medium mb-1.5 block">
              Model
            </label>
            <select
              value={prefs.ai_model}
              onChange={(e) => savePref({ ai_model: e.target.value })}
              className="g-input text-[12.5px]"
            >
              {AI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] text-ink-secondary font-medium">
                Temperature
              </label>
              <span className="text-[11px] font-mono text-ink-muted tabular-nums">
                {prefs.ai_temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.7"
              step="0.1"
              value={prefs.ai_temperature}
              onChange={(e) =>
                savePref({ ai_temperature: parseFloat(e.target.value) })
              }
              className="w-full accent-accent"
            />
          </div>
        </section>

        {/* ═══ Appearance Section ═══ */}
        <section className="p-5 space-y-4 surface">
          <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-ink-muted">
            Appearance
          </h3>

          <div>
            <label className="text-[12px] text-ink-secondary font-medium mb-2 block">
              Theme
            </label>
            <SegmentedControl
              value={theme}
              options={[
                { value: "dark", label: "Dark", icon: <Moon size={13} /> },
                { value: "light", label: "Light", icon: <Sun size={13} /> },
                { value: "system", label: "System", icon: <Monitor size={13} /> },
              ]}
              onChange={handleThemeChange}
            />
          </div>
        </section>

        {/* ═══ Export Section ═══ */}
        <section className="p-5 space-y-4 surface">
          <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-ink-muted">
            Export
          </h3>

          <div>
            <label className="text-[12px] text-ink-secondary font-medium mb-2 block">
              Default Format
            </label>
            <SegmentedControl
              value={prefs.export_format}
              options={[
                { value: "json", label: "JSON" },
                { value: "csv", label: "CSV" },
                { value: "markdown", label: "Markdown" },
              ]}
              onChange={(v) => savePref({ export_format: v as Preferences["export_format"] })}
            />
          </div>
        </section>

        {/* Info footer */}
        <div className="p-3.5 rounded-lg bg-surface-input border border-subtle">
          <p className="text-[11px] text-ink-muted leading-[1.6]">
            Your tokens are stored locally on this machine and never leave it.
            The backend connects directly to Jira, Gemini, and Zephyr Scale APIs.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────── */

function PasswordInput({
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisibility,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisibility: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="g-input text-[12.5px] pr-9"
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function TestButton({
  state,
  result,
  onClick,
  label,
}: {
  state: TestState;
  result: TestConnectionResult | null;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={onClick}
        disabled={state === "loading"}
        className="g-btn text-[11px] px-3 py-1.5"
      >
        {state === "loading" ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          label
        )}
      </button>
      {state === "success" && result?.ok && (
        <span className="flex items-center gap-1 text-[11px] text-ok">
          <Check size={12} strokeWidth={2.5} />
          Connected
          {result.display_name && (
            <span className="ml-1 text-ink-muted">({result.display_name})</span>
          )}
        </span>
      )}
      {state === "error" && result && (
        <span className="flex items-center gap-1 text-[11px] text-err">
          <AlertCircle size={12} />
          {result.error || "Connection failed"}
        </span>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative w-9 h-5 rounded-full transition-colors",
        checked ? "bg-accent" : "border bg-surface-overlay border-subtle",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-surface-input border border-subtle p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
            value === opt.value
              ? "bg-accent-dim text-accent-text shadow-sm"
              : "text-ink-muted hover:text-ink-secondary",
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
