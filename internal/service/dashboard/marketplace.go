package dashboard

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/mcpjungle/mcpjungle/internal/model"
	"github.com/mcpjungle/mcpjungle/pkg/apierrors"
	"github.com/mcpjungle/mcpjungle/pkg/types"
	"gorm.io/gorm/clause"
)

const (
	defaultMarketplaceLimit        = 100
	maxMarketplaceLimit            = 250
	marketplaceRegistryFetchLimit  = 100
	maxMarketplaceRegistryBodySize = 1 << 20
)

type MarketplaceQuery struct {
	Search        string
	SourceID      string
	Transport     string
	InstallStatus string
	UpdateState   string
	Limit         int
	Cursor        string
	LoadSources   bool
}

type marketplaceSourceCache struct {
	fetchedAt time.Time
	servers   []types.DashboardMarketplaceServer
}

// Marketplace returns a curated, dry-run catalog for the dashboard. Entries are
// registration drafts only; callers must still review and submit through the
// existing server registration path.
func (s *Service) Marketplace() (*types.DashboardMarketplaceResponse, error) {
	return s.MarketplaceWithQuery(context.Background(), MarketplaceQuery{})
}

// MarketplaceWithQuery returns the dashboard marketplace catalog. When
// LoadSources is true it refreshes configured live sources and merges them with
// the curated local catalog; source failures are reported in source metadata
// without failing the whole response.
func (s *Service) MarketplaceWithQuery(ctx context.Context, query MarketplaceQuery) (*types.DashboardMarketplaceResponse, error) {
	query = normalizeMarketplaceQuery(query)
	sources := marketplaceSources()
	servers := marketplaceServers()

	sourceCounts := countMarketplaceServersBySource(servers)
	if query.LoadSources {
		loadedServers, fetchedAt, err := s.loadOfficialRegistryMarketplace(ctx)
		if err != nil {
			markMarketplaceSourceError(sources, "official-registry", fmt.Sprintf("official registry refresh failed: %v", err), sourceCounts["official-registry"])
		} else {
			servers = mergeMarketplaceServers(servers, loadedServers)
			sourceCounts["official-registry"] = len(loadedServers)
			markMarketplaceSourceLoaded(sources, "official-registry", len(loadedServers), fetchedAt)
		}
		markMarketplaceSourceMetadataOnly(sources, sourceCounts)
	} else {
		markMarketplaceSourceLocal(sources, sourceCounts)
	}

	resp := &types.DashboardMarketplaceResponse{
		Sources: sources,
		Query: types.DashboardMarketplaceQuery{
			Search:        query.Search,
			SourceID:      query.SourceID,
			Transport:     query.Transport,
			InstallStatus: query.InstallStatus,
			UpdateState:   query.UpdateState,
			Limit:         query.Limit,
			Cursor:        query.Cursor,
		},
	}

	installed, err := s.installedMarketplaceServers()
	if err != nil {
		return nil, err
	}
	for index := range servers {
		annotateMarketplaceInstallation(&servers[index], installed)
	}

	sourceByID := mapMarketplaceSourcesByID(resp.Sources)
	filtered := filterMarketplaceServers(servers, query, sourceByID)
	total := len(filtered)
	resp.Servers = paginateMarketplaceServers(filtered, query)
	resp.Pagination = types.DashboardMarketplacePage{
		Limit:      query.Limit,
		NextCursor: nextMarketplaceCursor(query, total),
		Total:      total,
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

func normalizeMarketplaceQuery(query MarketplaceQuery) MarketplaceQuery {
	query.Search = strings.TrimSpace(query.Search)
	query.SourceID = strings.TrimSpace(query.SourceID)
	query.Transport = strings.TrimSpace(query.Transport)
	query.InstallStatus = strings.TrimSpace(query.InstallStatus)
	query.UpdateState = strings.TrimSpace(query.UpdateState)
	query.Cursor = strings.TrimSpace(query.Cursor)
	if query.Limit <= 0 {
		query.Limit = defaultMarketplaceLimit
	}
	if query.Limit > maxMarketplaceLimit {
		query.Limit = maxMarketplaceLimit
	}
	return query
}

func countMarketplaceServersBySource(servers []types.DashboardMarketplaceServer) map[string]int {
	counts := map[string]int{}
	for _, server := range servers {
		counts[server.SourceID]++
	}
	return counts
}

func mapMarketplaceSourcesByID(sources []types.DashboardMarketplaceSource) map[string]types.DashboardMarketplaceSource {
	byID := map[string]types.DashboardMarketplaceSource{}
	for _, source := range sources {
		byID[source.ID] = source
	}
	return byID
}

func markMarketplaceSourceLoaded(sources []types.DashboardMarketplaceSource, sourceID string, count int, fetchedAt time.Time) {
	for index := range sources {
		if sources[index].ID != sourceID {
			continue
		}
		sources[index].Status = "loaded"
		sources[index].ServerCount = count
		sources[index].LoadedAt = formatTime(fetchedAt)
		sources[index].Error = ""
		sources[index].Searchable = true
	}
}

func markMarketplaceSourceError(sources []types.DashboardMarketplaceSource, sourceID string, message string, count int) {
	for index := range sources {
		if sources[index].ID != sourceID {
			continue
		}
		sources[index].Status = "error"
		sources[index].ServerCount = count
		sources[index].Error = message
		sources[index].Searchable = true
	}
}

func markMarketplaceSourceMetadataOnly(sources []types.DashboardMarketplaceSource, counts map[string]int) {
	for index := range sources {
		if sources[index].Status != "" {
			continue
		}
		sources[index].Status = "metadata_only"
		sources[index].ServerCount = counts[sources[index].ID]
		sources[index].Searchable = false
	}
}

func markMarketplaceSourceLocal(sources []types.DashboardMarketplaceSource, counts map[string]int) {
	for index := range sources {
		sources[index].Status = "local"
		sources[index].ServerCount = counts[sources[index].ID]
		sources[index].Searchable = true
	}
}

func mergeMarketplaceServers(local, loaded []types.DashboardMarketplaceServer) []types.DashboardMarketplaceServer {
	merged := make([]types.DashboardMarketplaceServer, 0, len(local)+len(loaded))
	seen := map[string]bool{}
	for _, entry := range local {
		key := marketplaceEntryKey(entry.SourceID, entry.ID)
		seen[key] = true
		merged = append(merged, entry)
	}
	for _, entry := range loaded {
		key := marketplaceEntryKey(entry.SourceID, entry.ID)
		if seen[key] {
			continue
		}
		seen[key] = true
		merged = append(merged, entry)
	}
	sortMarketplaceServers(merged)
	return merged
}

func marketplaceEntryKey(sourceID, entryID string) string {
	return sourceID + "\x00" + entryID
}

func filterMarketplaceServers(
	servers []types.DashboardMarketplaceServer,
	query MarketplaceQuery,
	sourceByID map[string]types.DashboardMarketplaceSource,
) []types.DashboardMarketplaceServer {
	filtered := make([]types.DashboardMarketplaceServer, 0, len(servers))
	search := strings.ToLower(query.Search)
	for _, entry := range servers {
		if query.SourceID != "" && entry.SourceID != query.SourceID {
			continue
		}
		if query.Transport != "" && entry.Transport != query.Transport {
			continue
		}
		if query.InstallStatus != "" && string(entry.InstallStatus) != query.InstallStatus {
			continue
		}
		if query.UpdateState != "" && string(entry.UpdateState) != query.UpdateState {
			continue
		}
		if search != "" && !marketplaceEntryMatchesSearch(entry, sourceByID[entry.SourceID], search) {
			continue
		}
		filtered = append(filtered, entry)
	}
	sortMarketplaceServers(filtered)
	return filtered
}

func marketplaceEntryMatchesSearch(entry types.DashboardMarketplaceServer, source types.DashboardMarketplaceSource, search string) bool {
	values := []string{
		entry.ID,
		entry.Name,
		entry.DisplayName,
		entry.Description,
		entry.Publisher,
		entry.Category,
		entry.Transport,
		entry.AuthType,
		entry.HomepageURL,
		entry.PackageURL,
		source.Name,
		source.Description,
		source.TrustLevel,
	}
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), search) {
			return true
		}
	}
	for _, tag := range entry.Tags {
		if strings.Contains(strings.ToLower(tag), search) {
			return true
		}
	}
	return false
}

