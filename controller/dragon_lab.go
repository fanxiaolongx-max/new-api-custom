package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func GetDragonLab(c *gin.Context) {
	config, err := service.GetDragonLabConfig()
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "Unable to read lab configuration"})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": config})
}
func UpdateDragonLab(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	var config service.DragonLabConfig
	if err := common.DecodeJson(c.Request.Body, &config); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid lab configuration"})
		return
	}
	if err := service.ValidateDragonLabConfig(config); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := service.SaveDragonLabConfig(config); err != nil {
		c.JSON(503, gin.H{"success": false, "message": "Unable to save lab configuration"})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": config})
}
func ResetDragonLab(c *gin.Context) {
	result, err := service.ResetDragonLab()
	if err != nil {
		var agentErr *service.VMAgentResponseError
		if errors.As(err, &agentErr) {
			c.JSON(agentErr.Status, gin.H{"success": false, "message": agentErr.Message})
			return
		}
		c.JSON(503, gin.H{"success": false, "message": "Lab reset helper is unavailable"})
		return
	}
	if !result.OK {
		c.JSON(200, gin.H{"success": false, "message": "Factory reset did not complete", "data": result})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": result})
}
func GetDragonLabTool(c *gin.Context) {
	// Served as authenticated text; the frontend isolates it in a sandboxed frame.
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, "text/plain; charset=utf-8", service.DragonLabScriptTool)
}

// DragonLabConsoleSSO uses a live browser session, not an administrator API token.
func DragonLabConsoleSSO(c *gin.Context) {
	raw, err := c.Cookie(service.RefreshCookieName)
	if err != nil || raw == "" {
		c.Redirect(http.StatusFound, "/sign-in")
		return
	}
	identity, user, err := service.ValidateRefreshLoginSession(raw)
	if err != nil {
		c.Redirect(http.StatusFound, "/sign-in")
		return
	}
	if !authz.Can(user.Id, user.Role, authz.DragonLabFull) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	target := dragonLabConsoleTarget(c.Query("redirect"))
	ticket, err := service.IssueLogsSession(identity)
	if err != nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: service.LogsSessionCookieName, Value: ticket, Path: "/", MaxAge: int(service.LogsSessionTTL / time.Second), Expires: time.Now().Add(service.LogsSessionTTL), HttpOnly: true, Secure: common.SessionCookieSecure, SameSite: http.SameSiteStrictMode})
	c.Redirect(http.StatusFound, target)
}

// The proxy trusts this header only after this cookie/session/permission check.
// Delegated users map to a Guacamole identity with only the lab connections.
func DragonLabConsoleAuth(c *gin.Context) {
	ticket, err := c.Cookie(service.LogsSessionCookieName)
	if err != nil || ticket == "" {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	_, user, err := service.ValidateLogsSession(ticket)
	if err != nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if !authz.Can(user.Id, user.Role, authz.DragonLabFull) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	name := user.Username
	if user.Role < common.RoleRootUser {
		name = fmt.Sprintf("dragon-lab-%d", user.Id)
	}
	c.Header("X-Auth-User", name)
	c.Status(http.StatusNoContent)
}

func dragonLabConsoleTarget(target string) string {
	if !strings.HasPrefix(target, "/guacamole/") || strings.ContainsAny(target, "\r\n\\") {
		return "/guacamole/"
	}
	return target
}
