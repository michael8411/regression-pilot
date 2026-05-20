import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { MoreHorizontal, Trash2 } from "@/lib/icons";
import { Badge, Button, Spinner, Toggle } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";
import { useMcpConnections } from "./McpConnectionsProvider";
import type { McpConnection, McpTestResult } from "@/types/mcp";

interface Props {
  connection: McpConnection;
  onEdit: () => void;
  onTest: (result: McpTestResult) => void;
  onShowTools: () => void;
}

export function McpConnectionRow({
  connection,
  onEdit,
  onTest,
  onShowTools,
}: Props) {
  const { update, remove, test } = useMcpConnections();
  const [busy, setBusy] = useState<"test" | "toggle" | "delete" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isManaged = connection.id.startsWith("managed-");

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setBusy("toggle");
      try {
        await update(connection.id, { enabled: next });
      } finally {
        setBusy(null);
      }
    },
    [connection.id, update],
  );

  const handleTest = useCallback(async () => {
    setBusy("test");
    try {
      const result = await test(connection.id);
      onTest(result);
    } finally {
      setBusy(null);
    }
  }, [connection.id, onTest, test]);

  const handleDelete = useCallback(async () => {
    setMenuOpen(false);
    if (!confirm(`Delete connection "${connection.name}"?`)) return;
    setBusy("delete");
    try {
      await remove(connection.id);
    } finally {
      setBusy(null);
    }
  }, [connection.id, connection.name, remove]);

  const tone: BadgeTone =
    connection.status === "error"
      ? "err"
      : connection.status === "running"
        ? "ok"
        : "neutral";

  return (
    <li
      className={clsx(
        "rounded-lg border border-subtle bg-surface-elevated p-3",
        busy === "delete" && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">
              {connection.name}
            </span>
            <Badge tone="neutral" size="sm">
              {connection.transport.toUpperCase()}
            </Badge>
            <Badge tone={tone} size="sm">
              {connection.status}
            </Badge>
            {!connection.enabled && (
              <Badge tone="neutral" size="sm">
                disabled
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[10.5px] text-ink-faint">
            {connection.transport === "stdio"
              ? `${connection.command} ${connection.args.join(" ")}`.trim() ||
                "(no command)"
              : connection.url || "(no url)"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {connection.envKeys.map((k) => (
              <Badge key={k} tone="neutral" size="sm">
                {k}
              </Badge>
            ))}
            {connection.autoApprove.length > 0 && (
              <Badge tone="info" size="sm">
                {connection.autoApprove.length} auto-approve
              </Badge>
            )}
          </div>
          {connection.lastError && (
            <div className="mt-2 line-clamp-2 text-[11px] text-err">
              {connection.lastError}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isManaged ? (
            <Badge tone="neutral" size="sm">
              managed
            </Badge>
          ) : (
            <Toggle
              checked={connection.enabled}
              onChange={handleToggle}
              disabled={busy === "toggle"}
              aria-label={`${connection.enabled ? "Disable" : "Enable"} ${connection.name}`}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTest}
            disabled={busy === "test"}
            leading={busy === "test" ? <Spinner size={11} /> : undefined}
          >
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={onShowTools}>
            Tools
          </Button>
          {!isManaged && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Edit
              </Button>
              <div ref={menuRef} className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="More actions"
                >
                  <MoreHorizontal size={14} />
                </Button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-subtle bg-surface-elevated shadow-lg z-30"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleDelete}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-err hover:bg-err/10"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