func paginateMarketplaceServers(servers []types.DashboardMarketplaceServer, query MarketplaceQuery) []types.DashboardMarketplaceServer {
	offset := marketplaceCursorOffset(query.Cursor)
	if offset >= len(servers) {
		return []types.DashboardMarketplaceServer{}
	}
	end := offset + query.Limit
	if end > len(servers) {
		end = len(servers)
	}
	return servers[offset:end]
}

func nextMarketplaceCursor(query MarketplaceQuery, total int) string {
	next := marketplaceCursorOffset(query.Cursor) + query.Limit
	if next >= total {
		return ""
	}
	return strconv.Itoa(next)
}

func marketplaceCursorOffset(cursor string) int {
	if cursor == "" {
		return 0
	}
	offset, err := strconv.Atoi(cursor)
	if err != nil || offset < 0 {
		return 0
	}
	return offset
}

type installedMarketplaceServer struct {
	Server model.McpServer
	Source *model.McpServerRegistrationSource
}

func (s *Service) installedMarketplaceServers() (map[string]installedMarketplaceServer, error) {
	installed := map[string]installedMarketplaceServer{}
	if s == nil || s.db == nil {
		return installed, nil
	}

	var servers []model.McpServer
	if err := s.db.Find(&servers).Error; err != nil {
		return nil, err
	}
	var sources []model.McpServerRegistrationSource
	if err := s.db.
		Where("source_type = ?", model.McpServerRegistrationSourceMarketplace).
		Find(&sources).Error; err != nil {
		return nil, err
	}
	sourceByServer := map[string]*model.McpServerRegistrationSource{}
	for index := range sources {
		sourceByServer[sources[index].ServerName] = &sources[index]
	}
	for _, server := range servers {
		installed[server.Name] = installedMarketplaceServer{
			Server: server,
			Source: sourceByServer[server.Name],
		}
	}
	return installed, nil
}

