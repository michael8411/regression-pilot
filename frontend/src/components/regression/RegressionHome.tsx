import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Edit3,
  Layers,
  Layers3,
  Play,
  Sparkles,
} from "@/lib/icons";
import type { IconComponent } from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";
import { Card, CardBody, CardHeader, Button, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useRegressionSession, type RegressionState } from "./hooks/useRegressionSession";
import type { Route } from "@/types/routing";

type Phase = "fresh" | "tickets" | "generated" | "pushed";

export function RegressionHome() {
  const { goto } = useRoute();
  const { state, isRestoring } = useRegressionSession();

  if (isRestoring) return <RegressionHomeSkeleton />;

  const phase = derivePhase(state);
  const cta = primaryCta(phase, goto);
  const themeCount = state.editableGroups
    ? Object.keys(state.editableGroups).length
    : 0;

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-8 animate-fade-in">
      <Header cta={cta} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <ResumeCard state={state} phase={phase} onClick={cta.onClick} />
        <PickTicketsCard
          onClick={() => goto(["regression", "workbench"])}
        />
        <ThemesCard
          enabled={state.selectedTickets.length > 0}
          themeCount={themeCount}
          onClick={() => goto(["regression", "themes"])}
        />
        <GenerateCard
          enabled={state.selectedTickets.length > 0}
          onClick={() => goto(["regression", "generate"])}
        />
        <ReviewCard
          enabled={state.testCases.length > 0}
          count={state.testCases.length}
          onClick={() => goto(["regression", "review"])}
        />
        <CyclesPlaceholderCard />
      </div>
    </div>
  );
}

function derivePhase(s: RegressionState): Phase {
  if (s.pushResult) return "pushed";
  if (s.testCases.length > 0) return "generated";
  if (s.selectedTickets.length > 0) return "tickets";
  return "fresh";
}

function primaryCta(
  phase: Phase,
  goto: (route: Route) => void,
): { label: string; onClick: () => void } {
  switch (phase) {
    case "fresh":
      return {
        label: "Pick tickets",
        onClick: () => goto(["regression", "workbench"]),
      };
    case "tickets":
      return {
        label: "Generate test cases",
        onClick: () => goto(["regression", "generate"]),
      };
    case "generated":
      return {
        label: "Review test cases",
        onClick: () => goto(["regression", "review"]),
      };
    case "pushed":
      return {
        label: "Start a new session",
        onClick: () => goto(["regression", "workbench"]),
      };
  }
}

function Header({
  cta,
}: {
  cta: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <h1 className="t-hero text-ink">Regression Workspace</h1>
        <p className="t-meta text-ink-muted mt-1">
          Plan, generate, and ship regression tests for a Jira fix version.
        </p>
      </div>
      <Button
        variant="primary"
        size="md"
        onClick={cta.onClick}
        trailing={<ArrowRight size={14} />}
      >
        {cta.label}
      </Button>
    </div>
  );
}

interface CardHeadProps {
  icon: IconComponent;
  title: string;
  subtitle?: string;
  ai?: boolean;
}

/**
 * Local helper that builds an icon + title + subtitle layout on top of
 * the Phase 1b CardHeader primitive (which only takes children). Kept
 * private to this screen — promote to the primitive only if 4b+ also
 * want this exact shape.
 */
function CardHead({ icon: Icon, title, subtitle, ai }: CardHeadProps) {
  return (
    <CardHeader className="border-b-0 pb-2">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
            ai
              ? "bg-ai/10 text-ai border border-ai/30"
              : "bg-surface-overlay text-ink-secondary border border-subtle",
          )}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="t-title text-ink truncate">{title}</h3>
          {subtitle && (
            <p className="t-meta text-ink-muted truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </CardHeader>
  );
}

