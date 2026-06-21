package model

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const McpServerRegistrationSourceMarketplace = "marketplace"

// McpServerRegistrationSource records where a server registration originated.
// Marketplace rows keep the catalog snapshot used at install/update time.
type McpServerRegistrationSource struct {
	gorm.Model

	ServerName string `json:"server_name" gorm:"uniqueIndex;not null"`
	SourceType string `json:"source_type" gorm:"index;not null"`
	SourceID   string `json:"source_id" gorm:"not null"`
	SourceURL  string `json:"source_url"`
	EntryID    string `json:"entry_id" gorm:"index;not null"`
	Publisher  string `json:"publisher"`

	InstalledVersion string    `json:"installed_version"`
	InstalledDigest  string    `json:"installed_digest"`
	InstalledAt      time.Time `json:"installed_at" gorm:"not null"`

	CatalogInstallDraft datatypes.JSON `json:"-" gorm:"type:jsonb"`
}