func annotateMarketplaceInstallation(entry *types.DashboardMarketplaceServer, installed map[string]installedMarketplaceServer) {
	entry.UpdateState = types.DashboardMarketplaceUpdateNotInstalled
	installedServer, ok := installed[entry.Name]
	if !ok {
		return
	}

	entry.Installed = true
	entry.InstalledServerName = installedServer.Server.Name
	if installedServer.Source == nil ||
		installedServer.Source.EntryID != entry.ID ||
		installedServer.Source.SourceID != entry.SourceID {
		entry.UpdateState = types.DashboardMarketplaceUpdateUnknown
		return
	}

	entry.Installation = marketplaceInstallation(entry, installedServer.Source)
	if marketplaceCatalogChanged(entry, installedServer.Source) {
		entry.UpdateState = types.DashboardMarketplaceUpdateAvailable
		return
	}
	if !marketplaceServerMatchesInstall(installedServer.Server, entry.Install) {
		entry.UpdateState = types.DashboardMarketplaceUpdateLocalChanges
		return
	}
	entry.UpdateState = types.DashboardMarketplaceUpdateCurrent
}

func marketplaceInstallation(entry *types.DashboardMarketplaceServer, source *model.McpServerRegistrationSource) *types.DashboardMarketplaceInstallation {
	return &types.DashboardMarketplaceInstallation{
		ServerName:       source.ServerName,
		EntryID:          source.EntryID,
		SourceID:         source.SourceID,
		InstalledVersion: source.InstalledVersion,
		InstalledDigest:  source.InstalledDigest,
		CatalogVersion:   entry.Version,
		CatalogDigest:    entry.Digest,
		InstalledAt:      formatTime(source.InstalledAt),
	}
}

func marketplaceCatalogChanged(entry *types.DashboardMarketplaceServer, source *model.McpServerRegistrationSource) bool {
	if entry.Digest != "" || source.InstalledDigest != "" {
		return entry.Digest != source.InstalledDigest
	}
	if entry.Version != "" || source.InstalledVersion != "" {
		return entry.Version != source.InstalledVersion
	}
	return false
}

