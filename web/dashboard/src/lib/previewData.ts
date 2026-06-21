import type {
  DashboardData,
  DashboardDiagnosticsResponse,
  DashboardEndpoint,
  DashboardOverviewResponse,
  DashboardPrompt,
  DashboardResource,
  DashboardServer,
  DashboardTool,
  DashboardToolGroup,
} from "./types";

const sampleTimestamp = "2026-06-20T21:42:00Z";

function currentBaseURL() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8080";
  }
  return window.location.origin;
}

function primaryEndpoint(data: DashboardData): DashboardEndpoint {
  return data.overview?.endpoints?.[0] ?? {
    label: "Streamable HTTP",
    url: `${currentBaseURL()}/mcp`,
  };
}

function gatewayBaseURL(data: DashboardData) {
  return primaryEndpoint(data).url.replace(/\/mcp\/?$/, "");
}

function emptyCollections(data: DashboardData) {
  return (
    (data.servers?.servers.length ?? 0) === 0 &&
    (data.tools?.tools.length ?? 0) === 0 &&
    (data.toolGroups?.tool_groups.length ?? 0) === 0 &&
    (data.prompts?.prompts.length ?? 0) === 0 &&
    (data.resources?.resources.length ?? 0) === 0
  );
}

function sampleServers(): DashboardServer[] {
  return [
    {
      name: "context7",
      transport: "streamable_http",
      enabled: true,
      status: "reachable",
      tool_count: 3,
      prompt_count: 0,
      resource_count: 1,
      last_discovered_at: sampleTimestamp,
      updated_at: sampleTimestamp,
      connection_summary: "https://mcp.context7.com/mcp",
      config_summary: {
        kind: "streamable_http",
        target: "https://mcp.context7.com/mcp",
        header_keys: ["Authorization"],
        session_mode: "stateless",
        description: "Current library documentation lookup.",
        sanitized_summary: "https://mcp.context7.com/mcp",
      },
    },
    {
      name: "filesystem",
      transport: "stdio",
      enabled: true,
      status: "connected",
      tool_count: 4,
      prompt_count: 1,
      resource_count: 3,
      last_discovered_at: sampleTimestamp,
      updated_at: sampleTimestamp,
      connection_summary: "npx @modelcontextprotocol/server-filesystem",
      config_summary: {
        kind: "stdio",
        command: "npx",
        argument_count: 3,
        env_keys: ["MCP_ALLOWED_ROOTS"],
        session_mode: "stateful",
        description: "Local workspace file inspection.",
        sanitized_summary: "npx @modelcontextprotocol/server-filesystem",
      },
    },
    {
      name: "github",
      transport: "streamable_http",
      enabled: true,
      status: "reachable",
      tool_count: 4,
      prompt_count: 2,
      resource_count: 1,
      last_discovered_at: "2026-06-20T21:28:00Z",
      updated_at: "2026-06-20T21:28:00Z",
      connection_summary: "https://api.githubcopilot.com/mcp",
      config_summary: {
        kind: "streamable_http",
        target: "https://api.githubcopilot.com/mcp",
        header_keys: ["Authorization", "X-MCP-Client"],
        session_mode: "stateless",
        description: "Repository, issue, and pull request operations.",
        sanitized_summary: "https://api.githubcopilot.com/mcp",
      },
    },
    {
      name: "sequential-thinking",
      transport: "stdio",
      enabled: false,
      status: "unknown",
      tool_count: 2,
      prompt_count: 2,
      resource_count: 0,
      last_discovered_at: "2026-06-20T20:55:00Z",
      updated_at: "2026-06-20T20:55:00Z",
      connection_summary: "node @modelcontextprotocol/server-sequential-thinking",
      config_summary: {
        kind: "stdio",
        command: "node",
        argument_count: 1,
        env_keys: [],
        session_mode: "stateful",
        description: "Structured reasoning helper server.",
        sanitized_summary: "node @modelcontextprotocol/server-sequential-thinking",
      },
    },
  ];
}

