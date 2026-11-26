package controller

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// StreamHostCamera only accepts dashboard sessions; API keys cannot access private media.
func StreamHostCamera(c *gin.Context) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "unix", "/run/vm-agent/camera.sock")
	}, ResponseHeaderTimeout: 15 * time.Second}
	defer transport.CloseIdleConnections()
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, "http://camera-agent/stream", nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	response, err := (&http.Client{Transport: transport}).Do(request)
	if err != nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		c.Status(response.StatusCode)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Content-Type", "video/mp4")
	c.Status(http.StatusOK)
	buf := make([]byte, 16384)
	nextCheck := time.Now().Add(30 * time.Second)
	for {
		n, readErr := response.Body.Read(buf)
		if n > 0 {
			if time.Now().After(nextCheck) {
				_, user, err := service.ValidateLoginSession(identity)
				if err != nil || user.Status != common.UserStatusEnabled || user.Role < common.RoleRootUser {
					return
				}
				nextCheck = time.Now().Add(30 * time.Second)
			}
			if _, err := c.Writer.Write(buf[:n]); err != nil {
				return
			}
			c.Writer.Flush()
		}
		if readErr != nil {
			return
		}
	}
}