func marketplaceServerMatchesInstall(server model.McpServer, install *types.DashboardMarketplaceInstall) bool {
	if install == nil {
		return false
	}
	if string(server.Transport) != install.Transport {
		return false
	}
	if install.SessionMode != "" && string(server.SessionMode) != install.SessionMode {
		return false
	}

	switch server.Transport {
	case types.TransportStreamableHTTP:
		config, err := server.GetStreamableHTTPConfig()
		return err == nil && config.URL == install.URL && mapKeysEqual(config.Headers, install.Headers)
	case types.TransportSSE:
		config, err := server.GetSSEConfig()
		return err == nil && config.URL == install.URL
	case types.TransportStdio:
		config, err := server.GetStdioConfig()
		return err == nil &&
			config.Command == install.Command &&
			reflect.DeepEqual(config.Args, install.Args) &&
			mapKeysEqual(config.Env, install.Env)
	default:
		return false
	}
}

func mapKeysEqual(left, right map[string]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func mapKeysContain(left, right map[string]string) bool {
	for key := range right {
		if _, ok := left[key]; !ok {
			return false
		}
	}
	return true
}

type officialRegistryResponse struct {
	Servers  []officialRegistryRecord `json:"servers"`
	Metadata struct {
		NextCursor string `json:"nextCursor"`
		Count      int    `json:"count"`
	} `json:"metadata"`
}

type officialRegistryRecord struct {
	Server officialRegistryServer       `json:"server"`
	Meta   officialRegistryMetaEnvelope `json:"_meta"`
}

type officialRegistryMetaEnvelope struct {
	Official officialRegistryOfficialMeta `json:"io.modelcontextprotocol.registry/official"`
}

type officialRegistryOfficialMeta struct {
	Status   string `json:"status"`
	IsLatest bool   `json:"isLatest"`
}

type officialRegistryServer struct {
	Name        string                    `json:"name"`
	Title       string                    `json:"title"`
	Description string                    `json:"description"`
	Version     string                    `json:"version"`
	WebsiteURL  string                    `json:"websiteUrl"`
	Repository  officialRegistryRepo      `json:"repository"`
	Remotes     []officialRegistryRemote  `json:"remotes"`
	Packages    []officialRegistryPackage `json:"packages"`
}

type officialRegistryRepo struct {
	URL    string `json:"url"`
	Source string `json:"source"`
}

type officialRegistryRemote struct {
	Type    string                   `json:"type"`
	URL     string                   `json:"url"`
	Headers []officialRegistryHeader `json:"headers"`
}

type officialRegistryHeader struct {
	Name       string `json:"name"`
	IsRequired bool   `json:"isRequired"`
	IsSecret   bool   `json:"isSecret"`
}

type officialRegistryPackage struct {
	RegistryType string                           `json:"registryType"`
	Identifier   string                           `json:"identifier"`
	Version      string                           `json:"version"`
	Transport    officialRegistryPackageTransport `json:"transport"`
}

type officialRegistryPackageTransport struct {
	Type string `json:"type"`
}

func (s *Service) loadOfficialRegistryMarketplace(ctx context.Context) ([]types.DashboardMarketplaceServer, time.Time, error) {
	if s == nil {
		return nil, time.Time{}, fmt.Errorf("dashboard service is unavailable")
	}
	if s.marketplaceHTTPClient == nil {
		s.marketplaceHTTPClient = &http.Client{Timeout: 8 * time.Second}
	}
	if s.marketplaceCacheTTL <= 0 {
		s.marketplaceCacheTTL = 10 * time.Minute
	}

	now := time.Now().UTC()
	s.marketplaceCacheMu.Lock()
	if !s.marketplaceCache.fetchedAt.IsZero() && now.Sub(s.marketplaceCache.fetchedAt) < s.marketplaceCacheTTL {
		cached := cloneMarketplaceServers(s.marketplaceCache.servers)
		fetchedAt := s.marketplaceCache.fetchedAt
		s.marketplaceCacheMu.Unlock()
		return cached, fetchedAt, nil
	}
	s.marketplaceCacheMu.Unlock()

	registryURL, err := s.officialRegistryURL()
	if err != nil {
		return nil, time.Time{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, registryURL, nil)
	if err != nil {
		return nil, time.Time{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "MCPRainforest marketplace")

	resp, err := s.marketplaceHTTPClient.Do(req)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, time.Time{}, fmt.Errorf("official registry returned %s", resp.Status)
	}

	var payload officialRegistryResponse
	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxMarketplaceRegistryBodySize))
	if err := decoder.Decode(&payload); err != nil {
		return nil, time.Time{}, fmt.Errorf("decode official registry response: %w", err)
	}
	servers := normalizeOfficialRegistryServers(payload.Servers)
	fetchedAt := time.Now().UTC()

	s.marketplaceCacheMu.Lock()
	s.marketplaceCache = marketplaceSourceCache{
		fetchedAt: fetchedAt,
		servers:   cloneMarketplaceServers(servers),
	}
	s.marketplaceCacheMu.Unlock()

	return servers, fetchedAt, nil
}

