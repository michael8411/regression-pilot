import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "@/lib/icons";
import { Button } from "@/components/ui";
import { APP_VERSION, getBuildHash } from "@/lib/version";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

import { apiUrl } from "@/lib/http";

const HEALTH_URL = apiUrl("/health");

const REPO_URL = "https://github.com/michael8411/regression-pilot";

export function AboutPane() {
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(HEALTH_URL);
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (typeof body?.version === "string") setBackendVersion(body.version);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildHash = getBuildHash();

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="About"
        subtitle="Version, build, and acknowledgements."
      />
      <div className="flex-1 px-6 py-4 max-w-[560px] flex flex-col gap-4">
        <section className="rounded-lg border border-subtle bg-surface-elevated p-4">
          <h3 className="text-[13px] font-semibold text-ink mb-2">Testdeck</h3>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
            <dt className="text-ink-muted">App version</dt>
            <dd className="text-ink font-mono">{APP_VERSION}</dd>
            <dt className="text-ink-muted">Build</dt>
            <dd className="text-ink font-mono">{buildHash}</dd>
            <dt className="text-ink-muted">Backend</dt>
            <dd className="text-ink font-mono">{backendVersion ?? "—"}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-subtle bg-surface-elevated p-4">
          <h3 className="text-[13px] font-semibold text-ink mb-2">Resources</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openUrl(REPO_URL).catch(() => window.open(REPO_URL, "_blank", "noopener,noreferrer"))}
            trailing={<ExternalLink size={12} />}
          >
            Open repository
          </Button>
        </section>

        <details className="rounded-lg border border-subtle bg-surface-elevated p-4">
          <summary className="cursor-pointer text-[12.5px] text-ink-secondary">
            Acknowledgements
          </summary>
          <ul className="mt-2 text-[11.5px] text-ink-muted leading-relaxed list-disc pl-5">
            <li>React, Vite, TypeScript</li>
            <li>FastAPI, Pydantic, structlog</li>
            <li>Tailwind CSS, lucide-react</li>
            <li>@dnd-kit/core, react-markdown</li>
            <li>aiosqlite, cryptography (Fernet), keyring</li>
            <li>Google Gen AI SDK (Gemini)</li>
            <li>Model Context Protocol</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