const sampleTools: DashboardTool[] = [
  {
    name: "resolve-library-id",
    canonical_name: "context7__resolve-library-id",
    server: "context7",
    description: "Resolve a package or framework name to a Context7 documentation library ID.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["libraryName"],
      properties: {
        libraryName: {
          type: "string",
          description: "Package, framework, SDK, API, or CLI name.",
        },
      },
    },
  },
  {
    name: "query-docs",
    canonical_name: "context7__query-docs",
    server: "context7",
    description: "Fetch current documentation snippets for a resolved library ID.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["libraryId", "query"],
      properties: {
        libraryId: { type: "string", description: "Context7 library ID." },
        query: { type: "string", description: "Specific docs question." },
      },
    },
  },
  {
    name: "list-directory",
    canonical_name: "filesystem__list-directory",
    server: "filesystem",
    description: "List files and folders under an allowed workspace root.",
    enabled: true,
    server_enabled: true,
    transport: "stdio",
    server_status: "connected",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Directory path to inspect." },
      },
    },
  },
  {
    name: "read-file",
    canonical_name: "filesystem__read-file",
    server: "filesystem",
    description: "Read a file from an allowed workspace root.",
    enabled: true,
    server_enabled: true,
    transport: "stdio",
    server_status: "connected",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "File path to read." },
      },
    },
  },
  {
    name: "search-files",
    canonical_name: "filesystem__search-files",
    server: "filesystem",
    description: "Search text across files under an allowed root.",
    enabled: true,
    server_enabled: true,
    transport: "stdio",
    server_status: "connected",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["path", "pattern"],
      properties: {
        path: { type: "string", description: "Root path to search." },
        pattern: { type: "string", description: "Search pattern." },
      },
    },
  },
  {
    name: "write-file",
    canonical_name: "filesystem__write-file",
    server: "filesystem",
    description: "Write file content under an allowed workspace root.",
    enabled: false,
    server_enabled: true,
    transport: "stdio",
    server_status: "connected",
    annotation_keys: ["destructiveHint"],
    input_schema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string", description: "File path to write." },
        content: { type: "string", description: "New file content." },
      },
    },
  },
  {
    name: "search-repositories",
    canonical_name: "github__search-repositories",
    server: "github",
    description: "Search repositories visible to the authenticated GitHub identity.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "GitHub repository search query." },
      },
    },
  },
  {
    name: "get-issue",
    canonical_name: "github__get-issue",
    server: "github",
    description: "Read issue metadata, body, labels, and comments.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["owner", "repo", "number"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        number: { type: "integer" },
      },
    },
  },
  {
    name: "create-pull-request",
    canonical_name: "github__create-pull-request",
    server: "github",
    description: "Create a pull request from an existing branch.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["destructiveHint"],
    input_schema: {
      type: "object",
      required: ["owner", "repo", "head", "base", "title"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        title: { type: "string" },
      },
    },
  },
  {
    name: "list-workflow-runs",
    canonical_name: "github__list-workflow-runs",
    server: "github",
    description: "Inspect recent GitHub Actions runs for a repository.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    annotation_keys: ["readOnlyHint"],
    input_schema: {
      type: "object",
      required: ["owner", "repo"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
    },
  },
  {
    name: "think-step",
    canonical_name: "sequential-thinking__think-step",
    server: "sequential-thinking",
    description: "Record one step in a structured reasoning trace.",
    enabled: true,
    server_enabled: false,
    transport: "stdio",
    server_status: "unknown",
    annotation_keys: [],
    input_schema: {
      type: "object",
      required: ["thought", "step"],
      properties: {
        thought: { type: "string" },
        step: { type: "integer" },
      },
    },
  },
  {
    name: "summarize-reasoning",
    canonical_name: "sequential-thinking__summarize-reasoning",
    server: "sequential-thinking",
    description: "Summarize active reasoning steps into a compact result.",
    enabled: true,
    server_enabled: false,
    transport: "stdio",
    server_status: "unknown",
    annotation_keys: [],
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["bullets", "paragraph", "decision"],
        },
      },
    },
  },
];

const samplePrompts: DashboardPrompt[] = [
  {
    name: "repo-review",
    canonical_name: "github__repo-review",
    server: "github",
    description: "Generate a repository review prompt from recent issues and pull requests.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    arguments: [
      { name: "owner", type: "string", required: true },
      { name: "repo", type: "string", required: true },
    ],
  },
  {
    name: "release-notes",
    canonical_name: "github__release-notes",
    server: "github",
    description: "Draft release notes from merged pull requests.",
    enabled: true,
    server_enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
    arguments: [{ name: "milestone", type: "string", required: false }],
  },
  {
    name: "workspace-summary",
    canonical_name: "filesystem__workspace-summary",
    server: "filesystem",
    description: "Summarize notable files under the selected workspace root.",
    enabled: true,
    server_enabled: true,
    transport: "stdio",
    server_status: "connected",
    arguments: [{ name: "path", type: "string", required: true }],
  },
  {
    name: "reasoning-check",
    canonical_name: "sequential-thinking__reasoning-check",
    server: "sequential-thinking",
    description: "Prompt for checking a reasoning chain for contradictions.",
    enabled: true,
    server_enabled: false,
    transport: "stdio",
    server_status: "unknown",
    arguments: [{ name: "decision", type: "string", required: true }],
  },
  {
    name: "next-step",
    canonical_name: "sequential-thinking__next-step",
    server: "sequential-thinking",
    description: "Prompt for selecting the next action from a reasoning trace.",
    enabled: true,
    server_enabled: false,
    transport: "stdio",
    server_status: "unknown",
    arguments: [{ name: "goal", type: "string", required: true }],
  },
];

