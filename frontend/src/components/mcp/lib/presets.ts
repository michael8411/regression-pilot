export interface McpPreset {
  id: string;
  label: string;
  description: string;
  command: string;
  args: string[];
  /** Pre-declare env keys so the editor surfaces them as required. */
  envKeys: string[];
  /** Tools the user typically wants auto-approved (read-only ones). */
  suggestedAutoApprove: string[];
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "filesystem",
    label: "Filesystem",
    description: "Read/write files in a sandbox directory.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "<directory>"],
    envKeys: [],
    suggestedAutoApprove: ["list_directory", "read_file"],
  },
  {
    id: "github",
    label: "GitHub",
    description: "Browse and search repositories, issues, and PRs.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envKeys: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    suggestedAutoApprove: [
      "search_repositories",
      "get_issue",
      "list_pull_requests",
    ],
  },
  {
    id: "atlassian",
    label: "Atlassian (Jira/Confluence)",
    description: "Read and search Jira issues and Confluence pages.",
    command: "npx",
    args: ["-y", "@sooperset/mcp-atlassian"],
    envKeys: ["JIRA_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"],
    suggestedAutoApprove: ["jira_search", "jira_get_issue"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Configure any stdio-compatible MCP server.",
    command: "",
    args: [],
    envKeys: [],
    suggestedAutoApprove: [],
  },
];

export function findPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((p) => p.id === id);
}
