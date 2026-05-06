import { useState } from "react";
import { useRoute } from "@/contexts/RouteContext";
import { LiveHome } from "./LiveHome";
import { BoardProvider } from "./BoardProvider";
import { KanbanBoard } from "./KanbanBoard";
import { PinnedBoard } from "./PinnedBoard";

export function LiveWorkspace() {
  const { route } = useRoute();
  // openKey is intentionally declared even though TicketDrawer (8d) is not
  // mounted yet — keeps the closure stable so 8d can drop in without
  // restructuring this component.
  const [, setOpenKey] = useState<string | null>(null);

  if (route[0] !== "live") return null;

  if (route[1] === "home") {
    return <LiveHome />;
  }

  if (route[1] === "board") {
    return (
      <BoardProvider boardId={route[2]}>
        <div className="relative h-full">
          <KanbanBoard onOpenTicket={(k) => setOpenKey(k)} />
        </div>
      </BoardProvider>
    );
  }

  if (route[1] === "pinned") {
    return (
      <div className="relative h-full">
        <PinnedBoard onOpenTicket={(k) => setOpenKey(k)} />
      </div>
    );
  }

  return null;
}
