package types

type DashboardStatus string

const (
	DashboardStatusRunning  DashboardStatus = "running"
	DashboardStatusDegraded DashboardStatus = "degraded"
	DashboardStatusUnknown  DashboardStatus = "unknown"
)

type DashboardServerStatus string

const (
	DashboardServerStatusConnected DashboardServerStatus = "connected"
	DashboardServerStatusReachable DashboardServerStatus = "reachable"
	DashboardServerStatusFailed    DashboardServerStatus = "failed"
	DashboardServerStatusUnknown   DashboardServerStatus = "unknown"
)

type DashboardEndpoint struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type DashboardEmptyState struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Commands    []string `json:"commands,omitempty"`
}

type DashboardOverviewResponse struct {
	Status          DashboardStatus      `json:"status"`
	Mode            string               `json:"mode"`
	Version         string               `json:"version"`
	Endpoints       []DashboardEndpoint  `json:"endpoints"`
	ServerCount     int                  `json:"server_count"`
	ToolCount       int                  `json:"tool_count"`
	PromptCount     int                  `json:"prompt_count"`
	ResourceCount   int                  `json:"resource_count"`
	EmptyState      *DashboardEmptyState `json:"empty_state,omitempty"`
	Troubleshooting []string             `json:"troubleshooting,omitempty"`
}

type DashboardServerConfigSummary struct {
	Kind             string   `json:"kind"`
	Target           string   `json:"target,omitempty"`
	Command          string   `json:"command,omitempty"`
	ArgumentCount    int      `json:"argument_count,omitempty"`
	EnvKeys          []string `json:"env_keys,omitempty"`
	HeaderKeys       []string `json:"header_keys,omitempty"`
	SessionMode      string   `json:"session_mode,omitempty"`
	Description      string   `json:"description,omitempty"`
	SanitizedSummary string   `json:"sanitized_summary"`
}

type DashboardServer struct {
	Name               string                       `json:"name"`
	Transport          string                       `json:"transport"`
	Enabled            bool                         `json:"enabled"`
	Status             DashboardServerStatus        `json:"status"`
	ToolCount          int                          `json:"tool_count"`
	PromptCount        int                          `json:"prompt_count"`
	ResourceCount      int                          `json:"resource_count"`
	LastDiscoveredAt   string                       `json:"last_discovered_at,omitempty"`
	UpdatedAt          string                       `json:"updated_at,omitempty"`
	ConnectionSummary  string                       `json:"connection_summary"`
	ConfigSummary      DashboardServerConfigSummary `json:"config_summary"`
	NamespacedExamples []string                     `json:"namespaced_examples,omitempty"`
}

type DashboardServersResponse struct {
	Servers    []DashboardServer    `json:"servers"`
	EmptyState *DashboardEmptyState `json:"empty_state,omitempty"`
}

type DashboardTool struct {
	Name           string         `json:"name"`
	CanonicalName  string         `json:"canonical_name"`
	Server         string         `json:"server"`
	Description    string         `json:"description"`
	Enabled        bool           `json:"enabled"`
	ServerEnabled  bool           `json:"server_enabled"`
	InputSchema    map[string]any `json:"input_schema,omitempty"`
	InputPreview   string         `json:"input_preview,omitempty"`
	Transport      string         `json:"transport,omitempty"`
	ServerStatus   string         `json:"server_status,omitempty"`
	AnnotationKeys []string       `json:"annotation_keys,omitempty"`
}

type DashboardToolsResponse struct {
	Tools      []DashboardTool      `json:"tools"`
	EmptyState *DashboardEmptyState `json:"empty_state,omitempty"`
}

type DashboardPrompt struct {
	Name             string           `json:"name"`
	CanonicalName    string           `json:"canonical_name"`
	Server           string           `json:"server"`
	Description      string           `json:"description"`
	Enabled          bool             `json:"enabled"`
	ServerEnabled    bool             `json:"server_enabled"`
	Arguments        []map[string]any `json:"arguments,omitempty"`
	ArgumentsPreview string           `json:"arguments_preview,omitempty"`
	Transport        string           `json:"transport,omitempty"`
	ServerStatus     string           `json:"server_status,omitempty"`
}

type DashboardPromptsResponse struct {
	Prompts    []DashboardPrompt    `json:"prompts"`
	EmptyState *DashboardEmptyState `json:"empty_state,omitempty"`
}

type DashboardResource struct {
	URI          string `json:"uri"`
	Name         string `json:"name"`
	Server       string `json:"server"`
	Description  string `json:"description"`
	MIMEType     string `json:"mime_type,omitempty"`
	Enabled      bool   `json:"enabled"`
	Transport    string `json:"transport,omitempty"`
	ServerStatus string `json:"server_status,omitempty"`
}

type DashboardResourcesResponse struct {
	Resources  []DashboardResource  `json:"resources"`
	EmptyState *DashboardEmptyState `json:"empty_state,omitempty"`
}

type DashboardDiagnosticsResponse struct {
	Version              string               `json:"version"`
	Mode                 string               `json:"mode"`
	ConfigSource         string               `json:"config_source,omitempty"`
	ConfigPath           string               `json:"config_path,omitempty"`
	Database             string               `json:"database"`
	EnabledTransports    []string             `json:"enabled_transports"`
	MetricsEndpoint      string               `json:"metrics_endpoint,omitempty"`
	PrimaryEndpoint      string               `json:"primary_endpoint"`
	TroubleshootingHints []string             `json:"troubleshooting_hints"`
	ServerCount          int                  `json:"server_count"`
	ToolCount            int                  `json:"tool_count"`
	PromptCount          int                  `json:"prompt_count"`
	ResourceCount        int                  `json:"resource_count"`
	EmptyState           *DashboardEmptyState `json:"empty_state,omitempty"`
}

