/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func LogsSSOBridge(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	rawRefreshToken, err := c.Cookie(service.RefreshCookieName)
	if err != nil || rawRefreshToken == "" {
		c.Redirect(http.StatusFound, "/sign-in")
		return
	}
	identity, user, err := service.ValidateRefreshLoginSession(rawRefreshToken)
	if err != nil {
		c.Redirect(http.StatusFound, "/sign-in")
		return
	}
	if user.Role < common.RoleRootUser {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	ticket, err := service.IssueLogsSession(identity)
	if err != nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     service.LogsSessionCookieName,
		Value:    ticket,
		Path:     "/",
		MaxAge:   int(service.LogsSessionTTL / time.Second),
		Expires:  time.Now().Add(service.LogsSessionTTL),
		HttpOnly: true,
		Secure:   common.SessionCookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
	targetURI := c.GetHeader("X-Original-URI")
	if targetURI == "" {
		targetURI = c.Query("redirect")
	}
	if targetURI == "" {
		targetURI = "/logs/"
	}
	c.Redirect(http.StatusFound, targetURI)
}

func LogsAuth(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
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
	if user.Role < common.RoleRootUser {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	c.Header("X-Auth-User", user.Username)
	c.Status(http.StatusNoContent)
}
