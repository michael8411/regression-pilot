import { useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "@/lib/icons";
import { Button } from "@/components/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { testGeminiConnection, updateCredentials } from "@/lib/api";
import { CredentialField } from "../parts/CredentialField";
import { TestConnectionButton } from "../parts/TestConnectionButton";
import { StepShell } from "../parts/StepShell";

interface Props {
  onContinue: () => void;
  onBack: () => void;
}

export function GeminiStep({ onContinue, onBack }: Props) {
  const [key, setKey] = useState("");
  const [tested, setTested] = useState(false);

  const persistAndTest = async () => {
    if (key) await updateCredentials({ gemini_api_key: key });
  };

  return (
    <StepShell
      title="Connect Gemini"
      description="Gemini powers test generation, ticket grouping, and the assistant. Your key stays on this machine."
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
          label="API key"
          masked
          value={key}
          onChange={setKey}
          autoFocus
          rightLink={{
            label: "Get API key",
            icon: ExternalLink,
            onClick: () =>
              openUrl("https://aistudio.google.com/apikey").catch(() => {}),
          }}
        />
        <TestConnectionButton
          label="Test Gemini"
          beforeTest={persistAndTest}
          run={async () => {
            const r = await testGeminiConnection();
            return {
              ok: r.ok,
              detail: r.ok
                ? r.model
                  ? `Connected (${r.model})`
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
