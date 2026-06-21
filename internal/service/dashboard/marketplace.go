package dashboard

import (
	"sort"

	"github.com/mcpjungle/mcpjungle/internal/model"
	"github.com/mcpjungle/mcpjungle/pkg/types"
)

// Marketplace returns a curated, dry-run catalog for the dashboard. Entries are
// registration drafts only; callers must still review and submit through the
// existing server registration path.
func (s *Service) Marketplace() (*types.DashboardMarketplaceResponse, error) {
	resp := &types.DashboardMarketplaceResponse{
		Sources: marketplaceSources(),
		Servers: marketplaceServers(),
	}

	installed, err := s.installedMarketplaceServers()
	if err != nil {
		return nil, err
	}
	for index := range resp.Servers {
		if serverName, ok := installed[resp.Servers[index].Name]; ok {
			resp.Servers[index].Installed = true
			resp.Servers[index].InstalledServerName = serverName
		}
	}

	if len(resp.Servers) == 0 {
		resp.EmptyState = emptyState(
			"No marketplace entries available",
			"The local catalog is empty. Add trusted marketplace sources before installing MCP servers from the dashboard.",
			nil,
		)
	}
	return resp, nil
}

func (s *Service) installedMarketplaceServers() (map[string]string, error) {
	installed := map[string]string{}
	if s == nil || s.db == nil {
		return installed, nil
	}

	var servers []model.McpServer
	if err := s.db.Select("name").Find(&servers).Error; err != nil {
		return nil, err
	}
	for _, server := range servers {
		installed[server.Name] = server.Name
	}
	return installed, nil
}

func marketplaceSources() []types.DashboardMarketplaceSource {
	return []types.DashboardMarketplaceSource{
		{
			ID:          "official-registry",
			Name:        "Official MCP Registry",
			URL:         "https://registry.modelcontextprotocol.io/",
			Description: "Canonical registry for discovering MCP servers and client-visible metadata.",
			TrustLevel:  "official",
		},
		{
			ID:          "smithery",
			Name:        "Smithery",
			URL:         "https://smithery.ai/",
			Description: "Hosted MCP connection catalog with configuration and OAuth setup flows.",
			TrustLevel:  "third_party",
		},
		{
			ID:          "glama",
			Name:        "Glama MCP Directory",
			URL:         "https://glama.ai/mcp/servers",
			Description: "Large third-party MCP server directory with category and transport discovery.",
			TrustLevel:  "third_party",
		},
		{
			ID:          "mcp-so",
			Name:        "MCP.so",
			URL:         "https://mcp.so/",
			Description: "Third-party MCP marketplace and discovery directory.",
			TrustLevel:  "third_party",
		},
		{
			ID:          "docker",
			Name:        "Docker MCP Catalog",
			URL:         "https://www.docker.com/products/mcp-catalog-and-toolkit/",
			Description: "Containerized MCP catalog and gateway workflows for Docker-hosted servers.",
			TrustLevel:  "third_party",
		},
	}
}

