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
	serveLabHelper(t, http.MethodPost, "/v1/lab/factory-reset", status, body)
}

func serveLabHelper(t *testing.T, method string, path string, status int, body string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("VM_AGENT_SOCKET", filepath.Join(dir, "agent.sock"))
	listener, err := net.Listen("unix", filepath.Join(dir, "lab-reset.sock"))
	require.NoError(t, err)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, method, r.Method)
		require.Equal(t, path, r.URL.Path)
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

func TestGetDragonLabLinkStatus(t *testing.T) {
	serveLabHelper(t, http.MethodGet, "/v1/lab/link-status", http.StatusOK,
		`{"updated":1790000000,"stale":false,"endpoints":{"sw2:GE0/0/1":{"state":"warn","label":"SW2 GE0/0/1","detail":"Eth-Trunk1 Unselect"}},"links":{"sw2-os-a":["sw2:GE0/0/1","os:enp0s9"]}}`)
	status, err := GetDragonLabLinkStatus()
	require.NoError(t, err)
	assert.False(t, status.Stale)
	assert.Equal(t, "warn", status.Endpoints["sw2:GE0/0/1"].State)
	assert.Equal(t, [2]string{"sw2:GE0/0/1", "os:enp0s9"}, status.Links["sw2-os-a"])
}

func TestGetDragonLabLinkStatusHelperMissing(t *testing.T) {
	t.Setenv("VM_AGENT_SOCKET", filepath.Join(t.TempDir(), "agent.sock"))
	_, err := GetDragonLabLinkStatus()
	assert.ErrorIs(t, err, ErrVMAgentUnavailable)
}