type DashboardMarketplaceInstallStatus string
type DashboardMarketplaceUpdateState string

const (
	DashboardMarketplaceInstallable    DashboardMarketplaceInstallStatus = "installable"
	DashboardMarketplaceReviewRequired DashboardMarketplaceInstallStatus = "review_required"
	DashboardMarketplaceExternal       DashboardMarketplaceInstallStatus = "external"
	DashboardMarketplaceBlocked        DashboardMarketplaceInstallStatus = "blocked"
)

const (
	DashboardMarketplaceUpdateNotInstalled DashboardMarketplaceUpdateState = "not_installed"
	DashboardMarketplaceUpdateUnknown      DashboardMarketplaceUpdateState = "unknown"
	DashboardMarketplaceUpdateCurrent      DashboardMarketplaceUpdateState = "current"
	DashboardMarketplaceUpdateLocalChanges DashboardMarketplaceUpdateState = "local_changes"
	DashboardMarketplaceUpdateAvailable    DashboardMarketplaceUpdateState = "update_available"
)

type DashboardMarketplaceSource struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
	TrustLevel  string `json:"trust_level,omitempty"`
	Status      string `json:"status,omitempty"`
	ServerCount int    `json:"server_count,omitempty"`
	LoadedAt    string `json:"loaded_at,omitempty"`
	Error       string `json:"error,omitempty"`
	Searchable  bool   `json:"searchable,omitempty"`
}

type DashboardMarketplaceInstall struct {
	Name               string            `json:"name"`
	Description        string            `json:"description,omitempty"`
	Transport          string            `json:"transport"`
	SessionMode        string            `json:"session_mode,omitempty"`
	URL                string            `json:"url,omitempty"`
	Command            string            `json:"command,omitempty"`
	Args               []string          `json:"args,omitempty"`
	Env                map[string]string `json:"env,omitempty"`
	Headers            map[string]string `json:"headers,omitempty"`
	RequiredEnvKeys    []string          `json:"required_env_keys,omitempty"`
	RequiredHeaderKeys []string          `json:"required_header_keys,omitempty"`
}

type DashboardMarketplaceInstallation struct {
	ServerName       string `json:"server_name"`
	EntryID          string `json:"entry_id"`
	SourceID         string `json:"source_id"`
	InstalledVersion string `json:"installed_version,omitempty"`
	InstalledDigest  string `json:"installed_digest,omitempty"`
	CatalogVersion   string `json:"catalog_version,omitempty"`
	CatalogDigest    string `json:"catalog_digest,omitempty"`
	InstalledAt      string `json:"installed_at,omitempty"`
}

type DashboardMarketplaceServer struct {
	ID                  string                            `json:"id"`
	Name                string                            `json:"name"`
	DisplayName         string                            `json:"display_name,omitempty"`
	Description         string                            `json:"description"`
	SourceID            string                            `json:"source_id"`
	Publisher           string                            `json:"publisher,omitempty"`
	Version             string                            `json:"version,omitempty"`
	Digest              string                            `json:"digest,omitempty"`
	Category            string                            `json:"category,omitempty"`
	Tags                []string                          `json:"tags,omitempty"`
	Transport           string                            `json:"transport"`
	AuthType            string                            `json:"auth_type,omitempty"`
	HomepageURL         string                            `json:"homepage_url,omitempty"`
	PackageURL          string                            `json:"package_url,omitempty"`
	InstallStatus       DashboardMarketplaceInstallStatus `json:"install_status"`
	Install             *DashboardMarketplaceInstall      `json:"install,omitempty"`
	Installed           bool                              `json:"installed"`
	InstalledServerName string                            `json:"installed_server_name,omitempty"`
	UpdateState         DashboardMarketplaceUpdateState   `json:"update_state"`
	Installation        *DashboardMarketplaceInstallation `json:"installation,omitempty"`
	ReviewReasons       []string                          `json:"review_reasons,omitempty"`
	SecurityNotes       []string                          `json:"security_notes,omitempty"`
}

type DashboardMarketplaceResponse struct {
	Sources    []DashboardMarketplaceSource `json:"sources"`
	Servers    []DashboardMarketplaceServer `json:"servers"`
	Query      DashboardMarketplaceQuery    `json:"query,omitempty"`
	Pagination DashboardMarketplacePage     `json:"pagination,omitempty"`
	EmptyState *DashboardEmptyState         `json:"empty_state,omitempty"`
}

type DashboardMarketplaceQuery struct {
	Search        string `json:"q,omitempty"`
	SourceID      string `json:"source_id,omitempty"`
	Transport     string `json:"transport,omitempty"`
	InstallStatus string `json:"install_status,omitempty"`
	UpdateState   string `json:"update_state,omitempty"`
	Limit         int    `json:"limit,omitempty"`
	Cursor        string `json:"cursor,omitempty"`
}

type DashboardMarketplacePage struct {
	Limit      int    `json:"limit,omitempty"`
	NextCursor string `json:"next_cursor,omitempty"`
	Total      int    `json:"total,omitempty"`
}