func (s *Service) officialRegistryURL() (string, error) {
	rawURL := strings.TrimSpace(s.marketplaceRegistryURL)
	if rawURL == "" {
		rawURL = "https://registry.modelcontextprotocol.io/v0/servers"
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("parse official registry URL: %w", err)
	}
	if parsed.Scheme != "https" && !(s.marketplaceAllowInsecureRegistry && parsed.Scheme == "http") {
		return "", fmt.Errorf("official registry URL must use https")
	}
	if !s.marketplaceAllowInsecureRegistry && parsed.Host != "registry.modelcontextprotocol.io" {
		return "", fmt.Errorf("official registry host is not allowlisted")
	}
	values := parsed.Query()
	if values.Get("limit") == "" {
		values.Set("limit", strconv.Itoa(marketplaceRegistryFetchLimit))
	}
	parsed.RawQuery = values.Encode()
	parsed.Fragment = ""
	parsed.User = nil
	return parsed.String(), nil
}

func cloneMarketplaceServers(servers []types.DashboardMarketplaceServer) []types.DashboardMarketplaceServer {
	cloned := make([]types.DashboardMarketplaceServer, len(servers))
	copy(cloned, servers)
	return cloned
}

func normalizeOfficialRegistryServers(records []officialRegistryRecord) []types.DashboardMarketplaceServer {
	servers := make([]types.DashboardMarketplaceServer, 0, len(records))
	for _, record := range records {
		if record.Meta.Official.Status != "" && record.Meta.Official.Status != "active" {
			continue
		}
		if !record.Meta.Official.IsLatest {
			continue
		}
		entry, ok := normalizeOfficialRegistryServer(record)
		if !ok {
			continue
		}
		servers = append(servers, entry)
	}
	sortMarketplaceServers(servers)
	return servers
}

func normalizeOfficialRegistryServer(record officialRegistryRecord) (types.DashboardMarketplaceServer, bool) {
	manifest := record.Server
	if strings.TrimSpace(manifest.Name) == "" {
		return types.DashboardMarketplaceServer{}, false
	}

	entry := types.DashboardMarketplaceServer{
		ID:            manifest.Name,
		Name:          marketplaceInstallName(manifest.Name),
		DisplayName:   marketplaceDisplayTitle(manifest),
		Description:   strings.TrimSpace(manifest.Description),
		SourceID:      "official-registry",
		Publisher:     marketplacePublisher(manifest),
		Version:       strings.TrimSpace(manifest.Version),
		Digest:        officialRegistryDigest(manifest),
		Category:      "Registry",
		Tags:          []string{"official-registry"},
		AuthType:      "none",
		HomepageURL:   strings.TrimSpace(manifest.WebsiteURL),
		PackageURL:    strings.TrimSpace(manifest.Repository.URL),
		InstallStatus: types.DashboardMarketplaceExternal,
		SecurityNotes: []string{
			"Imported from the official MCP Registry as discovery metadata.",
			"No catalog-supplied secret values are imported.",
		},
	}
	if entry.Description == "" {
		entry.Description = "Official MCP Registry entry."
	}

	if remote, ok := firstSupportedRegistryRemote(manifest.Remotes); ok {
		applyRegistryRemoteInstall(&entry, remote)
		return entry, true
	}
	if pkg, ok := firstSupportedRegistryPackage(manifest.Packages); ok {
		applyRegistryPackageInstall(&entry, pkg)
		return entry, true
	}

	entry.ReviewReasons = []string{"No supported MCP transport or install package was declared by the registry entry."}
	entry.SecurityNotes = append(entry.SecurityNotes, "Register this server manually after reviewing upstream setup documentation.")
	return entry, true
}

