import { clsx } from "clsx";
import type { SlashCommand } from "@/components/assistant/lib/slashCommands";

interface Props {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandMenu({ commands, activeIndex, onSelect }: Props) {
  if (commands.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 mb-2 max-h-56 w-full overflow-y-auto rounded-lg border border-subtle bg-surface-elevated shadow-lg"
    >
      {commands.map((cmd, i) => (
        <li
          key={cmd.name}
          role="option"
          aria-selected={i === activeIndex}
          onClick={() => onSelect(cmd)}
          onMouseDown={(e) => e.preventDefault()}
          className={clsx(
            "flex items-baseline gap-2 px-3 py-2 cursor-pointer",
            i === activeIndex ? "bg-accent-dim" : "hover:bg-surface-overlay",
          )}
        >
          <span className="font-mono text-[12px] text-accent-text">
            /{cmd.name}
            {cmd.args ? <span className="opacity-60"> {cmd.args}</span> : null}
          </span>
          <span className="text-[11.5px] text-ink-muted truncate">
            {cmd.description}
          </span>
        </li>
      ))}
    </ul>
  );
}
