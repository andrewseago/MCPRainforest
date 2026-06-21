export type AppSection =
  | "servers"
  | "marketplace"
  | "tools"
  | "tool_groups"
  | "prompts"
  | "resources"
  | "diagnostics";

export interface DashboardEmptyState {
  title: string;
  description: string;
  commands?: string[];
}

export interface DashboardEndpoint {
  label: string;
  url: string;
}

export interface DashboardOverviewResponse {
  status: "running" | "degraded" | "unknown";
  mode: string;
  version: string;
  endpoints: DashboardEndpoint[];
  server_count: number;
  tool_count: number;
  prompt_count: number;
  resource_count: number;
  empty_state?: DashboardEmptyState;
  troubleshooting?: string[];
}

export interface DashboardServerConfigSummary {
  kind: string;
  target?: string;
  command?: string;
  argument_count?: number;
  env_keys?: string[];
  header_keys?: string[];
  session_mode?: string;
  description?: string;
  sanitized_summary: string;
}

export interface DashboardServer {
  name: string;
  transport: string;
  enabled: boolean;
  status: "connected" | "reachable" | "failed" | "unknown";
  tool_count: number;
  prompt_count: number;
  resource_count: number;
  last_discovered_at?: string;
  updated_at?: string;
  connection_summary: string;
  config_summary: DashboardServerConfigSummary;
}

export interface DashboardServersResponse {
  servers: DashboardServer[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardTool {
  name: string;
  canonical_name: string;
  server: string;
  description: string;
  enabled: boolean;
  server_enabled: boolean;
  input_schema?: Record<string, unknown>;
  input_preview?: string;
  transport?: string;
  server_status?: string;
  annotation_keys?: string[];
}

export interface DashboardToolsResponse {
  tools: DashboardTool[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardToolGroupTool {
  name: string;
  canonical_name: string;
  server: string;
  description?: string;
}

export interface DashboardToolGroup {
  name: string;
  description?: string;
  tool_count: number;
  tools: DashboardToolGroupTool[];
  streamable_http_endpoint: string;
  sse_endpoint: string;
  sse_message_endpoint: string;
}

export interface DashboardToolGroupsResponse {
  tool_groups: DashboardToolGroup[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardPrompt {
  name: string;
  canonical_name: string;
  server: string;
  description: string;
  enabled: boolean;
  server_enabled: boolean;
  arguments?: Array<Record<string, unknown>>;
  arguments_preview?: string;
  transport?: string;
  server_status?: string;
}

export interface DashboardPromptsResponse {
  prompts: DashboardPrompt[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardResource {
  uri: string;
  name: string;
  server: string;
  description: string;
  mime_type?: string;
  enabled: boolean;
  transport?: string;
  server_status?: string;
}

export interface DashboardResourcesResponse {
  resources: DashboardResource[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardDiagnosticsResponse {
  version: string;
  mode: string;
  config_source?: string;
  config_path?: string;
  database: string;
  enabled_transports: string[];
  metrics_endpoint?: string;
  primary_endpoint: string;
  troubleshooting_hints: string[];
  server_count: number;
  tool_count: number;
  prompt_count: number;
  resource_count: number;
  empty_state?: DashboardEmptyState;
}

export type DashboardMarketplaceInstallStatus =
  | "installable"
  | "review_required"
  | "external"
  | "blocked";

export type DashboardMarketplaceUpdateState =
  | "not_installed"
  | "unknown"
  | "current"
  | "local_changes"
  | "update_available";

export interface DashboardMarketplaceSource {
  id: string;
  name: string;
  url: string;
  description?: string;
  trust_level?: string;
}

export interface DashboardMarketplaceInstall {
  name: string;
  description?: string;
  transport: "stdio" | "streamable_http" | "sse";
  session_mode?: "stateless" | "stateful";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  required_env_keys?: string[];
  required_header_keys?: string[];
}

export interface DashboardMarketplaceInstallation {
  server_name: string;
  entry_id: string;
  source_id: string;
  installed_version?: string;
  installed_digest?: string;
  catalog_version?: string;
  catalog_digest?: string;
  installed_at?: string;
}

export interface DashboardMarketplaceServer {
  id: string;
  name: string;
  display_name?: string;
  description: string;
  source_id: string;
  publisher?: string;
  version?: string;
  digest?: string;
  category?: string;
  tags?: string[];
  transport: string;
  auth_type?: string;
  homepage_url?: string;
  package_url?: string;
  install_status: DashboardMarketplaceInstallStatus;
  install?: DashboardMarketplaceInstall;
  installed: boolean;
  installed_server_name?: string;
  update_state: DashboardMarketplaceUpdateState;
  installation?: DashboardMarketplaceInstallation;
  review_reasons?: string[];
  security_notes?: string[];
}

export interface DashboardMarketplaceResponse {
  sources: DashboardMarketplaceSource[];
  servers: DashboardMarketplaceServer[];
  empty_state?: DashboardEmptyState;
}

export interface DashboardRegisterServerInput {
  name: string;
  transport: "stdio" | "streamable_http" | "sse";
  description?: string;
  url?: string;
  bearer_token?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  session_mode?: "stateless" | "stateful";
  marketplace_entry_id?: string;
}

export interface DashboardCreateToolGroupInput {
  name: string;
  description?: string;
  tools: string[];
}

export interface DashboardOAuthAuthorizationRequired {
  session_id: string;
  authorization_url: string;
  expires_at: string;
}

export interface DashboardRegisterServerResponse {
  name?: string;
  transport?: string;
  enabled?: boolean;
  description?: string;
  authorization_required?: DashboardOAuthAuthorizationRequired;
}

export interface DashboardOAuthSessionResponse {
  session_id: string;
  status: "pending" | "completed" | "failed" | "expired";
  server_name?: string;
  expires_at?: string;
  error?: string;
}

export interface DashboardData {
  overview?: DashboardOverviewResponse;
  servers?: DashboardServersResponse;
  marketplace?: DashboardMarketplaceResponse;
  tools?: DashboardToolsResponse;
  toolGroups?: DashboardToolGroupsResponse;
  prompts?: DashboardPromptsResponse;
  resources?: DashboardResourcesResponse;
  diagnostics?: DashboardDiagnosticsResponse;
}
