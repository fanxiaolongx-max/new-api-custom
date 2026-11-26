package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkbenchBridgeCachePolicy(t *testing.T) {
	for _, tc := range []struct{ path, cache string }{
		{"/dragon-lab-workbench-bridge.js", "no-store"},
		{"/dragon-lab-workbench-bridge.js?v=2", "no-store"},
		{"/", "no-cache"},
		{"/static/js/index.hash.js", "max-age=604800"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			router := gin.New()
			router.Use(Cache())
			router.NoRoute(func(c *gin.Context) { c.Status(http.StatusOK) })
			request := httptest.NewRequest(http.MethodGet, tc.path, nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, http.StatusOK, response.Code)
			assert.Equal(t, tc.cache, response.Header().Get("Cache-Control"))
		})
	}
}
