import { useRoute } from "@/contexts/RouteContext";
import { LiveHome } from "./LiveHome";
import { BoardProvider } from "./BoardProvider";

export function LiveWorkspace() {
  const { route } = useRoute();
  if (route[0] !== "live") return null;

  if (route[1] === "home") {
    return <LiveHome />;
  }

  if (route[1] === "board") {
    return (
      <BoardProvider boardId={route[2]}>
        <KanbanBoardPlaceholder boardId={route[2]} />
      </BoardProvider>
    );
  }

  if (route[1] === "pinned") {
    return <PinnedPlaceholder />;
  }

  return null;
}

function KanbanBoardPlaceholder({ boardId }: { boardId: string }) {
  return (
    <div className="p-4 text-[12px] text-ink-faint">
      Kanban board for <code>{boardId}</code> arrives in Phase 8c.
    </div>
  );
}

function PinnedPlaceholder() {
  return (
    <div className="p-4 text-[12px] text-ink-faint">
      Pinned board arrives in Phase 8c.
    </div>
  );
}
