package dashboard

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mcpjungle/mcpjungle/internal/model"
	"github.com/mcpjungle/mcpjungle/pkg/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMarketplaceCatalogIncludesReviewedInstallDrafts(t *testing.T) {
	service := NewService(nil, false)

	resp, err := service.Marketplace()
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotEmpty(t, resp.Sources)
	require.NotEmpty(t, resp.Servers)

	sourceIDs := map[string]bool{}
	for _, source := range resp.Sources {
		sourceIDs[source.ID] = true
		require.NotEmpty(t, source.Name)
		require.NotEmpty(t, source.URL)
	}

	var context7Found bool
	var everythingFound bool
	for _, server := range resp.Servers {
		require.True(t, sourceIDs[server.SourceID], "server %s references unknown source %s", server.ID, server.SourceID)
		require.NotEmpty(t, server.SecurityNotes)

		switch server.ID {
		case "context7":
			context7Found = true
			require.Equal(t, "installable", string(server.InstallStatus))
			require.NotNil(t, server.Install)
			require.Equal(t, "streamable_http", server.Install.Transport)
			require.Equal(t, "https://mcp.context7.com/mcp", server.Install.URL)
			require.Empty(t, server.Install.Env)
			require.Empty(t, server.Install.Headers)
		case "server-everything":
			everythingFound = true
			require.Equal(t, "review_required", string(server.InstallStatus))
			require.NotNil(t, server.Install)
			require.Equal(t, "stdio", server.Install.Transport)
			require.Equal(t, "npx", server.Install.Command)
			require.Contains(t, server.Install.Args, "@modelcontextprotocol/server-everything")
		}
	}

	require.True(t, context7Found, "expected context7 marketplace entry")
	require.True(t, everythingFound, "expected server-everything marketplace entry")

	body, err := json.Marshal(resp)
	require.NoError(t, err)
	require.NotContains(t, string(body), "bearer_token")
	require.NotContains(t, string(body), "oauth_client_secret")
	require.NotContains(t, string(body), "token-value")
	require.NotContains(t, string(body), "Authorization: Bearer")
}

func TestMarketplaceUpdateStateForCatalogInstallations(t *testing.T) {
	t.Run("static catalog without db is not installed", func(t *testing.T) {
		service := NewService(nil, false)

		resp, err := service.Marketplace()
		require.NoError(t, err)

		context7 := requireMarketplaceEntry(t, resp, "context7")
		require.False(t, context7.Installed)
		require.Equal(t, types.DashboardMarketplaceUpdateNotInstalled, context7.UpdateState)
		require.Nil(t, context7.Installation)
	})

	t.Run("manual install without provenance is unknown", func(t *testing.T) {
		db := newMarketplaceTestDB(t)
		server, err := model.NewStreamableHTTPServer(
			"context7",
			"Current documentation lookup through Context7.",
			"https://mcp.context7.com/mcp",
			"",
			nil,
			"",
		)
		require.NoError(t, err)
		require.NoError(t, db.Create(server).Error)

		resp, err := NewService(db, false).Marketplace()
		require.NoError(t, err)

		context7 := requireMarketplaceEntry(t, resp, "context7")
		require.True(t, context7.Installed)
		require.Equal(t, "context7", context7.InstalledServerName)
		require.Equal(t, types.DashboardMarketplaceUpdateUnknown, context7.UpdateState)
		require.Nil(t, context7.Installation)
	})

	t.Run("matching persisted digest is current", func(t *testing.T) {
		db := newMarketplaceTestDB(t)
		server, err := model.NewStreamableHTTPServer(
			"context7",
			"Current documentation lookup through Context7.",
			"https://mcp.context7.com/mcp",
			"",
			nil,
			"",
		)
		require.NoError(t, err)
		require.NoError(t, db.Create(server).Error)
		require.NoError(t, db.Create(&model.McpServerRegistrationSource{
			ServerName:       "context7",
			SourceType:       "marketplace",
			SourceID:         "official-registry",
			EntryID:          "context7",
			InstalledVersion: "remote",
			InstalledDigest:  "catalog:context7:remote",
			InstalledAt:      time.Now().UTC(),
		}).Error)

		resp, err := NewService(db, false).Marketplace()
		require.NoError(t, err)

		context7 := requireMarketplaceEntry(t, resp, "context7")
		require.True(t, context7.Installed)
		require.Equal(t, types.DashboardMarketplaceUpdateCurrent, context7.UpdateState)
		require.NotNil(t, context7.Installation)
		require.Equal(t, "context7", context7.Installation.ServerName)
		require.Equal(t, "catalog:context7:remote", context7.Installation.InstalledDigest)
		require.Equal(t, "catalog:context7:remote", context7.Installation.CatalogDigest)
	})

	t.Run("stored digest drift is update available", func(t *testing.T) {
		db := newMarketplaceTestDB(t)
		server, err := model.NewStreamableHTTPServer(
			"context7",
			"Current documentation lookup through Context7.",
			"https://mcp.context7.com/mcp",
			"",
			nil,
			"",
		)
		require.NoError(t, err)
		require.NoError(t, db.Create(server).Error)
		require.NoError(t, db.Create(&model.McpServerRegistrationSource{
			ServerName:       "context7",
			SourceType:       "marketplace",
			SourceID:         "official-registry",
			EntryID:          "context7",
			InstalledVersion: "remote",
			InstalledDigest:  "catalog:context7:old",
			InstalledAt:      time.Now().UTC(),
		}).Error)

		resp, err := NewService(db, false).Marketplace()
		require.NoError(t, err)

		context7 := requireMarketplaceEntry(t, resp, "context7")
		require.True(t, context7.Installed)
		require.Equal(t, types.DashboardMarketplaceUpdateAvailable, context7.UpdateState)
		require.NotNil(t, context7.Installation)
		require.Equal(t, "catalog:context7:old", context7.Installation.InstalledDigest)
		require.Equal(t, "catalog:context7:remote", context7.Installation.CatalogDigest)
	})
}

