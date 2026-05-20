import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import { IconButton } from "@/components/ui";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { useWizard } from "./hooks/useWizard";
import { ProgressRail } from "./parts/ProgressRail";
import { WelcomeStep } from "./steps/WelcomeStep";
import { JiraStep } from "./steps/JiraStep";
import { GeminiStep } from "./steps/GeminiStep";
import { ZephyrStep } from "./steps/ZephyrStep";
import { PreferencesStep } from "./steps/PreferencesStep";

interface Props {
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}

export function SetupWizard({ open, onClose, onFinish }: Props) {
  const w = useWizard();
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  if (!isFeatureEnabled("onboardingV2")) return null;

  const handleClose = () => {
    const hasProgress =
      w.state.visited.length > 1 ||
      w.state.steps.jira.complete ||
      w.state.steps.gemini.complete;
    if (hasProgress && !confirmingClose) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  const renderStep = () => {
    switch (w.state.current) {
      case "welcome":
        return <WelcomeStep onContinue={w.next} onSkipAll={onClose} />;
      case "jira":
        return (
          <JiraStep
            onContinue={() => {
              w.markComplete("jira");
              w.next();
            }}
            onBack={w.back}
          />
        );
      case "gemini":
        return (
          <GeminiStep
            onContinue={() => {
              w.markComplete("gemini");
              w.next();
            }}
            onBack={w.back}
          />
        );
      case "zephyr":
        return (
          <ZephyrStep
            onContinue={() => {
              w.markComplete("zephyr");
              w.next();
            }}
            onSkip={() => {
              w.markSkipped("zephyr");
              w.next();
            }}
            onBack={w.back}
          />
        );
      case "preferences":
        return (
          <PreferencesStep
            onFinish={() => {
              w.markComplete("preferences");
              onFinish();
            }}
            onBack={w.back}
          />
        );
      case "done":
        return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[7000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Setup wizard"
    >
      <div className="w-full max-w-[920px] h-[600px] bg-surface-elevated rounded-2xl border border-subtle shadow-float overflow-hidden flex animate-slide-up">
        <ProgressRail current={w.state.current} steps={w.state.steps} />
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b border-subtle">
            <h2 className="t-title text-ink">Set up Testdeck</h2>
            <IconButton
              size="sm"
              aria-label="Close wizard"
              icon={<X size={14} />}
              onClick={handleClose}
            />
          </header>
          <main className="flex-1 overflow-y-auto px-8 py-6">
            {confirmingClose ? (
              <ConfirmClose
                onCancel={() => setConfirmingClose(false)}
                onConfirm={onClose}
              />
            ) : (
              renderStep()
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmClose({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center py-12">
      <h3 className="t-title text-ink">Stop setup?</h3>
      <p className="t-meta text-ink-muted mt-2">
        Your progress is saved. You can re-run setup any time from the command palette.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={onCancel} className="g-btn px-4 py-2 text-sm">
          Keep going
        </button>
        <button onClick={onConfirm} className="g-btn-solid px-4 py-2 text-sm">
          Stop for now
        </button>
      </div>
    </div>
  );
}