const sampleResources: DashboardResource[] = [
  {
    uri: "context7://libraries/react",
    name: "React documentation index",
    server: "context7",
    description: "Cached index for current React documentation references.",
    mime_type: "application/json",
    enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
  },
  {
    uri: "file:///Users/andrewws/GitHub/MCPJungle/README.md",
    name: "Repository README",
    server: "filesystem",
    description: "Top-level project README.",
    mime_type: "text/markdown",
    enabled: true,
    transport: "stdio",
    server_status: "connected",
  },
  {
    uri: "file:///Users/andrewws/GitHub/MCPJungle/docs",
    name: "Documentation tree",
    server: "filesystem",
    description: "Local documentation directory.",
    mime_type: "inode/directory",
    enabled: true,
    transport: "stdio",
    server_status: "connected",
  },
  {
    uri: "file:///Users/andrewws/GitHub/MCPJungle/web/dashboard",
    name: "Dashboard source",
    server: "filesystem",
    description: "React/Vite dashboard workspace.",
    mime_type: "inode/directory",
    enabled: true,
    transport: "stdio",
    server_status: "connected",
  },
  {
    uri: "github://mcpjungle/MCPJungle/issues",
    name: "Issue tracker",
    server: "github",
    description: "Repository issue metadata and recent activity.",
    mime_type: "application/json",
    enabled: true,
    transport: "streamable_http",
    server_status: "reachable",
  },
];

function sampleToolGroups(baseURL: string): DashboardToolGroup[] {
  return [
    {
      name: "docs-research",
      description: "Library docs, repo metadata, and read-only local files.",
      tool_count: 5,
      tools: sampleTools
        .filter((tool) =>
          [
            "context7__resolve-library-id",
            "context7__query-docs",
            "filesystem__read-file",
            "filesystem__search-files",
            "github__get-issue",
          ].includes(tool.canonical_name),
        )
        .map(({ name, canonical_name, server, description }) => ({ name, canonical_name, server, description })),
      streamable_http_endpoint: `${baseURL}/v0/groups/docs-research/mcp`,
      sse_endpoint: `${baseURL}/v0/groups/docs-research/sse`,
      sse_message_endpoint: `${baseURL}/v0/groups/docs-research/message`,
    },
    {
      name: "repo-automation",
      description: "GitHub pull request and workflow automation tools.",
      tool_count: 4,
      tools: sampleTools
        .filter((tool) => tool.server === "github")
        .map(({ name, canonical_name, server, description }) => ({ name, canonical_name, server, description })),
      streamable_http_endpoint: `${baseURL}/v0/groups/repo-automation/mcp`,
      sse_endpoint: `${baseURL}/v0/groups/repo-automation/sse`,
      sse_message_endpoint: `${baseURL}/v0/groups/repo-automation/message`,
    },
    {
      name: "local-context",
      description: "Read-only local workspace inspection.",
      tool_count: 3,
      tools: sampleTools
        .filter((tool) => tool.server === "filesystem" && tool.enabled)
        .map(({ name, canonical_name, server, description }) => ({ name, canonical_name, server, description })),
      streamable_http_endpoint: `${baseURL}/v0/groups/local-context/mcp`,
      sse_endpoint: `${baseURL}/v0/groups/local-context/sse`,
      sse_message_endpoint: `${baseURL}/v0/groups/local-context/message`,
    },
  ];
}

function overviewWithPreviewData(data: DashboardData): DashboardOverviewResponse {
  const endpoint = primaryEndpoint(data);
  return {
    status: "running",
    mode: data.overview?.mode ?? data.diagnostics?.mode ?? "development",
    version: data.overview?.version ?? data.diagnostics?.version ?? "dev",
    endpoints: data.overview?.endpoints?.length ? data.overview.endpoints : [endpoint],
    server_count: 4,
    tool_count: sampleTools.length,
    prompt_count: samplePrompts.length,
    resource_count: sampleResources.length,
    troubleshooting: ["Sample inventory is displayed because no MCP servers are registered yet."],
  };
}

function diagnosticsWithPreviewData(data: DashboardData): DashboardDiagnosticsResponse {
  const baseURL = gatewayBaseURL(data);
  return {
    version: data.diagnostics?.version ?? data.overview?.version ?? "dev",
    mode: data.diagnostics?.mode ?? data.overview?.mode ?? "development",
    config_source: data.diagnostics?.config_source,
    config_path: data.diagnostics?.config_path,
    database: data.diagnostics?.database ?? "sqlite",
    enabled_transports: ["stdio", "streamable_http"],
    metrics_endpoint: data.diagnostics?.metrics_endpoint,
    primary_endpoint: data.diagnostics?.primary_endpoint ?? `${baseURL}/mcp`,
    troubleshooting_hints: ["Sample inventory is displayed because no MCP servers are registered yet."],
    server_count: 4,
    tool_count: sampleTools.length,
    prompt_count: samplePrompts.length,
    resource_count: sampleResources.length,
  };
}

export function applyPreviewData(data: DashboardData): { data: DashboardData; usingPreviewData: boolean } {
  if (!emptyCollections(data)) {
    return { data, usingPreviewData: false };
  }

  const baseURL = gatewayBaseURL(data);
  return {
    usingPreviewData: true,
    data: {
      ...data,
      overview: overviewWithPreviewData(data),
      servers: { servers: sampleServers() },
      tools: { tools: sampleTools },
      toolGroups: { tool_groups: sampleToolGroups(baseURL) },
      prompts: { prompts: samplePrompts },
      resources: { resources: sampleResources },
      diagnostics: diagnosticsWithPreviewData(data),
    },
  };
}