func TestMarketplaceLoadsOfficialRegistrySource(t *testing.T) {
	service := newMarketplaceServiceWithRegistry(t, http.StatusOK, officialRegistryFixture())

	resp, err := service.MarketplaceWithQuery(context.Background(), MarketplaceQuery{
		LoadSources: true,
		Limit:       20,
	})
	require.NoError(t, err)

	official := requireMarketplaceSource(t, resp, "official-registry")
	require.Equal(t, "loaded", official.Status)
	require.Equal(t, 3, official.ServerCount)
	require.NotEmpty(t, official.LoadedAt)
	require.Empty(t, official.Error)

	alpha := requireMarketplaceEntry(t, resp, "example.com/alpha")
	require.Equal(t, "Alpha Docs", alpha.DisplayName)
	require.Equal(t, types.DashboardMarketplaceInstallable, alpha.InstallStatus)
	require.Equal(t, string(types.TransportStreamableHTTP), alpha.Transport)
	require.NotNil(t, alpha.Install)
	require.Equal(t, "https://alpha.example/mcp", alpha.Install.URL)
	require.Empty(t, alpha.Install.Headers)
	require.Empty(t, alpha.Install.RequiredHeaderKeys)
	require.NotEmpty(t, alpha.Digest)

	bravo := requireMarketplaceEntry(t, resp, "example.com/bravo")
	require.Equal(t, types.DashboardMarketplaceReviewRequired, bravo.InstallStatus)
	require.NotNil(t, bravo.Install)
	require.Equal(t, []string{"Authorization"}, bravo.Install.RequiredHeaderKeys)
	require.Equal(t, map[string]string{"Authorization": ""}, bravo.Install.Headers)
	require.Contains(t, bravo.ReviewReasons, "Remote registry entry requires caller-supplied header values before registration.")

	charlie := requireMarketplaceEntry(t, resp, "example.com/charlie")
	require.Equal(t, types.DashboardMarketplaceReviewRequired, charlie.InstallStatus)
	require.Equal(t, string(types.TransportStdio), charlie.Transport)
	require.NotNil(t, charlie.Install)
	require.Equal(t, "npx", charlie.Install.Command)
	require.Equal(t, []string{"-y", "@example/charlie-mcp@0.5.0"}, charlie.Install.Args)
	require.Contains(t, charlie.PackageURL, "npmjs.com/package/")

	requireMarketplaceEntryMissing(t, resp, "example.com/old")
	body, err := json.Marshal(resp)
	require.NoError(t, err)
	require.NotContains(t, string(body), "secret-value")
	require.NotContains(t, string(body), "Bearer ")
}

func TestMarketplaceSourceFailureKeepsLocalCatalog(t *testing.T) {
	service := newMarketplaceServiceWithRegistry(t, http.StatusInternalServerError, `{"error":"down"}`)

	resp, err := service.MarketplaceWithQuery(context.Background(), MarketplaceQuery{
		LoadSources: true,
		Limit:       20,
	})
	require.NoError(t, err)

	official := requireMarketplaceSource(t, resp, "official-registry")
	require.Equal(t, "error", official.Status)
	require.Contains(t, official.Error, "official registry")
	requireMarketplaceEntry(t, resp, "context7")
}

