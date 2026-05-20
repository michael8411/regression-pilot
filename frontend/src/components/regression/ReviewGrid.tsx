import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  Trash2,
  Upload,
} from "@/lib/icons";
import { Button, Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useRoute } from "@/contexts/RouteContext";
import {
  useRegisterCommand,
  type CommandItem,
} from "@/contexts/CommandRegistryContext";
import type { TestCase } from "@/types";
import { useRegressionSession } from "./hooks/useRegressionSession";
import { TestCaseRow } from "./parts/TestCaseRow";
import { TestCaseEditor } from "./parts/TestCaseEditor";
import { EmptyState } from "./parts/EmptyState";

const PRIORITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

type SortField = "name" | "priority";
interface SortState {
  field: SortField;
  dir: "asc" | "desc";
}

export function ReviewGrid() {
  const { goto } = useRoute();
  const { state, isRestoring, saveState, saveStateImmediate } =
    useRegressionSession();

  if (isRestoring) return <ReviewSkeleton />;

  if (state.testCases.length === 0) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <EmptyState
          icon={ClipboardList}
          title="No test cases yet"
          description="Generate test cases first to review them here."
          action={{
            label: "Go to Generate",
            onClick: () => goto(["regression", "generate"]),
          }}
        />
      </div>
    );
  }

  return (
    <ReviewGridInner
      testCases={state.testCases}
      saveState={saveState}
      saveStateImmediate={saveStateImmediate}
      onPushGoto={() => goto(["regression", "push"])}
      onGenerateGoto={() => goto(["regression", "generate"])}
    />
  );
}

interface InnerProps {
  testCases: TestCase[];
  saveState: (key: string, value: unknown) => void;
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
  onPushGoto: () => void;
  onGenerateGoto: () => void;
}

function ReviewGridInner({
  testCases,
  saveState,
  saveStateImmediate,
  onPushGoto,
  onGenerateGoto,
}: InnerProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ field: "name", dir: "asc" });

  // Sort produces { tc, originalIndex } pairs so edits target the right entry
  // in the underlying array regardless of visual order.
  const sorted = useMemo(() => sortCases(testCases, sort), [testCases, sort]);

  const updateCase = useCallback(
    (i: number, next: TestCase) => {
      const arr = testCases.map((tc, idx) => (idx === i ? next : tc));
      saveState("testCases", arr);
    },
    [testCases, saveState],
  );

  const removeCase = useCallback(
    (i: number) => {
      const arr = testCases.filter((_, idx) => idx !== i);
      void saveStateImmediate("testCases", arr);
      // Re-index the selected set: drop `i` and shift higher indices down.
      setSelectedKeys((prev) => {
        const next = new Set<number>();
        prev.forEach((k) => {
          if (k === i) return;
          next.add(k > i ? k - 1 : k);
        });
        return next;
      });
      setDrawerIndex((cur) => {
        if (cur === null) return null;
        if (cur === i) return null;
        return cur > i ? cur - 1 : cur;
      });
    },
    [testCases, saveStateImmediate],
  );

  const removeSelected = useCallback(() => {
    if (selectedKeys.size === 0) return;
    const arr = testCases.filter((_, idx) => !selectedKeys.has(idx));
    void saveStateImmediate("testCases", arr);
    setSelectedKeys(new Set());
    setDrawerIndex(null);
  }, [selectedKeys, testCases, saveStateImmediate]);

  const toggleRow = useCallback((i: number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedKeys(
        checked ? new Set(testCases.map((_, i) => i)) : new Set(),
      );
    },
    [testCases],
  );

  // ── Command palette ───────────────────────────────────────────
  const pushCmd = useMemo<CommandItem | false>(
    () =>
      testCases.length === 0
        ? false
        : {
            id: "review.push",
            group: "action",
            label: "Push to Zephyr",
            sub: "review",
            icon: Upload,
            kbd: "Mod+P",
            action: { type: "run", run: onPushGoto },
          },
    [testCases.length, onPushGoto],
  );
  useRegisterCommand(pushCmd);

  const removeSelectedCmd = useMemo<CommandItem | false>(
    () =>
      selectedKeys.size === 0
        ? false
        : {
            id: "review.remove-selected",
            group: "action",
            label: `Remove ${selectedKeys.size} selected`,
            sub: "review",
            icon: Trash2,
            action: { type: "run", run: removeSelected },
          },
    [selectedKeys.size, removeSelected],
  );
  useRegisterCommand(removeSelectedCmd);

  const allSelected =
    testCases.length > 0 && selectedKeys.size === testCases.length;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <Header
        count={testCases.length}
        selectedCount={selectedKeys.size}
        canPush={testCases.length > 0}
        onRemoveSelected={removeSelected}
        onPush={onPushGoto}
        onGenerateGoto={onGenerateGoto}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-[5] bg-surface-panel border-b border-subtle">
            <tr>
              <Th width="44px">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  size="sm"
                  aria-label={
                    allSelected ? "Deselect all" : "Select all test cases"
                  }
                />
              </Th>
              <SortableTh sort={sort} setSort={setSort} field="name">
                Name
              </SortableTh>
              <SortableTh
                sort={sort}
                setSort={setSort}
                field="priority"
                width="120px"
              >
                Priority
              </SortableTh>
              <Th width="80px" align="right">
                Steps
              </Th>
              <Th width="64px" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ tc, originalIndex }) => (
              <TestCaseRow
                key={originalIndex}
                testCase={tc}
                selected={selectedKeys.has(originalIndex)}
                onToggle={() => toggleRow(originalIndex)}
                onOpen={() => setDrawerIndex(originalIndex)}
                onRemove={() => removeCase(originalIndex)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {drawerIndex !== null && testCases[drawerIndex] && (
        <TestCaseEditor
          testCase={testCases[drawerIndex]}
          onChange={(next) => updateCase(drawerIndex, next)}
          onClose={() => setDrawerIndex(null)}
          onDelete={() => removeCase(drawerIndex)}
        />
      )}
    </div>
  );
}

