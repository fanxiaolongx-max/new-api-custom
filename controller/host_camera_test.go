package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHostCameraRequiresDashboardSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/system/camera/stream", nil)
	// An authenticated API key can carry a user ID, but has no session identity.
	ctx.Set("id", 1)
	StreamHostCamera(ctx)
	require.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, recorder.Body.String())
}
