import { useEffect, useMemo, useState } from "react";
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
}

export function GenerateView({
  tickets,
  onGenerated,
  onBack,
}: GenerateViewProps) {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<GroupTicketsResponse | null>(null);
  const [groupingLoading, setGroupingLoading] = useState(false);
  const [editableGroups, setEditableGroups] = useState<
    Record<string, JiraTicket[]>
  >({});
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
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
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
    if (tickets.length > 0) loadGrouping();
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
    setEditableGroups(grouped);
  }, [grouped]);

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

      if (fromGroup === toGroup) {
        const overIndex = toItems.findIndex((t) => t.key === overIdLocal);
        if (overIndex === -1 || overIndex === activeIndex) return prev;
        return {
          ...prev,
          [fromGroup]: arrayMove(fromItems, activeIndex, overIndex),
        };
      }

      const movingTicket = fromItems[activeIndex];
      const nextFrom = fromItems.filter((t) => t.key !== activeId);
      const overIndex = toItems.findIndex((t) => t.key === overIdLocal);
      const insertIndex = overIndex >= 0 ? overIndex : toItems.length;
      const nextTo = [...toItems];
      nextTo.splice(insertIndex, 0, movingTicket);
      return {
        ...prev,
        [fromGroup]: nextFrom,
        [toGroup]: nextTo,
      };
    });
  };

  return (
    <div className="flex overflow-hidden flex-col flex-1 gap-5 p-6 animate-fade">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <div className="flex justify-center items-center w-9 h-9 rounded-xl bg-accent/10">
            <Sparkles size={18} className="text-accent-light" />
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

      <div className="overflow-y-auto overflow-x-hidden flex-1 p-4 min-h-0 glass">
        {groupingLoading && (
          <div className="text-[11px] text-ink-muted mb-3">
            Organizing tickets into regression themes...
          </div>
        )}

        <div className="flex gap-2 items-center mb-3">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Add category..."
            className="h-8 text-xs g-input"
          />
          <button onClick={addGroup} className="g-btn text-xs px-3 py-1.5">
            Add
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {Object.entries(editableGroups).map(([groupName, groupTickets]) => (
            <GroupDropSection
              key={groupName}
              groupName={groupName}
              tickets={groupTickets}
              overId={overId}
              overGroupName={overGroupName}
              activeTicketKey={activeTicketKey}
            />
          ))}

        </DndContext>
      </div>

      <div>
        <label className="text-[11px] text-ink-muted font-medium mb-1.5 block">
          Additional Instructions (optional)
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="E.g., Focus on sync edge cases, include offline scenarios, pay attention to multi-BU switching..."
          className="w-full h-24 text-sm resize-none g-input"
        />
      </div>

      {error && (
        <div className="p-3 text-sm rounded-xl border bg-err/10 border-danger/20 text-err/90">
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
      className={`mb-4 last:mb-0 rounded-xl border p-2.5 transition-colors ${
        overContainer
          ? "border-accent/40 bg-accent/[0.08]"
          : "border-white/[0.05] bg-white/[0.01]"
      }`}
    >
      <h3 className="text-[11px] font-semibold text-accent-light/70 uppercase tracking-wider mb-2">
        {groupName} ({tickets.length})
      </h3>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {tickets.length === 0 && (
            <div className="rounded-md border border-dashed border-white/[0.18] px-2 py-2 text-[11px] text-ink-faint">
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
        className={`flex items-center gap-2 text-xs rounded px-1.5 py-1.5 bg-white/[0.01] hover:bg-white/[0.03] border border-transparent ${
          isDragging ? "opacity-40" : "opacity-100"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 p-0.5 rounded hover:bg-white/[0.08] cursor-grab active:cursor-grabbing"
          aria-label={`Drag ${ticket.key}`}
        >
          <GripVertical size={14} className="text-ink-faint" />
        </button>
        <span className="w-16 font-mono text-ink-muted">{ticket.key}</span>
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
