import { useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "@/lib/icons";
import { Button } from "@/components/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { testZephyrConnection, updateCredentials } from "@/lib/api";
import { CredentialField } from "../parts/CredentialField";
import { TestConnectionButton } from "../parts/TestConnectionButton";
import { StepShell } from "../parts/StepShell";

interface Props {
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function ZephyrStep({ onContinue, onSkip, onBack }: Props) {
  const [token, setToken] = useState("");
  const [tested, setTested] = useState(false);

  const persistAndTest = async () => {
    if (token) await updateCredentials({ zephyr_api_token: token });
  };

  return (
    <StepShell
      title="Connect Zephyr Scale"
      description="Optional. Connect Zephyr if you push generated test cases into folders for tracking."
      footer={
        <>
          <Button variant="ghost" leading={<ArrowLeft size={14} />} onClick={onBack}>
            Back
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip Zephyr
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
          label="API token"
          masked
          value={token}
          onChange={setToken}
          autoFocus
          rightLink={{
            label: "Get token",
            icon: ExternalLink,
            onClick: () =>
              openUrl(
                "https://support.smartbear.com/zephyr-scale-cloud/docs/rest-api/generating-api-access-tokens/",
              ).catch(() => {}),
          }}
        />
        <TestConnectionButton
          label="Test Zephyr"
          beforeTest={persistAndTest}
          run={async () => {
            const r = await testZephyrConnection();
            return {
              ok: r.ok,
              detail: r.ok ? "Connected" : r.error ?? "Failed",
            };
          }}
          onSuccess={() => setTested(true)}
        />
      </div>
    </StepShell>
  );
}
