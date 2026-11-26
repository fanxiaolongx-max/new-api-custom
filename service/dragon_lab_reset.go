package service

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// DragonLabResetResult is the outcome of restoring the TaiShan lab to factory state.
type DragonLabResetResult struct {
	OK  bool   `json:"ok"`
	Log string `json:"log"`
}

// The reset helper runs as the host user and listens next to the VM agent socket,
// which is the only host directory shared with this container.
func dragonLabResetSocket() string {
	agentSocket := os.Getenv("VM_AGENT_SOCKET")
	if agentSocket == "" {
		agentSocket = defaultVMAgentSocket
	}
	return filepath.Join(filepath.Dir(agentSocket), "lab-reset.sock")
}

func ResetDragonLab() (DragonLabResetResult, error) {
	socketPath := dragonLabResetSocket()
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "unix", socketPath)
			},
		},
		// Console automation on SW1 plus the OS reset takes about a minute.
		Timeout: 3 * time.Minute,
	}
	response, err := client.Post("http://lab-reset/v1/lab/factory-reset", "application/json", nil)
	if err != nil {
		return DragonLabResetResult{}, fmt.Errorf("%w: %v", ErrVMAgentUnavailable, err)
	}
	defer response.Body.Close()
	var result DragonLabResetResult
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return DragonLabResetResult{}, fmt.Errorf("lab reset helper returned status %d", response.StatusCode)
	}
	if response.StatusCode == http.StatusConflict {
		return result, &VMAgentResponseError{Status: http.StatusConflict, Message: result.Log}
	}
	return result, nil
}
