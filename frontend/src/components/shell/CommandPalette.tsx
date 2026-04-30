import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  useCommandRegistry,
  type CommandGroup,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import { useRoute } from "@/contexts/RouteContext";
import { scoreCommand } from "@/lib/fuzzy";
import { Search } from "@/lib/icons";
import { Kbd, KbdPill } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: CommandGroup[] = ["jump", "action", "ai", "recent", "help"];
const GROUP_LABEL: Record<CommandGroup, string> = {
  jump: "Jump to",
  action: "Actions",
  ai: "AI",
  recent: "Recent",
  help: "Help",
};

interface Row {
  kind: "header" | "item";
  group: CommandGroup;
  item?: CommandItem;
  score?: number;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { commands } = useCommandRegistry();
  const { goto } = useRoute();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) return;
    prevFocus.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const visible = commands.filter((c) => {
      if (c.enabled === false) return false;
      if (c.when && !c.when()) return false;
      return true;
    });

    const scored = visible
      .map((c) => ({ c, score: scoreCommand(query, c) }))
      .filter((x) => x.score > 0);

    const byGroup = new Map<CommandGroup, Array<{ c: CommandItem; score: number }>>();
    for (const g of GROUP_ORDER) byGroup.set(g, []);
    for (const s of scored) byGroup.get(s.c.group)?.push(s);
    for (const arr of byGroup.values()) arr.sort((a, b) => b.score - a.score);

    const out: Row[] = [];
    for (const g of GROUP_ORDER) {
      const items = byGroup.get(g) ?? [];
      if (items.length === 0) continue;
      out.push({ kind: "header", group: g });
      for (const i of items) {
        out.push({ kind: "item", group: g, item: i.c, score: i.score });
      }
    }
    return out;
  }, [commands, query]);

  const itemRows = useMemo(() => rows.filter((r) => r.kind === "item"), [rows]);

  useEffect(() => {
    if (itemRows.length === 0) {
      setSelected(0);
    } else if (selected >= itemRows.length) {
      setSelected(itemRows.length - 1);
    }
  }, [itemRows.length, selected]);

  const execute = useCallback(
    (cmd: CommandItem) => {
      onClose();
      if (cmd.action.type === "goto") {
        goto(cmd.action.route);
      } else {
        const run = cmd.action.run;
        queueMicrotask(() => {
          void run();
        });
      }
    },
    [goto, onClose],
  );

  const onKey = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }
      if (itemRows.length === 0) return;
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key.toLowerCase() === "n")) {
        e.preventDefault();
        setSelected((s) => (s + 1) % itemRows.length);
      } else if (
        e.key === "ArrowUp" ||
        (e.ctrlKey && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        setSelected((s) => (s - 1 + itemRows.length) % itemRows.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = itemRows[selected]?.item;
        if (cmd) execute(cmd);
      }
    },
    [itemRows, selected, execute, onClose],
  );

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-idx="${selected}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const showRecentHint =
    rows.length > 0 && !commands.some((c) => c.group === "recent");

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] animate-fade-in"
      onClick={onClose}
      onKeyDown={onKey}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-title"
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] rounded-2xl border border-muted bg-surface-elevated shadow-float overflow-hidden animate-slide-up"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <Search size={18} className="text-ink-muted" />
          <input
            id="cmd-title"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Search or run…"
            aria-label="Command palette search"
            className="flex-1 bg-transparent outline-none text-ink text-[14px] placeholder:text-ink-muted"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {itemRows.length} results
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-activedescendant={
            itemRows.length > 0 ? `cmd-row-${selected}` : undefined
          }
          className="max-h-[440px] overflow-y-auto py-2 px-1.5"
        >
          {rows.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            rows.map((r, i) =>
              r.kind === "header" ? (
                <div
                  key={`h-${r.group}-${i}`}
                  className="t-label px-3 pt-2 pb-1"
                >
                  {GROUP_LABEL[r.group]}
                </div>
              ) : (
                <CommandRow
                  key={r.item!.id}
                  index={itemRows.findIndex((ir) => ir.item === r.item)}
                  selected={
                    itemRows.findIndex((ir) => ir.item === r.item) === selected
                  }
                  item={r.item!}
                  onHover={setSelected}
                  onClick={() => execute(r.item!)}
                />
              ),
            )
          )}
          {showRecentHint && (
            <div className="px-3 pt-3 pb-1 text-[11px] text-ink-muted italic">
              Recent sessions and tickets — shipping in Phase 5.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
CommandPalette.displayName = "CommandPalette";

function CommandRow({
  index,
  selected,
  item,
  onHover,
  onClick,
}: {
  index: number;
  selected: boolean;
  item: CommandItem;
  onHover: (idx: number) => void;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      id={`cmd-row-${index}`}
      data-cmd-idx={index}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseEnter={() => onHover(index)}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 rounded-md text-left",
        selected ? "bg-accent/10" : "hover:bg-surface-overlay",
      )}
    >
      <Icon
        size={16}
        className={item.ai ? "text-ai" : "text-ink-secondary"}
      />
      <span className={cn("flex-1 truncate text-[13px]", item.ai && "text-ink")}>
        {item.label}
      </span>
      {item.sub && (
        <span className="font-mono text-[11px] text-ink-muted">{item.sub}</span>
      )}
      {item.kbd && <KbdPill keys={item.kbd} />}
    </button>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="t-title text-ink-secondary">No matches</div>
      <div className="t-meta text-ink-muted mt-1">
        {query
          ? `No command matches "${query}". Try typing an action or a screen name.`
          : "No commands registered."}
      </div>
    </div>
  );
}
