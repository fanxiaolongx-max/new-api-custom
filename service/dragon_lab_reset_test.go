package service

import (
	"errors"
	"net"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func serveLabResetHelper(t *testing.T, status int, body string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("VM_AGENT_SOCKET", filepath.Join(dir, "agent.sock"))
	listener, err := net.Listen("unix", filepath.Join(dir, "lab-reset.sock"))
	require.NoError(t, err)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/lab/factory-reset", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
}

func TestResetDragonLab(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		body       string
		wantOK     bool
		wantStatus int
	}{
		{name: "reset completed", status: http.StatusOK, body: `{"ok":true,"log":"[1/3] ...\nRESET_OK"}`, wantOK: true},
		{name: "reset reported failure", status: http.StatusOK, body: `{"ok":false,"log":"RESET_FAIL"}`, wantOK: false},
		{name: "reset already running", status: http.StatusConflict, body: `{"ok":false,"log":"A factory reset is already running"}`, wantStatus: http.StatusConflict},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			serveLabResetHelper(t, tt.status, tt.body)
			result, err := ResetDragonLab()
			if tt.wantStatus != 0 {
				var agentErr *VMAgentResponseError
				require.True(t, errors.As(err, &agentErr))
				assert.Equal(t, tt.wantStatus, agentErr.Status)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantOK, result.OK)
		})
	}
}

func TestResetDragonLabHelperMissing(t *testing.T) {
	t.Setenv("VM_AGENT_SOCKET", filepath.Join(t.TempDir(), "agent.sock"))
	_, err := ResetDragonLab()
	assert.True(t, errors.Is(err, ErrVMAgentUnavailable))
}
