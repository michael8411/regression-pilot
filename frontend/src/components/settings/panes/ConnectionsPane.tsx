import { McpConnectionsPanel } from "@/components/mcp";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

export function ConnectionsPane() {
  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Connections"
        subtitle="Manage Model Context Protocol servers your assistant can call into."
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <McpConnectionsPanel />
      </div>
    </div>
  );
}
