import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import {
  type CollisionDetection,
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  generateTestCases,
  groupTickets as groupTicketsSemantic,
} from "@/lib/api";
import type { GroupTicketsResponse, JiraTicket, TestCase } from "@/types";

interface GenerateViewProps {
  tickets: JiraTicket[];
  onGenerated: (testCases: TestCase[]) => void;
  onBack: () => void;
  saveState: (key: string, value: unknown) => void;
  initialInstructions?: string;
  initialGroups?: Record<string, JiraTicket[]>;
}

export function GenerateView({
  tickets,
  onGenerated,
  onBack,
  saveState,
  initialInstructions,
  initialGroups,
}: GenerateViewProps) {
  const [instructions, setInstructions] = useState(initialInstructions ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<GroupTicketsResponse | null>(null);
  const [groupingLoading, setGroupingLoading] = useState(false);
  const [editableGroups, setEditableGroups] = useState<
    Record<string, JiraTicket[]>
  >(initialGroups ?? {});

  const ticketSignature = useMemo(
    () =>
      tickets
        .map((t) => t.key)
        .sort()
        .join("|"),
    [tickets],
  );

  // Covered keys in the restored groups — used to decide whether the cached
  // grouping is still valid for the current ticket selection.
  const restoredCoverageSignature = useMemo(() => {
    if (!initialGroups) return null;
    const keys: string[] = [];
    for (const items of Object.values(initialGroups)) {
      for (const t of items) keys.push(t.key);
    }
    if (keys.length === 0) return null;
    return keys.sort().join("|");
  }, [initialGroups]);

  // True when the saved grouping already covers exactly this ticket set —
  // in that case the Gemini grouping call is skipped entirely.
  const restoredGroupsRef = useRef(
    restoredCoverageSignature !== null &&
      restoredCoverageSignature === ticketSignature,
  );

  const [newGroupName, setNewGroupName] = useState("");
  const [activeTicketKey, setActiveTicketKey] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overGroupName, setOverGroupName] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0
      ? pointerCollisions
      : closestCenter(args);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateTestCases(tickets, instructions);
      if (result.error) {
        setError(result.error);
      } else {
        onGenerated(result.test_cases);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Cached grouping matches the current ticket set — do not call Gemini.
    if (restoredGroupsRef.current) return;
    if (tickets.length === 0) return;

    let cancelled = false;
    const loadGrouping = async () => {
      setGroupingLoading(true);
      try {
        const result = await groupTicketsSemantic(tickets);
        if (!cancelled) setGrouping(result);
      } catch {
        if (!cancelled) setGrouping(null);
      } finally {
        if (!cancelled) setGroupingLoading(false);
      }
    };
    loadGrouping();
    return () => {
      cancelled = true;
    };
  }, [tickets]);

  const grouped = useMemo(
    () =>
      mapGroupingToTickets(tickets, grouping) || groupTicketsHeuristic(tickets),
    [tickets, grouping],
  );

  useEffect(() => {
    if (restoredGroupsRef.current) return;
    setEditableGroups(grouped);
    // Persist the first derived grouping so leaving and returning to this
    // view does not trigger another Gemini call.
    saveState("editableGroups", grouped);
  }, [grouped, saveState]);

  const ticketToGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const [groupName, items] of Object.entries(editableGroups)) {
      for (const ticket of items) map.set(ticket.key, groupName);
    }
    return map;
  }, [editableGroups]);

  const findGroupForId = (id: string | null): string | null => {
    if (!id) return null;
    if (editableGroups[id]) return id;
    return ticketToGroup.get(id) || null;
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    setEditableGroups((prev) => {
      if (prev[name]) return prev;
      return { ...prev, [name]: [] };
    });
    setNewGroupName("");
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTicketKey(String(active.id));
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    const overRaw = over ? String(over.id) : null;
    setOverId(overRaw);
    const sortableContainerId = over?.data?.current
      ? (over.data.current as { sortable?: { containerId?: string } }).sortable
          ?.containerId
      : undefined;
    setOverGroupName(sortableContainerId || findGroupForId(overRaw));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setOverId(null);
    setOverGroupName(null);
    setActiveTicketKey(null);
    if (!over) return;

    const activeId = String(active.id);
    const overIdLocal = String(over.id);
    const fromGroup = findGroupForId(activeId);
    const toGroup = findGroupForId(overIdLocal);
    if (!fromGroup || !toGroup) return;

    setEditableGroups((prev) => {
      const fromItems = prev[fromGroup];
      const toItems = prev[toGroup];
      const activeIndex = fromItems.findIndex((t) => t.key === activeId);
      if (activeIndex === -1) return prev;

      let next: Record<string, JiraTicket[]>;
      if (fromGroup === toGroup) {
        const overIndex = toItems.findIndex((t) => t.key === overIdLocal);
        if (overIndex === -1 || overIndex === activeIndex) return prev;
        next = { ...prev, [fromGroup]: arrayMove(fromItems, activeIndex, overIndex) };
      } else {
        const movingTicket = fromItems[activeIndex];
        const nextFrom = fromItems.filter((t) => t.key !== activeId);
        const overIndex = toItems.findIndex((t) => t.key === overIdLocal);
        const insertIndex = overIndex >= 0 ? overIndex : toItems.length;
        const nextTo = [...toItems];
        nextTo.splice(insertIndex, 0, movingTicket);
        next = { ...prev, [fromGroup]: nextFrom, [toGroup]: nextTo };
      }

      saveState("editableGroups", next);
      return next;
    });
  };

  return (
    <div className="flex overflow-hidden relative flex-col flex-1 gap-5 p-6 animate-fade">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <div className="flex justify-center items-center w-9 h-9 rounded-lg bg-accent-dim">
            <Sparkles size={18} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">
              Generate Test Cases
            </h2>
            <p className="text-xs text-ink-muted">
              {tickets.length} tickets selected — Gemini will analyze and create
              regression cases
            </p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="flex gap-2 items-center text-xs g-btn"
        >
          <RotateCcw size={13} />
          Back
        </button>
      </div>

      <div className="relative overflow-y-auto overflow-x-hidden flex-1 p-4 min-h-0 surface">
        <div
          className={`flex gap-2 items-center mb-3 ${
            groupingLoading ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Add category..."
            className="h-8 text-xs g-input"
            disabled={groupingLoading}
          />
          <button
            onClick={addGroup}
            className="g-btn text-xs px-3 py-1.5"
            disabled={groupingLoading}
          >
            Add
          </button>
        </div>

        <div
          className={
            groupingLoading ? "pointer-events-none select-none opacity-60" : ""
          }
          aria-busy={groupingLoading}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {Object.entries(editableGroups).map(
              ([groupName, groupTickets]) => (
                <GroupDropSection
                  key={groupName}
                  groupName={groupName}
                  tickets={groupTickets}
                  overId={overId}
                  overGroupName={overGroupName}
                  activeTicketKey={activeTicketKey}
                />
              ),
            )}
          </DndContext>
        </div>

        {groupingLoading && (
          <div
            className="flex absolute inset-0 z-20 justify-center items-center backdrop-blur-sm bg-scene/70"
            role="status"
            aria-live="polite"
          >
            <div className="flex gap-3 items-center px-4 py-3 rounded-lg border shadow-lg surface border-subtle">
              <Loader2
                size={18}
                className="animate-spin text-accent-text"
              />
              <div className="text-sm text-ink">
                Organizing tickets into themes...
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-[11px] text-ink-muted font-medium mb-1.5 block">
          Additional Instructions (optional)
        </label>
        <textarea
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            saveState("instructions", e.target.value);
          }}
          placeholder="E.g., Focus on sync edge cases, include offline scenarios, pay attention to multi-BU switching..."
          className="w-full h-24 text-sm resize-none g-input"
        />
      </div>

      {error && (
        <div className="p-3 text-sm rounded-[10px] border bg-err/10 border-err/20 text-err/90">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex gap-2 justify-center items-center py-3 text-sm font-medium g-btn-solid disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating test cases... this may take 30-60 seconds
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Generate Regression Test Cases
            <ArrowRight size={14} />
          </>
        )}
      </button>
    </div>
  );
}

function GroupDropSection({
  groupName,
  tickets,
  overId,
  overGroupName,
  activeTicketKey,
}: {
  groupName: string;
  tickets: JiraTicket[];
  overId: string | null;
  overGroupName: string | null;
  activeTicketKey: string | null;
}) {
  const { setNodeRef } = useDroppable({ id: groupName });
  const itemIds = tickets.map((t) => t.key);
  const overContainer = overGroupName === groupName;
  const showContainerDropLine =
    !!activeTicketKey &&
    overContainer &&
    (overId === groupName || !itemIds.includes(overId || ""));

  return (
    <div
      ref={setNodeRef}
      className={`mb-4 last:mb-0 rounded-lg border p-2.5 transition-colors ${
        overContainer
          ? "border-accent/40 bg-accent-dim"
          : "border-subtle bg-surface-input"
      }`}
    >
      <h3 className="text-[11px] font-medium text-accent-text/70 uppercase tracking-wider mb-2">
        {groupName} ({tickets.length})
      </h3>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {tickets.length === 0 && (
            <div className="rounded-md border border-dashed border-muted px-2 py-2 text-[11px] text-ink-muted">
              Drop tickets here
            </div>
          )}
          {tickets.map((ticket) => (
            <SortableTicketRow
              key={ticket.key}
              ticket={ticket}
              showDropLine={
                overId === ticket.key && activeTicketKey !== ticket.key
              }
            />
          ))}
          {showContainerDropLine && (
            <div className="border-t-2 border-dashed border-accent/70 mt-1.5" />
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTicketRow({
  ticket,
  showDropLine,
}: {
  ticket: JiraTicket;
  showDropLine: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${showDropLine ? "border-t-2 border-dashed border-accent/70 pt-1.5" : ""}`}
    >
      <div
        className={`flex items-center gap-2 text-xs rounded-md px-1.5 py-1.5 hover:bg-surface-overlay border border-transparent transition-colors ${
          isDragging ? "opacity-40" : "opacity-100"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 p-0.5 rounded hover:bg-surface-overlay cursor-grab active:cursor-grabbing"
          aria-label={`Drag ${ticket.key}`}
        >
          <GripVertical size={14} className="text-ink-muted" />
        </button>
        <span className="w-16 font-mono tabular-nums text-ink-muted">
          {ticket.key}
        </span>
        <span className="flex-1 truncate text-ink-secondary">
          {ticket.summary}
        </span>
      </div>
    </div>
  );
}

function groupTicketsHeuristic(
  tickets: JiraTicket[],
): Record<string, JiraTicket[]> {
  const groups: Record<string, JiraTicket[]> = {};
  for (const t of tickets) {
    const summary = t.summary.toLowerCase();
    let group = "Other";

    if (summary.includes("pay adjust") || summary.includes("pa override")) {
      group = "Pay Adjustments";
    } else if (summary.includes("sync") || summary.includes("setup")) {
      group = "Setups & Sync";
    } else if (
      summary.includes("work order") ||
      summary.includes("work request")
    ) {
      group = "Work Orders";
    } else if (summary.includes("telematic") || summary.includes("gps")) {
      group = "Telematics / GPS";
    } else {
      group = "Bug Fixes & Misc";
    }

    if (!groups[group]) groups[group] = [];
    groups[group].push(t);
  }
  return groups;
}

function mapGroupingToTickets(
  tickets: JiraTicket[],
  grouping: GroupTicketsResponse | null,
): Record<string, JiraTicket[]> | null {
  if (!grouping?.groups?.length) return null;
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  const out: Record<string, JiraTicket[]> = {};
  for (const g of grouping.groups) {
    const items = g.ticket_keys
      .map((k) => byKey.get(k))
      .filter((t): t is JiraTicket => !!t);
    if (items.length > 0) out[g.name] = items;
  }
  return Object.keys(out).length > 0 ? out : null;
}
