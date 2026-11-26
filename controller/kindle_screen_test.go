package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKindleScreenRequiresDashboardSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/system/kindle/screen", nil)
	ctx.Set("id", 1)
	GetKindleScreen(ctx)
	require.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, recorder.Body.String())
}
