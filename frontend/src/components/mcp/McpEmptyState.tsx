import { Plug, Plus } from "@/lib/icons";
import { Button } from "@/components/ui";

interface Props {
  onCreate: () => void;
}

export function McpEmptyState({ onCreate }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-subtle p-10 text-center">
      <Plug size={28} className="text-ink-muted" />
      <div className="text-[13px] font-semibold text-ink">
        No MCP connections yet
      </div>
      <p className="max-w-sm text-[11.5px] text-ink-muted leading-relaxed">
        Add a Model Context Protocol server to give the assistant access to
        external tools like Jira, GitHub, or your local filesystem.
      </p>
      <Button
        onClick={onCreate}
        size="sm"
        variant="primary"
        leading={<Plus size={12} />}
      >
        Add connection
      </Button>
    </div>
  );
}
