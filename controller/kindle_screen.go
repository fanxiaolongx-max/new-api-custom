package controller

import (
	"context"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

// GetKindleScreen restricts private screen content to root dashboard sessions.
func GetKindleScreen(c *gin.Context) {
	if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "unix", "/run/vm-agent/kindle-screen.sock")
	}}
	defer transport.CloseIdleConnections()
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, "http://kindle-screen/screen", nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	response, err := (&http.Client{Transport: transport, Timeout: 20 * time.Second}).Do(request)
	if err != nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	image, err := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024+1))
	if err != nil || len(image) > 8*1024*1024 {
		c.Status(http.StatusBadGateway)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "image/png", image)
}
