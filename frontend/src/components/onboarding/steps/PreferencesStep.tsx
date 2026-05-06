import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "@/lib/icons";
import { Button, Segmented } from "@/components/ui";
import { useTheme } from "@/contexts/ThemeContext";
import { getPreferences, savePreferences } from "@/lib/api";
import type { Preferences } from "@/types";
import { StepShell } from "../parts/StepShell";

interface Props {
  onFinish: () => void;
  onBack: () => void;
}

type Theme = "dark" | "light" | "system";
type VersionStatus = Preferences["default_version_status"];

export function PreferencesStep({ onFinish, onBack }: Props) {
  const { theme, setTheme } = useTheme();
  const [versionStatus, setVersionStatus] = useState<VersionStatus>("unreleased");

  useEffect(() => {
    getPreferences()
      .then((p) => setVersionStatus(p.default_version_status))
      .catch(() => {});
  }, []);

  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    void savePreferences({ theme: t });
  };

  const handleVersionStatusChange = (v: VersionStatus) => {
    setVersionStatus(v);
    void savePreferences({ default_version_status: v });
  };

  return (
    <StepShell
      title="Quick preferences"
      description="Two small choices. You can change them later in Settings."
      footer={
        <>
          <Button variant="ghost" leading={<ArrowLeft size={14} />} onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            leading={<Check size={14} />}
            onClick={onFinish}
          >
            Finish setup
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label className="t-label block mb-2">Theme</label>
          <Segmented<Theme>
            value={theme}
            onChange={handleThemeChange}
            aria-label="Theme"
            options={[
              { value: "dark",   label: "Dark"   },
              { value: "light",  label: "Light"  },
              { value: "system", label: "System" },
            ]}
          />
        </div>
        <div>
          <label className="t-label block mb-2">
            Default version status when picking tickets
          </label>
          <Segmented<VersionStatus>
            value={versionStatus}
            onChange={handleVersionStatusChange}
            aria-label="Default version status"
            options={[
              { value: "unreleased", label: "Unreleased" },
              { value: "released",   label: "Released"   },
              { value: "all",        label: "All"        },
            ]}
          />
        </div>
      </div>
    </StepShell>
  );
}
