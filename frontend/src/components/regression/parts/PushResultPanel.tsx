import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "@/lib/icons";
import { Badge, Button } from "@/components/ui";
import type { PushResult } from "@/types";

export interface PushResultPanelProps {
  result: PushResult;
  projectKey: string;
  onNewSession: () => void;
}

/**
 * Success / partial-failure panel rendered after a push completes.
 *
 * The PushResult shape comes straight from the backend
 * (`POST /zephyr/push`): created count, optional partial_failure flag,
 * optional failed_count, and an optional list of { name, error } pairs.
 */
export function PushResultPanel({
  result,
  projectKey,
  onNewSession,
}: PushResultPanelProps) {
  const partial = !!result.partial_failure;
  const failedCount = result.failed_count ?? result.failed?.length ?? 0;
  const totalAttempted = result.created + failedCount;

  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="text-center">
        {partial ? (
          <AlertTriangle size={36} className="text-warn mx-auto" aria-hidden />
        ) : (
          <CheckCircle2 size={36} className="text-ok mx-auto" aria-hidden />
        )}
        <h2 className="t-h2 text-ink mt-3">
          {partial
            ? `Pushed ${result.created} of ${totalAttempted}`
            : `Pushed ${result.created} test case${result.created === 1 ? "" : "s"}`}
        </h2>
        <p className="t-meta text-ink-muted mt-1">
          {partial
            ? `${failedCount} failed — see below.`
            : "All set. Open Zephyr to inspect them."}
        </p>
      </div>

      {partial && result.failed && result.failed.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/10 p-3 max-h-[180px] overflow-y-auto">
          <h3 className="t-label text-warn mb-2">Failed cases</h3>
          <ul className="space-y-1.5 text-[12px]">
            {result.failed.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-start gap-2"
              >
                <Badge tone="warn" size="sm">
                  {f.name || "(unnamed)"}
                </Badge>
                <span className="text-ink-muted flex-1 min-w-0 break-words">
                  {f.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <ZephyrLinkButton projectKey={projectKey} />
        <Button variant="primary" size="md" onClick={onNewSession}>
          Start a new session
        </Button>
      </div>
    </div>
  );
}

function ZephyrLinkButton({ projectKey: _projectKey }: { projectKey: string }) {
  // Generic deep-link only — proper per-project URLs depend on Zephyr Cloud
  // vs Server and on the Jira base URL configured by the user. Phase 11
  // will pull this from config status; for 4f we just open the Cloud root.
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={() => {
        window.open("https://zephyrscale.smartbear.com/", "_blank", "noreferrer");
      }}
      trailing={<ExternalLink size={14} />}
    >
      Open Zephyr
    </Button>
  );
}
