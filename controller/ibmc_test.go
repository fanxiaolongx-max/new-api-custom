package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIBMCSerialRejectsRequestsWithoutDashboardSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(method, "/api/system/ibmc/serial", strings.NewReader(`{"operation":"open"}`))
			ctx.Request.Header.Set("Content-Type", "application/json")
			ctx.Set("id", 1)
			if method == http.MethodGet {
				ReadIBMCSerial(ctx)
			} else {
				WriteIBMCSerial(ctx)
			}
			require.Equal(t, http.StatusForbidden, recorder.Code)
			assert.Empty(t, recorder.Body.String())
		})
	}
}

func TestIBMCRejectsArbitraryActionsBeforeContactingHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/system/ibmc/action", strings.NewReader(`{"action":"exec","command":"id"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ControlIBMC(ctx)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "Invalid iBMC action")
}
