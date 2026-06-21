package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mcpjungle/mcpjungle/internal/model"
	"github.com/mcpjungle/mcpjungle/internal/service/dashboard"
)

func (s *Server) dashboardOverviewHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		mode := c.MustGet("mode").(model.ServerMode)
		resp, err := s.dashboardService.Overview(mode, requestBaseURL(c))
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardServersHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		resp, err := s.dashboardService.Servers()
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardToolsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		resp, err := s.dashboardService.Tools()
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardPromptsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		resp, err := s.dashboardService.Prompts()
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardResourcesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		resp, err := s.dashboardService.Resources()
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardDiagnosticsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		mode := c.MustGet("mode").(model.ServerMode)
		resp, err := s.dashboardService.Diagnostics(mode, requestBaseURL(c))
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) dashboardMarketplaceHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.Query("limit"))
		resp, err := s.dashboardService.MarketplaceWithQuery(c.Request.Context(), dashboard.MarketplaceQuery{
			Search:        c.Query("q"),
			SourceID:      c.Query("source_id"),
			Transport:     c.Query("transport"),
			InstallStatus: c.Query("install_status"),
			UpdateState:   c.Query("update_state"),
			Limit:         limit,
			Cursor:        c.Query("cursor"),
			LoadSources:   true,
		})
		if err != nil {
			handleServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func requestBaseURL(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host
}
