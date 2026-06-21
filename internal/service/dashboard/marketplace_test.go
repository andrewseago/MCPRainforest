package dashboard

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
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
