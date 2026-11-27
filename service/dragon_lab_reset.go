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

func dragonLabHelperClient(timeout time.Duration) *http.Client {
	socketPath := dragonLabResetSocket()
	return &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "unix", socketPath)
			},
		},
		Timeout: timeout,
	}
}

func ResetDragonLab() (DragonLabResetResult, error) {
	// Console automation on SW1 plus the OS reset takes about a minute.
	response, err := dragonLabHelperClient(3*time.Minute).Post("http://lab-reset/v1/lab/factory-reset", "application/json", nil)
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

// DragonLabEndpointStatus is the live state of one end of a topology link.
type DragonLabEndpointStatus struct {
	State  string `json:"state"` // up | down | warn | unknown
	Label  string `json:"label"`
	Detail string `json:"detail"`
}

// DragonLabLinkStatus is collected every 10s inside the lab and relayed by the reset helper.
type DragonLabLinkStatus struct {
	Updated   int64                              `json:"updated"`
	Stale     bool                               `json:"stale"`
	Endpoints map[string]DragonLabEndpointStatus `json:"endpoints"`
	Links     map[string][2]string               `json:"links"`
}

func GetDragonLabLinkStatus() (DragonLabLinkStatus, error) {
	response, err := dragonLabHelperClient(12 * time.Second).Get("http://lab-reset/v1/lab/link-status")
	if err != nil {
		return DragonLabLinkStatus{}, fmt.Errorf("%w: %v", ErrVMAgentUnavailable, err)
	}
	defer response.Body.Close()
	var status DragonLabLinkStatus
	if response.StatusCode != http.StatusOK {
		return status, fmt.Errorf("lab link status helper returned status %d", response.StatusCode)
	}
	if err := common.DecodeJson(response.Body, &status); err != nil {
		return status, fmt.Errorf("lab link status helper returned invalid data: %w", err)
	}
	return status, nil
}
