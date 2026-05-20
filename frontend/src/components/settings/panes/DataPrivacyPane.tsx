import { useEffect, useState } from "react";
import { AlertTriangle, Check, Database, Download, Loader2, Trash2 } from "@/lib/icons";
import { Button, Spinner, Toggle } from "@/components/ui";
import { useRoute } from "@/contexts/RouteContext";
import {
  exportData,
  fetchRetentionCounts,
  wipeData,
} from "../lib/api";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

interface RetentionCounts {
  conversations: number;
  liveBoards: number;
  cycles: number;
  mcpConnections: number;
  sessions: number;
}

export function DataPrivacyPane() {
  const { closeOverlay } = useRoute();
  const [counts, setCounts] = useState<RetentionCounts | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [keepCreds, setKeepCreds] = useState(true);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeOk, setWipeOk] = useState(false);

  async function refreshCounts() {
    try {
      setCounts(await fetchRetentionCounts());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshCounts();
  }, []);

  async function handleExport() {
    setExportBusy(true);
    setExportError(null);
    try {
      const payload = await exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `testdeck-export-${ts}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setExportError(e?.message ?? "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleWipe() {
    if (wipeText.trim().toUpperCase() !== "WIPE") {
      setWipeError("Type WIPE to confirm.");
      return;
    }
    setWipeBusy(true);
    setWipeError(null);
    try {
      await wipeData({ confirmation: "WIPE", keepCredentials: keepCreds });
      setWipeOk(true);
      setTimeout(() => {
        setWipeOpen(false);
        setWipeText("");
        setWipeOk(false);
        closeOverlay();
      }, 800);
    } catch (e: any) {
      setWipeError(e?.message ?? "Wipe failed");
    } finally {
      setWipeBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Data & privacy"
        subtitle="Everything stays on this machine. Tokens are never included in exports."
      />
      <div className="flex-1 px-6 py-4 flex flex-col gap-4 max-w-[640px]">
        <Card>
          <Header
            icon={<Download size={14} className="text-accent-text" />}
            title="Export"
            subtitle="Download a JSON snapshot of your local data. API tokens are excluded."
          />
          <div className="flex items-center gap-2 px-4 py-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exportBusy}
              leading={exportBusy ? <Spinner size={11} /> : <Download size={12} />}
            >
              Export…
            </Button>
            {exportError && (
              <span
                role="alert"
                className="text-[11px] text-err flex items-center gap-1"
              >
                <AlertTriangle size={11} /> {exportError}
              </span>
            )}
          </div>
        </Card>

        <Card>
          <Header
            icon={<Trash2 size={14} className="text-err" />}
            title="Wipe local data"
            subtitle="Delete every conversation, board, cycle, and session on this machine. This cannot be undone."
            tone="danger"
          />
          <div className="px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Toggle
                checked={keepCreds}
                onChange={setKeepCreds}
                aria-label="Keep credentials"
              />
              <span className="text-[12px] text-ink">Keep credentials</span>
            </div>

            {!wipeOpen ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setWipeOpen(true);
                  setWipeText("");
                  setWipeError(null);
                }}
                leading={<Trash2 size={12} />}
              >
                Wipe local data…
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11.5px] text-ink-muted">
                  Type the word <strong className="text-ink">WIPE</strong> to
                  confirm.
                </p>
                <input
                  autoFocus
                  value={wipeText}
                  onChange={(e) => setWipeText(e.target.value)}
                  placeholder="WIPE"
                  className="g-input text-[12.5px] font-mono w-40"
                />
                {wipeError && (
                  <p
                    role="alert"
                    className="text-[11px] text-err flex items-center gap-1"
                  >
                    <AlertTriangle size={11} /> {wipeError}
                  </p>
                )}
                {wipeOk && (
                  <p className="text-[11px] text-ok flex items-center gap-1">
                    <Check size={11} /> Local data cleared.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setWipeOpen(false);
                      setWipeText("");
                      setWipeError(null);
                    }}
                    disabled={wipeBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleWipe()}
                    disabled={wipeBusy}
                    leading={
                      wipeBusy ? <Loader2 size={11} className="animate-spin" /> : undefined
                    }
                  >
                    Wipe
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <Header
            icon={<Database size={14} className="text-ink-muted" />}
            title="Retention"
            subtitle="What's currently stored on this machine."
          />
          <div className="px-4 py-3 grid grid-cols-2 gap-y-1 text-[12px]">
            <Row label="Sessions" value={counts?.sessions} />
            <Row label="Conversations" value={counts?.conversations} />
            <Row label="Live boards" value={counts?.liveBoards} />
            <Row label="Test cycles" value={counts?.cycles} />
            <Row label="MCP connections" value={counts?.mcpConnections} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-subtle bg-surface-elevated">
      {children}
    </section>
  );
}

function Header({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: "danger";
}) {
  return (
    <header className="flex items-start gap-2 px-4 py-3 border-b border-subtle">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <h3
          className={
            tone === "danger"
              ? "text-[12.5px] font-semibold text-err"
              : "text-[12.5px] font-semibold text-ink"
          }
        >
          {title}
        </h3>
        <p className="text-[10.5px] text-ink-muted">{subtitle}</p>
      </div>
    </header>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <>
      <div className="text-ink-muted">{label}</div>
      <div className="text-right text-ink font-mono tabular-nums">
        {value ?? "—"}
      </div>
    </>
  );
}
