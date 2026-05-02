import { Checkbox, IconButton, PriorityPill, type Priority } from "@/components/ui";
import { Trash2 } from "@/lib/icons";
import { cn } from "@/lib/cn";
import type { TestCase } from "@/types";

export interface TestCaseRowProps {
  testCase: TestCase;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRemove: () => void;
}

/** PriorityPill only accepts Critical|High|Medium|Low. Coerce stray values. */
function normalizePriority(p: string): Priority {
  if (p === "Critical" || p === "Highest") return "Critical";
  if (p === "High") return "High";
  if (p === "Medium") return "Medium";
  return "Low";
}

export function TestCaseRow({
  testCase,
  selected,
  onToggle,
  onOpen,
  onRemove,
}: TestCaseRowProps) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "border-b border-subtle cursor-pointer transition-colors duration-fast ease-smooth",
        selected
          ? "bg-accent/[0.07] hover:bg-accent/10"
          : "hover:bg-surface-overlay",
      )}
    >
      <td
        className="px-3 py-2 align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={onToggle}
          size="sm"
          aria-label={`Select test case: ${testCase.name}`}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <span
          className="text-[13px] text-ink-secondary truncate block max-w-[600px]"
          title={testCase.name}
        >
          {testCase.name || "(untitled)"}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
        <PriorityPill
          priority={normalizePriority(testCase.priority)}
          size="sm"
        />
      </td>
      <td className="px-3 py-2 align-middle text-[12px] text-ink-muted tabular-nums">
        {testCase.steps.length}
      </td>
      <td
        className="px-3 py-2 align-middle text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          aria-label={`Delete test case: ${testCase.name}`}
          tooltip="Delete"
          onClick={onRemove}
        />
      </td>
    </tr>
  );
}
