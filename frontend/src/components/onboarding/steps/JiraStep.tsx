import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "@/lib/icons";
import { Button } from "@/components/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getConfigStatus,
  testJiraConnection,
  updateCredentials,
} from "@/lib/api";
import { CredentialField } from "../parts/CredentialField";
import { TestConnectionButton } from "../parts/TestConnectionButton";
import { StepShell } from "../parts/StepShell";

interface Props {
  onContinue: () => void;
  onBack: () => void;
}

export function JiraStep({ onContinue, onBack }: Props) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [tested, setTested] = useState(false);

  useEffect(() => {
    getConfigStatus()
      .then((s) => {
        if (s.jira.base_url) setUrl(s.jira.base_url);
        if (s.jira.email) setEmail(s.jira.email);
      })
      .catch(() => {});
  }, []);

  const persistAndTest = async () => {
    const payload: Record<string, string> = {};
    if (url) payload.jira_base_url = url.trim();
    if (email) payload.jira_email = email.trim();
    if (token) payload.jira_api_token = token;
    if (Object.keys(payload).length) await updateCredentials(payload);
  };

  return (
    <StepShell
      title="Connect Jira"
      description="Testdeck reads your tickets, fix versions, and projects from Jira. We never write to Jira without explicit action."
      footer={
        <>
          <Button variant="ghost" leading={<ArrowLeft size={14} />} onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            trailing={<ArrowRight size={14} />}
            disabled={!tested}
            onClick={onContinue}
          >
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <CredentialField
          label="Site URL"
          placeholder="https://yoursite.atlassian.net"
          value={url}
          onChange={setUrl}
          autoFocus
        />
        <CredentialField
          label="Email"
          placeholder="you@company.com"
          value={email}
          onChange={setEmail}
        />
        <CredentialField
          label="API token"
          masked
          value={token}
          onChange={setToken}
          rightLink={{
            label: "Get API token",
            icon: ExternalLink,
            onClick: () =>
              openUrl(
                "https://id.atlassian.com/manage-profile/security/api-tokens",
              ).catch(() => {}),
          }}
        />
        <TestConnectionButton
          label="Test Jira"
          beforeTest={persistAndTest}
          run={async () => {
            const r = await testJiraConnection();
            return {
              ok: r.ok,
              detail: r.ok
                ? r.display_name
                  ? `Connected as ${r.display_name}`
                  : "Connected"
                : r.error ?? "Failed",
            };
          }}
          onSuccess={() => setTested(true)}
        />
      </div>
    </StepShell>
  );
}
