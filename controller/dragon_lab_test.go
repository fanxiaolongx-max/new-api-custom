package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDragonLabConsoleRedirectStaysInsideConsole(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"/guacamole/#/client/test", "/guacamole/#/client/test"},
		{"https://example.com/", "/guacamole/"},
		{"//example.com/", "/guacamole/"},
		{"/logs/", "/guacamole/"},
		{"/guacamole.evil/", "/guacamole/"},
		{"/guacamole/\r\nInjected: value", "/guacamole/"},
		{"/guacamole/\\example.com", "/guacamole/"},
	} {
		assert.Equal(t, tc.want, dragonLabConsoleTarget(tc.input))
	}
}
func TestDragonLabConsoleRequiresBrowserCookies(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/system/lab/console/auth", nil)
	DragonLabConsoleAuth(c)
	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	assert.Empty(t, recorder.Header().Get("X-Auth-User"))
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/system/lab/console/sso?redirect=https://example.com", nil)
	DragonLabConsoleSSO(c)
	require.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "/sign-in", recorder.Header().Get("Location"))
}
