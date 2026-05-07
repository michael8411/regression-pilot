import { Badge, Button } from "@/components/ui";
import { McpModal } from "./McpModal";
import type { McpTestResult } from "@/types/mcp";

interface Props {
  name: string;
  result: McpTestResult;
  onClose: () => void;
}

export function McpTestResultModal({ name, result, onClose }: Props) {
  return (
    <McpModal
      title={`Test: ${name}`}
      ariaLabel={`Test result for ${name}`}
      width={460}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-[12px]">
        <div className="flex items-center gap-2">
          <Badge tone={result.ok ? "ok" : "err"} size="sm">
            {result.ok ? "ok" : "failed"}
          </Badge>
          <span className="font-mono text-ink-muted">
            {result.duration_ms} ms
          </span>
        </div>
        {result.ok ? (
          <p className="text-ink-secondary">
            Found <strong className="text-ink">{result.toolCount}</strong>{" "}
            {result.toolCount === 1 ? "tool" : "tools"}.
          </p>
        ) : (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-err/30 bg-err/10 px-2 py-1.5 text-[11px] text-err">
            {result.error || "Unknown error"}
          </pre>
        )}
      </div>
    </McpModal>
  );
}