func marketplaceServers() []types.DashboardMarketplaceServer {
	servers := []types.DashboardMarketplaceServer{
		{
			ID:            "context7",
			Name:          "context7",
			DisplayName:   "Context7",
			Description:   "Fetch current library, framework, SDK, API, and CLI documentation through MCP.",
			SourceID:      "official-registry",
			Publisher:     "Upstash",
			Version:       "remote",
			Digest:        "catalog:context7:remote",
			Category:      "Documentation",
			Tags:          []string{"docs", "developer-tools", "remote"},
			Transport:     string(types.TransportStreamableHTTP),
			AuthType:      "none",
			HomepageURL:   "https://context7.com/",
			PackageURL:    "https://mcp.context7.com/mcp",
			InstallStatus: types.DashboardMarketplaceInstallable,
			Install: &types.DashboardMarketplaceInstall{
				Name:        "context7",
				Description: "Current documentation lookup through Context7.",
				Transport:   string(types.TransportStreamableHTTP),
				SessionMode: string(types.SessionModeStateless),
				URL:         "https://mcp.context7.com/mcp",
			},
			SecurityNotes: []string{
				"Remote HTTPS endpoint with no catalog-supplied secrets.",
				"Review the target URL before submitting registration.",
			},
		},
		{
			ID:            "server-everything",
			Name:          "everything",
			DisplayName:   "MCP Server Everything",
			Description:   "Reference server exposing sample tools, prompts, and resources for dashboard testing.",
			SourceID:      "official-registry",
			Publisher:     "Model Context Protocol",
			Version:       "npm",
			Digest:        "catalog:server-everything:npm",
			Category:      "Testing",
			Tags:          []string{"reference", "testing", "stdio"},
			Transport:     string(types.TransportStdio),
			AuthType:      "none",
			HomepageURL:   "https://github.com/modelcontextprotocol/servers",
			PackageURL:    "https://www.npmjs.com/package/@modelcontextprotocol/server-everything",
			InstallStatus: types.DashboardMarketplaceReviewRequired,
			Install: &types.DashboardMarketplaceInstall{
				Name:        "everything",
				Description: "Local server-everything sample for dashboard QA.",
				Transport:   string(types.TransportStdio),
				SessionMode: string(types.SessionModeStateless),
				Command:     "npx",
				Args:        []string{"-y", "@modelcontextprotocol/server-everything", "stdio"},
			},
			ReviewReasons: []string{
				"stdio servers spawn a local process on the MCPRainforest host.",
				"npx package resolution should be reviewed before registration.",
			},
			SecurityNotes: []string{
				"No secret values are included in the catalog draft.",
				"Registering this entry will execute npx on the server host.",
			},
		},
		{
			ID:            "filesystem",
			Name:          "filesystem",
			DisplayName:   "Filesystem",
			Description:   "Expose a constrained local filesystem root as MCP tools and resources.",
			SourceID:      "official-registry",
			Publisher:     "Model Context Protocol",
			Version:       "npm",
			Digest:        "catalog:filesystem:npm",
			Category:      "Local Context",
			Tags:          []string{"files", "local", "stdio"},
			Transport:     string(types.TransportStdio),
			AuthType:      "local_path",
			HomepageURL:   "https://github.com/modelcontextprotocol/servers",
			PackageURL:    "https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem",
			InstallStatus: types.DashboardMarketplaceReviewRequired,
			Install: &types.DashboardMarketplaceInstall{
				Name:        "filesystem",
				Description: "Local filesystem access for selected workspace roots.",
				Transport:   string(types.TransportStdio),
				SessionMode: string(types.SessionModeStateless),
				Command:     "npx",
				Args:        []string{"-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/root"},
			},
			ReviewReasons: []string{
				"Requires selecting local filesystem roots before use.",
				"stdio servers spawn a local process on the MCPRainforest host.",
			},
			SecurityNotes: []string{
				"Replace the placeholder path with the narrowest allowed root.",
				"Do not register broad roots such as /, /Users, or home directories unless explicitly intended.",
			},
		},
		{
			ID:            "smithery-github",
			Name:          "smithery-github",
			DisplayName:   "GitHub via Smithery",
			Description:   "GitHub MCP connection managed through Smithery setup and OAuth/token configuration.",
			SourceID:      "smithery",
			Publisher:     "Smithery",
			Version:       "hosted",
			Digest:        "catalog:smithery:github",
			Category:      "Code Hosting",
			Tags:          []string{"github", "oauth", "remote"},
			Transport:     string(types.TransportStreamableHTTP),
			AuthType:      "oauth_or_token",
			HomepageURL:   "https://smithery.ai/",
			PackageURL:    "https://smithery.ai/",
			InstallStatus: types.DashboardMarketplaceExternal,
			ReviewReasons: []string{
				"Hosted setup requires provider-side OAuth or token configuration.",
				"MCPRainforest should not receive catalog-supplied secrets.",
			},
			SecurityNotes: []string{
				"Complete provider setup externally, then register the resulting endpoint manually.",
				"Keep secret values in local credential storage and paste only when submitting registration.",
			},
		},
		{
			ID:            "docker-mcp-gateway",
			Name:          "docker-mcp-gateway",
			DisplayName:   "Docker MCP Gateway",
			Description:   "Containerized catalog and gateway workflow for running MCP servers behind Docker tooling.",
			SourceID:      "docker",
			Publisher:     "Docker",
			Version:       "toolkit",
			Digest:        "catalog:docker:mcp-gateway",
			Category:      "Runtime",
			Tags:          []string{"docker", "gateway", "containers"},
			Transport:     string(types.TransportStreamableHTTP),
			AuthType:      "varies",
			HomepageURL:   "https://www.docker.com/products/mcp-catalog-and-toolkit/",
			PackageURL:    "https://www.docker.com/products/mcp-catalog-and-toolkit/",
			InstallStatus: types.DashboardMarketplaceExternal,
			ReviewReasons: []string{
				"Requires Docker-side gateway configuration before MCPRainforest registration.",
				"Available tools and credentials vary by selected containerized server.",
			},
			SecurityNotes: []string{
				"Register only the final Docker MCP Gateway endpoint after container policy is configured.",
			},
		},
		{
			ID:            "unsafe-shell-template",
			Name:          "unsafe-shell-template",
			DisplayName:   "Shell command template",
			Description:   "Example of a catalog entry blocked by the marketplace policy because shell wrappers can hide arbitrary execution.",
			SourceID:      "mcp-so",
			Publisher:     "Example",
			Version:       "blocked",
			Digest:        "catalog:blocked:shell-template",
			Category:      "Policy Example",
			Tags:          []string{"blocked", "stdio", "security"},
			Transport:     string(types.TransportStdio),
			AuthType:      "none",
			InstallStatus: types.DashboardMarketplaceBlocked,
			ReviewReasons: []string{
				"Shell wrappers and inline execution patterns are blocked from catalog prefill.",
				"Blocked entries cannot open a registration draft.",
			},
			SecurityNotes: []string{
				"Use explicit argv arrays from trusted sources instead of shell command strings.",
			},
		},
	}

	sort.SliceStable(servers, func(i, j int) bool {
		if servers[i].InstallStatus != servers[j].InstallStatus {
			return installStatusRank(servers[i].InstallStatus) < installStatusRank(servers[j].InstallStatus)
		}
		return servers[i].DisplayName < servers[j].DisplayName
	})
	return servers
}

func installStatusRank(status types.DashboardMarketplaceInstallStatus) int {
	switch status {
	case types.DashboardMarketplaceInstallable:
		return 0
	case types.DashboardMarketplaceReviewRequired:
		return 1
	case types.DashboardMarketplaceExternal:
		return 2
	case types.DashboardMarketplaceBlocked:
		return 3
	default:
		return 4
	}
}
