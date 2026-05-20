import { ArrowRight, Check } from "@/lib/icons";
import { Button } from "@/components/ui";
import { StepShell } from "../parts/StepShell";

interface Props {
  onContinue: () => void;
  onSkipAll: () => void;
}

const NEEDS = [
  { label: "A Jira API token",         note: "Atlassian → Profile → Security → API tokens" },
  { label: "A Gemini API key",         note: "Google AI Studio" },
  { label: "A Zephyr Scale API token", note: "Optional — skip if you don't push to Zephyr" },
];

export function WelcomeStep({ onContinue, onSkipAll }: Props) {
  return (
    <StepShell
      title="Welcome to Testdeck"
      description="A two-minute setup connects Jira, the AI, and Zephyr Scale. You can skip optional steps and finish anything later from Settings."
      footer={
        <>
          <Button variant="ghost" onClick={onSkipAll}>
            Skip for now
          </Button>
          <Button
            variant="primary"
            trailing={<ArrowRight size={14} />}
            onClick={onContinue}
          >
            Get started
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <h4 className="t-label text-ink-muted">You'll want to have on hand:</h4>
        <ul className="space-y-2">
          {NEEDS.map((n) => (
            <li
              key={n.label}
              className="flex items-start gap-3 p-3 rounded border border-subtle bg-surface"
            >
              <Check size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-ink">{n.label}</div>
                <div className="t-meta text-ink-muted">{n.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </StepShell>
  );
}
