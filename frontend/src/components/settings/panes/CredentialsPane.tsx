import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  type IconComponent,
} from "@/lib/icons";
import { Button, Spinner } from "@/components/ui";
import {
  getConfigStatus,
  testGeminiConnection,
  testJiraConnection,
  testZephyrConnection,
  updateCredentials,
} from "@/lib/api";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

type Section = "jira" | "gemini" | "zephyr";
type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; detail?: string }
  | { kind: "err"; detail: string };

interface FormState {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraToken: string;
  geminiKey: string;
  zephyrBaseUrl: string;
  zephyrToken: string;
}

const empty: FormState = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraToken: "",
  geminiKey: "",
  zephyrBaseUrl: "",
  zephyrToken: "",
};

export function CredentialsPane() {
  const [form, setForm] = useState<FormState>(empty);
  const [hasJiraToken, setHasJiraToken] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasZephyrToken, setHasZephyrToken] = useState(false);
  const [busy, setBusy] = useState<Section | null>(null);
  const [testState, setTestState] = useState<Record<Section, TestState>>({
    jira: { kind: "idle" },
    gemini: { kind: "idle" },
    zephyr: { kind: "idle" },
  });
  const [savedSection, setSavedSection] = useState<Section | null>(null);

  // Hydrate non-secret fields from /config/status. The status endpoint
  // surfaces base_url/email and a `configured` boolean per service —
  // tokens themselves are never read back from the backend.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getConfigStatus();
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          jiraBaseUrl: status.jira.base_url ?? "",
          jiraEmail: status.jira.email ?? "",
        }));
        setHasJiraToken(status.jira.configured);
        setHasGeminiKey(status.ai.configured);
        setHasZephyrToken(status.zephyr.configured);
      } catch {
        /* ignore — pane still renders empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async (section: Section) => {
    setBusy(section);
    try {
      const payload: Record<string, string> = {};
      if (section === "jira") {
        if (form.jiraBaseUrl) payload.jira_base_url = form.jiraBaseUrl.trim();
        if (form.jiraEmail) payload.jira_email = form.jiraEmail.trim();
        if (form.jiraToken) payload.jira_api_token = form.jiraToken;
      } else if (section === "gemini") {
        if (form.geminiKey) payload.gemini_api_key = form.geminiKey;
      } else if (section === "zephyr") {
        if (form.zephyrBaseUrl)
          payload.zephyr_base_url = form.zephyrBaseUrl.trim();
        if (form.zephyrToken) payload.zephyr_api_token = form.zephyrToken;
      }
      if (Object.keys(payload).length === 0) {
        setBusy(null);
        return;
      }
      await updateCredentials(payload);
      // Refresh status so the configured indicator updates.
      const status = await getConfigStatus();
      setHasJiraToken(status.jira.configured);
      setHasGeminiKey(status.ai.configured);
      setHasZephyrToken(status.zephyr.configured);
      // Clear the typed token field — the actual secret now lives in keyring.
      if (section === "jira") setField("jiraToken", "");
      if (section === "gemini") setField("geminiKey", "");
      if (section === "zephyr") setField("zephyrToken", "");
      setSavedSection(section);
      setTimeout(() => setSavedSection(null), 1800);
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async (section: Section) => {
    setTestState((s) => ({ ...s, [section]: { kind: "running" } }));
    try {
      // Persist any typed token first so the backend tests the right value.
      await handleSaveBeforeTest(section);
      const fn =
        section === "jira"
          ? testJiraConnection
          : section === "gemini"
            ? testGeminiConnection
            : testZephyrConnection;
      const res = await fn();
      if (res.ok) {
        const detail =
          section === "jira"
            ? res.display_name
              ? `Connected as ${res.display_name}`
              : "Connected"
            : section === "gemini"
              ? res.model
                ? `Connected (${res.model})`
                : "Connected"
              : "Connected";
        setTestState((s) => ({ ...s, [section]: { kind: "ok", detail } }));
      } else {
        setTestState((s) => ({
          ...s,
          [section]: { kind: "err", detail: res.error ?? "Failed" },
        }));
      }
    } catch (e: any) {
      setTestState((s) => ({
        ...s,
        [section]: { kind: "err", detail: e?.message ?? "Failed" },
      }));
    }
  };

  const handleSaveBeforeTest = async (section: Section) => {
    const payload: Record<string, string> = {};
    if (section === "jira") {
      if (form.jiraBaseUrl) payload.jira_base_url = form.jiraBaseUrl.trim();
      if (form.jiraEmail) payload.jira_email = form.jiraEmail.trim();
      if (form.jiraToken) payload.jira_api_token = form.jiraToken;
    } else if (section === "gemini") {
      if (form.geminiKey) payload.gemini_api_key = form.geminiKey;
    } else if (section === "zephyr") {
      if (form.zephyrBaseUrl) payload.zephyr_base_url = form.zephyrBaseUrl.trim();
      if (form.zephyrToken) payload.zephyr_api_token = form.zephyrToken;
    }
    if (Object.keys(payload).length > 0) {
      try {
        await updateCredentials(payload);
      } catch {
        /* the test below will surface a useful error */
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Credentials"
        subtitle="Tokens are stored in the OS keyring on this machine and never leave it."
      />
      <div className="flex-1 px-6 py-4 flex flex-col gap-4">
        <CredentialCard
          title="Jira"
          configured={hasJiraToken}
          tokenSet={hasJiraToken}
          getTokenLink="https://id.atlassian.com/manage-profile/security/api-tokens"
          getTokenLabel="Get API token"
          busy={busy === "jira"}
          saved={savedSection === "jira"}
          test={testState.jira}
          onTest={() => handleTest("jira")}
          onSave={() => handleSave("jira")}
          fields={[
            <Field
              key="url"
              label="Site URL"
              value={form.jiraBaseUrl}
              placeholder="https://yoursite.atlassian.net"
              onChange={(v) => setField("jiraBaseUrl", v)}
            />,
            <Field
              key="email"
              label="Email"
              value={form.jiraEmail}
              placeholder="you@company.com"
              onChange={(v) => setField("jiraEmail", v)}
            />,
            <SecretField
              key="token"
              label="API token"
              value={form.jiraToken}
              placeholder={hasJiraToken ? "•••••••••• (saved)" : "Paste token"}
              onChange={(v) => setField("jiraToken", v)}
            />,
          ]}
        />

        <CredentialCard
          title="Gemini"
          configured={hasGeminiKey}
          tokenSet={hasGeminiKey}
          getTokenLink="https://aistudio.google.com/apikey"
          getTokenLabel="Get API key"
          busy={busy === "gemini"}
          saved={savedSection === "gemini"}
          test={testState.gemini}
          onTest={() => handleTest("gemini")}
          onSave={() => handleSave("gemini")}
          fields={[
            <SecretField
              key="key"
              label="API key"
              value={form.geminiKey}
              placeholder={hasGeminiKey ? "•••••••••• (saved)" : "Paste key"}
              onChange={(v) => setField("geminiKey", v)}
            />,
          ]}
        />

        <CredentialCard
          title="Zephyr Scale"
          configured={hasZephyrToken}
          tokenSet={hasZephyrToken}
          getTokenLink="https://support.smartbear.com/zephyr-scale-cloud/docs/rest-api/generating-api-access-tokens/"
          getTokenLabel="Get token"
          busy={busy === "zephyr"}
          saved={savedSection === "zephyr"}
          test={testState.zephyr}
          onTest={() => handleTest("zephyr")}
          onSave={() => handleSave("zephyr")}
          fields={[
            <Field
              key="url"
              label="Base URL"
              value={form.zephyrBaseUrl}
              placeholder="https://api.zephyrscale.smartbear.com/v2"
              onChange={(v) => setField("zephyrBaseUrl", v)}
            />,
            <SecretField
              key="token"
              label="API token"
              value={form.zephyrToken}
              placeholder={hasZephyrToken ? "•••••••••• (saved)" : "Paste token"}
              onChange={(v) => setField("zephyrToken", v)}
            />,
          ]}
        />
      </div>
    </div>
  );
}

