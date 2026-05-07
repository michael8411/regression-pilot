import type { McpTool } from "@/types/mcp";

interface Props {
  tool: McpTool;
}

export function McpToolRow({ tool }: Props) {
  return (
    <li className="rounded-lg border border-subtle bg-surface-elevated p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-semibold text-ink">
            {tool.name}
          </div>
          {tool.description && (
            <p className="mt-1 text-[11px] text-ink-muted leading-relaxed">
              {tool.description}
            </p>
          )}
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[10.5px] uppercase tracking-wide text-ink-faint">
          Input schema
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-surface px-2 py-1.5 font-mono text-[10.5px] text-ink-secondary whitespace-pre-wrap">
          {JSON.stringify(tool.inputSchema, null, 2)}
        </pre>
      </details>
    </li>
  );
}