interface HeaderProps {
  count: number;
  selectedCount: number;
  canPush: boolean;
  onRemoveSelected: () => void;
  onPush: () => void;
  onGenerateGoto: () => void;
}

function Header({
  count,
  selectedCount,
  canPush,
  onRemoveSelected,
  onPush,
  onGenerateGoto,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
      <div className="min-w-0">
        <h1 className="t-h2 text-ink">Review</h1>
        <p className="t-meta text-ink-muted">
          {count} {count === 1 ? "test case" : "test cases"}
          {selectedCount > 0 && ` · ${selectedCount} selected`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <Button
            variant="danger"
            size="md"
            onClick={onRemoveSelected}
            leading={<Trash2 size={14} />}
          >
            Remove ({selectedCount})
          </Button>
        )}
        <Button
          variant="ghost"
          size="md"
          onClick={onGenerateGoto}
        >
          Regenerate
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canPush}
          onClick={onPush}
          leading={<Upload size={14} />}
        >
          Push to Zephyr
        </Button>
      </div>
    </div>
  );
}

interface ThProps {
  width?: string;
  align?: "left" | "right" | "center";
  children?: React.ReactNode;
}

function Th({ width, align = "left", children }: ThProps) {
  return (
    <th
      style={width ? { width, minWidth: width } : undefined}
      className={cn(
        "px-3 py-2 text-[10px] uppercase tracking-wider font-medium text-ink-muted",
        align === "left"
          ? "text-left"
          : align === "right"
          ? "text-right"
          : "text-center",
      )}
    >
      {children}
    </th>
  );
}

interface SortableThProps {
  sort: SortState;
  setSort: (s: SortState) => void;
  field: SortField;
  width?: string;
  children: React.ReactNode;
}

function SortableTh({
  sort,
  setSort,
  field,
  width,
  children,
}: SortableThProps) {
  const active = sort.field === field;
  const dir = active ? sort.dir : null;
  return (
    <th
      style={width ? { width, minWidth: width } : undefined}
      className="px-3 py-2 text-left"
    >
      <button
        type="button"
        onClick={() =>
          setSort({
            field,
            dir: active && sort.dir === "asc" ? "desc" : "asc",
          })
        }
        aria-sort={
          active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
        }
        className={cn(
          "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium",
          "transition-colors duration-fast ease-smooth",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded",
          active ? "text-ink" : "text-ink-muted hover:text-ink-secondary",
        )}
      >
        <span>{children}</span>
        {dir === "asc" ? (
          <ArrowUp size={10} />
        ) : dir === "desc" ? (
          <ArrowDown size={10} />
        ) : (
          <ChevronDown size={10} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

function sortCases(
  cases: TestCase[],
  sort: SortState,
): { tc: TestCase; originalIndex: number }[] {
  const indexed = cases.map((tc, originalIndex) => ({ tc, originalIndex }));
  indexed.sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    if (sort.field === "priority") {
      av = PRIORITY_ORDER[a.tc.priority] ?? 99;
      bv = PRIORITY_ORDER[b.tc.priority] ?? 99;
    } else {
      av = (a.tc.name ?? "").toLowerCase();
      bv = (b.tc.name ?? "").toLowerCase();
    }
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return a.originalIndex - b.originalIndex; // stable tiebreak
  });
  return indexed;
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-subtle">
        <div className="space-y-2">
          <div className="h-5 w-24 rounded bg-surface-overlay animate-pulse" />
          <div className="h-3 w-40 rounded bg-surface-overlay animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-surface-overlay animate-pulse" />
      </div>
      <div className="flex-1 px-6 py-5 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-9 rounded bg-surface-overlay animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