interface CredentialCardProps {
  title: string;
  configured: boolean;
  tokenSet: boolean;
  getTokenLink: string;
  getTokenLabel: string;
  busy: boolean;
  saved: boolean;
  test: TestState;
  onSave: () => void;
  onTest: () => void;
  fields: React.ReactNode[];
}

function CredentialCard({
  title,
  configured,
  getTokenLink,
  getTokenLabel,
  busy,
  saved,
  test,
  onSave,
  onTest,
  fields,
}: CredentialCardProps) {
  return (
    <section className="rounded-lg border border-subtle bg-surface-elevated p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          <span
            className={
              configured
                ? "text-[10.5px] text-ok flex items-center gap-1"
                : "text-[10.5px] text-ink-faint"
            }
          >
            {configured ? (
              <>
                <Check size={11} /> configured
              </>
            ) : (
              "not configured"
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => openUrl(getTokenLink).catch(() => {})}
          className="flex items-center gap-1 text-[10.5px] text-accent-text/80 hover:text-accent-text"
        >
          {getTokenLabel}
          <ExternalLink size={10} />
        </button>
      </header>
      <div className="flex flex-col gap-2.5">{fields}</div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={busy}
          leading={busy ? <Spinner size={11} /> : undefined}
        >
          Save
        </Button>
        <Button variant="secondary" size="sm" onClick={onTest}>
          Test connection
        </Button>
        {saved && (
          <span className="text-[11px] text-ok flex items-center gap-1">
            <Check size={11} /> Saved
          </span>
        )}
        <TestStatusInline state={test} />
      </div>
    </section>
  );
}

function TestStatusInline({ state }: { state: TestState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "running") {
    return (
      <span className="text-[11px] text-ink-muted flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Testing…
      </span>
    );
  }
  if (state.kind === "ok") {
    return (
      <span className="text-[11px] text-ok flex items-center gap-1">
        <Check size={11} /> {state.detail ?? "Connected"}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-err flex items-center gap-1">
      <AlertTriangle size={11} /> {state.detail}
    </span>
  );
}

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}

function Field({ label, value, placeholder, onChange }: FieldProps) {
  return (
    <div>
      <label className="text-[11px] text-ink-muted mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="g-input text-[12.5px]"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

function SecretField({ label, value, placeholder, onChange }: FieldProps) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <label className="text-[11px] text-ink-muted mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="g-input text-[12.5px] pr-9"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? "Hide value" : "Show value"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
        >
          <EyeIcon reveal={reveal} />
        </button>
      </div>
    </div>
  );
}

function EyeIcon({ reveal }: { reveal: boolean }) {
  const Comp: IconComponent = reveal ? EyeOff : Eye;
  return <Comp size={13} />;
}