func firstSupportedRegistryRemote(remotes []officialRegistryRemote) (officialRegistryRemote, bool) {
	for _, remote := range remotes {
		if registryRemoteTransport(remote.Type) == "" {
			continue
		}
		if !isHTTPSURL(remote.URL) {
			continue
		}
		return remote, true
	}
	return officialRegistryRemote{}, false
}

func firstSupportedRegistryPackage(packages []officialRegistryPackage) (officialRegistryPackage, bool) {
	for _, pkg := range packages {
		if registryPackageTransport(pkg.Transport.Type) == "" || strings.TrimSpace(pkg.Identifier) == "" {
			continue
		}
		return pkg, true
	}
	return officialRegistryPackage{}, false
}

func applyRegistryRemoteInstall(entry *types.DashboardMarketplaceServer, remote officialRegistryRemote) {
	transport := registryRemoteTransport(remote.Type)
	requiredHeaders := registryRequiredHeaderKeys(remote.Headers)
	entry.Transport = transport
	entry.PackageURL = firstNonEmpty(entry.PackageURL, remote.URL)
	entry.Tags = append(entry.Tags, "remote", transport)
	entry.Install = &types.DashboardMarketplaceInstall{
		Name:               entry.Name,
		Description:        entry.Description,
		Transport:          transport,
		SessionMode:        string(types.SessionModeStateless),
		URL:                remote.URL,
		Headers:            emptyValueMap(requiredHeaders),
		RequiredHeaderKeys: requiredHeaders,
	}
	if len(requiredHeaders) > 0 {
		entry.AuthType = "headers"
		entry.InstallStatus = types.DashboardMarketplaceReviewRequired
		entry.ReviewReasons = []string{"Remote registry entry requires caller-supplied header values before registration."}
		entry.SecurityNotes = append(entry.SecurityNotes, "Required header names are shown, but secret values must be supplied locally.")
		return
	}
	entry.InstallStatus = types.DashboardMarketplaceInstallable
	entry.ReviewReasons = []string{"Remote HTTPS endpoint with no registry-declared secret requirements."}
}

func applyRegistryPackageInstall(entry *types.DashboardMarketplaceServer, pkg officialRegistryPackage) {
	transport := registryPackageTransport(pkg.Transport.Type)
	entry.Transport = transport
	entry.AuthType = "none"
	entry.Tags = append(entry.Tags, strings.ToLower(pkg.RegistryType), transport, "package")
	entry.PackageURL = firstNonEmpty(registryPackageURL(pkg), entry.PackageURL)
	entry.InstallStatus = types.DashboardMarketplaceReviewRequired
	entry.ReviewReasons = []string{
		"Package registry entries run a local process on the MCPRainforest host.",
		"Review package provenance and command arguments before registration.",
	}
	entry.Install = &types.DashboardMarketplaceInstall{
		Name:        entry.Name,
		Description: entry.Description,
		Transport:   transport,
		SessionMode: string(types.SessionModeStateless),
	}
	switch strings.ToLower(pkg.RegistryType) {
	case "npm":
		entry.Install.Command = "npx"
		entry.Install.Args = []string{"-y", registryPackageIdentifierWithVersion(pkg)}
	case "pypi":
		entry.Install.Command = "uvx"
		entry.Install.Args = []string{registryPackageIdentifierWithVersion(pkg)}
	default:
		entry.Install = nil
		entry.InstallStatus = types.DashboardMarketplaceExternal
		entry.ReviewReasons = []string{"Unsupported package registry; register manually after reviewing upstream documentation."}
	}
}

func registryRemoteTransport(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "streamable-http", "streamable_http":
		return string(types.TransportStreamableHTTP)
	case "sse":
		return string(types.TransportSSE)
	default:
		return ""
	}
}