function ResumeCard({
  state,
  phase,
  onClick,
}: {
  state: RegressionState;
  phase: Phase;
  onClick: () => void;
}) {
  if (phase === "fresh") {
    return (
      <Card>
        <CardHead
          icon={Sparkles}
          title="Start fresh"
          subtitle="Begin a new regression session"
        />
        <CardBody>
          <p className="t-body text-ink-secondary">
            Pick a Jira fix version, choose tickets, and generate test cases
            with the AI.
          </p>
        </CardBody>
      </Card>
    );
  }

  const projectKey = state.selectedProject?.key ?? "—";
  const version = state.selectedVersion?.name ?? "—";
  const tickets = state.selectedTickets.length;
  const cases = state.testCases.length;

  const subtitle =
    phase === "pushed"
      ? "Pushed to Zephyr"
      : phase === "generated"
      ? "Ready to review"
      : "Tickets ready";

  return (
    <Card interactive onClick={onClick}>
      <CardHead
        icon={Sparkles}
        title={`Resume: ${projectKey} ${version}`}
        subtitle={subtitle}
      />
      <CardBody>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="accent">{tickets} tickets</Badge>
          {cases > 0 && <Badge tone="ok">{cases} test cases</Badge>}
          {phase === "pushed" && (
            <Badge tone="ok" leading={<Check size={10} />}>
              Pushed
            </Badge>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function PickTicketsCard({ onClick }: { onClick: () => void }) {
  return (
    <Card interactive onClick={onClick}>
      <CardHead
        icon={ClipboardList}
        title="Tickets"
        subtitle="Browse Jira"
      />
      <CardBody>
        <p className="t-body text-ink-secondary">
          Pick a fix version, filter the issue list, and pull the tickets you
          want to cover.
        </p>
      </CardBody>
    </Card>
  );
}

function ThemesCard({
  enabled,
  themeCount,
  onClick,
}: {
  enabled: boolean;
  themeCount: number;
  onClick: () => void;
}) {
  return (
    <DiscoveryCard
      enabled={enabled}
      onClick={onClick}
      icon={Layers}
      title="Themes"
      subtitle={
        enabled
          ? themeCount > 0
            ? `${themeCount} themes`
            : "Group tickets"
          : "Pick tickets first"
      }
      body="Cluster tickets into focused regression themes the AI generates around."
    />
  );
}

function GenerateCard({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <DiscoveryCard
      enabled={enabled}
      onClick={onClick}
      icon={Play}
      title="Generate"
      subtitle={enabled ? "AI test cases" : "Pick tickets first"}
      body="Stream a fresh batch of test cases from your selected tickets and themes."
      ai
    />
  );
}

function ReviewCard({
  enabled,
  count,
  onClick,
}: {
  enabled: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <DiscoveryCard
      enabled={enabled}
      onClick={onClick}
      icon={Edit3}
      title="Review"
      subtitle={
        enabled
          ? count > 0
            ? `${count} test cases`
            : "Edit and push"
          : "Generate test cases first"
      }
      body="Refine generated test cases and push them to Zephyr when they're ready."
    />
  );
}

interface DiscoveryCardProps {
  enabled: boolean;
  onClick: () => void;
  icon: IconComponent;
  title: string;
  subtitle?: string;
  body: ReactNode;
  ai?: boolean;
}

function DiscoveryCard({
  enabled,
  onClick,
  icon,
  title,
  subtitle,
  body,
  ai,
}: DiscoveryCardProps) {
  return (
    <Card
      interactive={enabled}
      onClick={enabled ? onClick : undefined}
      aria-disabled={!enabled || undefined}
      className={cn(!enabled && "opacity-50 cursor-not-allowed")}
    >
      <CardHead icon={icon} title={title} subtitle={subtitle} ai={ai} />
      <CardBody>
        <p className="t-body text-ink-secondary">{body}</p>
      </CardBody>
    </Card>
  );
}

function CyclesPlaceholderCard() {
  return (
    <Card className="opacity-60" aria-disabled="true">
      <CardHead
        icon={Layers3}
        title="Test Cycles"
        subtitle="Coming in Phase 10"
      />
      <CardBody>
        <p className="t-body text-ink-secondary">
          Save and reuse regression cycles. Available once the cycles backend
          lands.
        </p>
      </CardBody>
    </Card>
  );
}

function RegressionHomeSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto px-8 py-8 animate-fade-in">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded bg-surface-overlay animate-pulse" />
          <div className="h-4 w-96 rounded bg-surface-overlay animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded bg-surface-overlay animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-surface-overlay animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