func TestMarketplaceQueryFiltersSourceBackedEntries(t *testing.T) {
	service := newMarketplaceServiceWithRegistry(t, http.StatusOK, officialRegistryFixture())

	resp, err := service.MarketplaceWithQuery(context.Background(), MarketplaceQuery{
		LoadSources: true,
		Search:      "bravo",
		SourceID:    "official-registry",
		Transport:   string(types.TransportStreamableHTTP),
		Limit:       20,
	})
	require.NoError(t, err)
	require.Len(t, resp.Servers, 1)
	require.Equal(t, "example.com/bravo", resp.Servers[0].ID)
	require.Equal(t, "bravo", resp.Query.Search)
	require.Equal(t, 1, resp.Pagination.Total)
}

func TestMarketplaceRegistrationUsesSourceIdentity(t *testing.T) {
	service := newMarketplaceServiceWithRegistry(t, http.StatusOK, officialRegistryFixture())
	input := &types.RegisterServerInput{
		Name:        "example-com-alpha",
		Description: "Alpha docs remote",
		Transport:   string(types.TransportStreamableHTTP),
		URL:         "https://alpha.example/mcp",
	}

	require.NoError(t, service.ValidateMarketplaceRegistration(
		context.Background(),
		"official-registry",
		"example.com/alpha",
		input,
	))

	err := service.ValidateMarketplaceRegistration(
		context.Background(),
		"smithery",
		"example.com/alpha",
		input,
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "marketplace entry")
}

func newMarketplaceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.McpServer{}, &model.McpServerRegistrationSource{}))
	return db
}

func newMarketplaceServiceWithRegistry(t *testing.T, status int, body string) *Service {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v0/servers", r.URL.Path)
		require.NotEmpty(t, r.URL.Query().Get("limit"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, err := w.Write([]byte(body))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	service := NewService(nil, false)
	service.marketplaceRegistryURL = server.URL + "/v0/servers"
	service.marketplaceHTTPClient = server.Client()
	service.marketplaceAllowInsecureRegistry = true
	service.marketplaceCacheTTL = time.Hour
	return service
}

func officialRegistryFixture() string {
	return `{
		"servers": [
			{
				"server": {
					"$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
					"name": "example.com/alpha",
					"description": "Alpha docs remote",
					"title": "Alpha Docs",
					"version": "1.2.3",
					"websiteUrl": "https://alpha.example/docs",
					"repository": {"url": "https://github.com/example/alpha", "source": "github"},
					"remotes": [{"type": "streamable-http", "url": "https://alpha.example/mcp"}]
				},
				"_meta": {"io.modelcontextprotocol.registry/official": {"status": "active", "isLatest": true}}
			},
			{
				"server": {
					"name": "example.com/old",
					"description": "Old remote",
					"title": "Old Remote",
					"version": "0.1.0",
					"remotes": [{"type": "streamable-http", "url": "https://old.example/mcp"}]
				},
				"_meta": {"io.modelcontextprotocol.registry/official": {"status": "active", "isLatest": false}}
			},
			{
				"server": {
					"name": "example.com/bravo",
					"description": "Bravo token remote",
					"title": "Bravo",
					"version": "2.0.0",
					"remotes": [{
						"type": "streamable-http",
						"url": "https://bravo.example/mcp",
						"headers": [{"name": "Authorization", "isRequired": true, "isSecret": true, "value": "Bearer secret-value"}]
					}]
				},
				"_meta": {"io.modelcontextprotocol.registry/official": {"status": "active", "isLatest": true}}
			},
			{
				"server": {
					"name": "example.com/charlie",
					"description": "Charlie npm package",
					"title": "Charlie",
					"version": "0.5.0",
					"repository": {"url": "https://github.com/example/charlie", "source": "github"},
					"packages": [{"registryType": "npm", "identifier": "@example/charlie-mcp", "version": "0.5.0", "transport": {"type": "stdio"}}]
				},
				"_meta": {"io.modelcontextprotocol.registry/official": {"status": "active", "isLatest": true}}
			}
		],
		"metadata": {"nextCursor": "example.com/charlie:0.5.0", "count": 4}
	}`
}

func requireMarketplaceSource(t *testing.T, resp *types.DashboardMarketplaceResponse, id string) types.DashboardMarketplaceSource {
	t.Helper()
	for _, source := range resp.Sources {
		if source.ID == id {
			return source
		}
	}
	t.Fatalf("marketplace source %q not found", id)
	return types.DashboardMarketplaceSource{}
}

func requireMarketplaceEntry(t *testing.T, resp *types.DashboardMarketplaceResponse, id string) types.DashboardMarketplaceServer {
	t.Helper()
	for _, server := range resp.Servers {
		if server.ID == id {
			return server
		}
	}
	t.Fatalf("marketplace entry %q not found", id)
	return types.DashboardMarketplaceServer{}
}

func requireMarketplaceEntryMissing(t *testing.T, resp *types.DashboardMarketplaceResponse, id string) {
	t.Helper()
	for _, server := range resp.Servers {
		if server.ID == id {
			t.Fatalf("marketplace entry %q should not be present", id)
		}
	}
}