func registryPackageTransport(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "stdio":
		return string(types.TransportStdio)
	default:
		return ""
	}
}

func registryRequiredHeaderKeys(headers []officialRegistryHeader) []string {
	keys := []string{}
	seen := map[string]bool{}
	for _, header := range headers {
		name := strings.TrimSpace(header.Name)
		if name == "" || seen[name] {
			continue
		}
		if header.IsRequired || header.IsSecret {
			keys = append(keys, name)
			seen[name] = true
		}
	}
	sort.Strings(keys)
	return keys
}

func emptyValueMap(keys []string) map[string]string {
	if len(keys) == 0 {
		return nil
	}
	values := make(map[string]string, len(keys))
	for _, key := range keys {
		values[key] = ""
	}
	return values
}

func isHTTPSURL(rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func officialRegistryDigest(manifest officialRegistryServer) string {
	body, err := json.Marshal(manifest)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(body)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func marketplaceDisplayTitle(manifest officialRegistryServer) string {
	if strings.TrimSpace(manifest.Title) != "" {
		return strings.TrimSpace(manifest.Title)
	}
	name := strings.TrimSpace(manifest.Name)
	if index := strings.LastIndex(name, "/"); index >= 0 && index < len(name)-1 {
		return name[index+1:]
	}
	return name
}

func marketplacePublisher(manifest officialRegistryServer) string {
	if manifest.Repository.Source != "" {
		return strings.TrimSpace(manifest.Repository.Source)
	}
	name := strings.TrimSpace(manifest.Name)
	if index := strings.Index(name, "/"); index > 0 {
		return name[:index]
	}
	return ""
}

func marketplaceInstallName(name string) string {
	var builder strings.Builder
	lastDash := false
	for _, value := range strings.ToLower(strings.TrimSpace(name)) {
		if unicode.IsLetter(value) || unicode.IsDigit(value) || value == '_' {
			builder.WriteRune(value)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	output := strings.Trim(builder.String(), "-")
	if output == "" {
		return "marketplace-server"
	}
	return output
}

func registryPackageIdentifierWithVersion(pkg officialRegistryPackage) string {
	identifier := strings.TrimSpace(pkg.Identifier)
	version := strings.TrimSpace(pkg.Version)
	if version == "" {
		return identifier
	}
	switch strings.ToLower(pkg.RegistryType) {
	case "pypi":
		return identifier + "==" + version
	default:
		return identifier + "@" + version
	}
}

func registryPackageURL(pkg officialRegistryPackage) string {
	switch strings.ToLower(pkg.RegistryType) {
	case "npm":
		return "https://www.npmjs.com/package/" + url.PathEscape(pkg.Identifier)
	case "pypi":
		return "https://pypi.org/project/" + url.PathEscape(pkg.Identifier) + "/"
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (s *Service) ValidateMarketplaceRegistration(ctx context.Context, sourceID, entryID string, input *types.RegisterServerInput) error {
	if entryID == "" {
		return nil
	}
	entry, ok, err := s.marketplaceEntry(ctx, sourceID, entryID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("marketplace entry %q was not found: %w", entryID, apierrors.ErrInvalidInput)
	}
	if entry.Install == nil {
		return fmt.Errorf("marketplace entry %q cannot be registered from a catalog draft: %w", entryID, apierrors.ErrInvalidInput)
	}
	if input.Name != entry.Install.Name {
		return fmt.Errorf("marketplace entry %q must be registered as %q: %w", entryID, entry.Install.Name, apierrors.ErrInvalidInput)
	}
	if input.Transport != entry.Install.Transport {
		return fmt.Errorf("marketplace entry %q must use %s transport: %w", entryID, entry.Install.Transport, apierrors.ErrInvalidInput)
	}
	switch entry.Install.Transport {
	case string(types.TransportStreamableHTTP), string(types.TransportSSE):
		if input.URL != entry.Install.URL {
			return fmt.Errorf("marketplace entry %q must use catalog URL %q: %w", entryID, entry.Install.URL, apierrors.ErrInvalidInput)
		}
		if !mapKeysContain(input.Headers, entry.Install.Headers) {
			return fmt.Errorf("marketplace entry %q is missing required header keys: %w", entryID, apierrors.ErrInvalidInput)
		}
	case string(types.TransportStdio):
		if input.Command != entry.Install.Command || !reflect.DeepEqual(input.Args, entry.Install.Args) {
			return fmt.Errorf("marketplace entry %q must use the catalog command draft: %w", entryID, apierrors.ErrInvalidInput)
		}
		if !mapKeysContain(input.Env, entry.Install.Env) {
			return fmt.Errorf("marketplace entry %q is missing required env keys: %w", entryID, apierrors.ErrInvalidInput)
		}
	}
	return nil
}

func (s *Service) RecordMarketplaceInstallation(ctx context.Context, serverName, sourceID, entryID string) error {
	if entryID == "" || s == nil || s.db == nil {
		return nil
	}
	entry, ok, err := s.marketplaceEntry(ctx, sourceID, entryID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("marketplace entry %q was not found: %w", entryID, apierrors.ErrInvalidInput)
	}
	if entry.Install == nil {
		return fmt.Errorf("marketplace entry %q cannot be registered from a catalog draft: %w", entryID, apierrors.ErrInvalidInput)
	}

	draft, err := json.Marshal(entry.Install)
	if err != nil {
		return fmt.Errorf("failed to serialize marketplace install draft: %w", err)
	}
	sourceURL := marketplaceSourceURL(entry.SourceID)
	now := time.Now().UTC()
	record := model.McpServerRegistrationSource{
		ServerName:          serverName,
		SourceType:          model.McpServerRegistrationSourceMarketplace,
		SourceID:            entry.SourceID,
		SourceURL:           sourceURL,
		EntryID:             entry.ID,
		Publisher:           entry.Publisher,
		InstalledVersion:    entry.Version,
		InstalledDigest:     entry.Digest,
		InstalledAt:         now,
		CatalogInstallDraft: draft,
	}
	return s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "server_name"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"source_type",
			"source_id",
			"source_url",
			"entry_id",
			"publisher",
			"installed_version",
			"installed_digest",
			"installed_at",
			"catalog_install_draft",
			"updated_at",
		}),
	}).Create(&record).Error
}

func (s *Service) marketplaceEntry(ctx context.Context, sourceID, entryID string) (types.DashboardMarketplaceServer, bool, error) {
	resp, err := s.MarketplaceWithQuery(ctx, MarketplaceQuery{LoadSources: true, Limit: maxMarketplaceLimit})
	if err != nil {
		return types.DashboardMarketplaceServer{}, false, err
	}
	var match *types.DashboardMarketplaceServer
	for index := range resp.Servers {
		entry := resp.Servers[index]
		if entry.ID != entryID {
			continue
		}
		if sourceID != "" && entry.SourceID != sourceID {
			continue
		}
		if match != nil {
			return types.DashboardMarketplaceServer{}, false, fmt.Errorf("marketplace entry %q exists in multiple sources; provide marketplace_source_id: %w", entryID, apierrors.ErrInvalidInput)
		}
		match = &entry
	}
	if match == nil {
		return types.DashboardMarketplaceServer{}, false, nil
	}
	return *match, true, nil
}

func marketplaceSourceURL(sourceID string) string {
	for _, source := range marketplaceSources() {
		if source.ID == sourceID {
			return source.URL
		}
	}
	return ""
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

	sortMarketplaceServers(servers)
	return servers
}

func sortMarketplaceServers(servers []types.DashboardMarketplaceServer) {
	sort.SliceStable(servers, func(i, j int) bool {
		if servers[i].InstallStatus != servers[j].InstallStatus {
			return installStatusRank(servers[i].InstallStatus) < installStatusRank(servers[j].InstallStatus)
		}
		leftName := marketplaceSortName(servers[i])
		rightName := marketplaceSortName(servers[j])
		if leftName == rightName {
			return marketplaceEntryKey(servers[i].SourceID, servers[i].ID) < marketplaceEntryKey(servers[j].SourceID, servers[j].ID)
		}
		return leftName < rightName
	})
}

func marketplaceSortName(entry types.DashboardMarketplaceServer) string {
	if entry.DisplayName != "" {
		return entry.DisplayName
	}
	return entry.Name
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
