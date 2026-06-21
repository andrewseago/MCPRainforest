package dashboard

import (
	"encoding/json"
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

func newMarketplaceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.McpServer{}, &model.McpServerRegistrationSource{}))
	return db
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
