import { useEffect, useState } from "react";
import { useRoute } from "@/contexts/RouteContext";
import { LiveHome } from "./LiveHome";
import { BoardProvider, useBoard } from "./BoardProvider";
import { KanbanBoard } from "./KanbanBoard";
import { PinnedBoard } from "./PinnedBoard";
import { TicketDrawer } from "./TicketDrawer";

export function LiveWorkspace() {
  const { route } = useRoute();
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (route[0] !== "live") return null;

  if (route[1] === "home") {
    return <LiveHome />;
  }

  if (route[1] === "board") {
    return (
      <BoardProvider boardId={route[2]}>
        <BoardWithDrawer openKey={openKey} setOpenKey={setOpenKey} />
      </BoardProvider>
    );
  }

  if (route[1] === "pinned") {
    return (
      <div className="relative h-full">
        <PinnedBoard onOpenTicket={(k) => setOpenKey(k)} />
        {openKey && (
          <TicketDrawer
            ticketKey={openKey}
            onClose={() => setOpenKey(null)}
          />
        )}
      </div>
    );
  }

  return null;
}

function BoardWithDrawer({
  openKey,
  setOpenKey,
}: {
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
}) {
  const board = useBoard();

  useEffect(() => {
    if (openKey) {
      board.pausePolling();
      return () => board.resumePolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  return (
    <div className="relative h-full">
      <KanbanBoard onOpenTicket={(k) => setOpenKey(k)} />
      {openKey && (
        <TicketDrawer
          ticketKey={openKey}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
