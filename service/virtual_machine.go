/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const defaultVMAgentSocket = "/run/vm-agent/agent.sock"

var ErrVMAgentUnavailable = errors.New("virtual machine agent is unavailable")

type VirtualMachine struct {
	Name     string `json:"name"`
	State    string `json:"state"`
	OSType   string `json:"os_type"`
	MemoryMB int    `json:"memory_mb"`
	CPUCount int    `json:"cpu_count"`
}

type vmListResponse struct {
	VMs []VirtualMachine `json:"vms"`
}

type vmActionResponse struct {
	VM VirtualMachine `json:"vm"`
}

type vmAgentError struct {
	Error string `json:"error"`
}

type VirtualMachineInput struct {
	Text      string `json:"text,omitempty"`
	Scancodes []int  `json:"scancodes,omitempty"`
	X         *int   `json:"x,omitempty"`
	Y         *int   `json:"y,omitempty"`
	Buttons   int    `json:"buttons,omitempty"`
}

type VirtualMachineSettings struct {
	IdleSaveMinutes int `json:"idle_save_minutes"`
}

func newVMAgentClient() *http.Client {
	socketPath := os.Getenv("VM_AGENT_SOCKET")
	if socketPath == "" {
		socketPath = defaultVMAgentSocket
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "unix", socketPath)
		},
	}
	return &http.Client{Transport: transport, Timeout: 35 * time.Second}
}

var vmAgentClientFactory = newVMAgentClient

func callVMAgent(method string, path string, requestBody any) (*http.Response, error) {
	var body io.Reader
	if requestBody != nil {
		encoded, err := common.Marshal(requestBody)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, "http://vm-agent"+path, body)
	if err != nil {
		return nil, err
	}
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := vmAgentClientFactory().Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVMAgentUnavailable, err)
	}
	return response, nil
}

func decodeVMAgentResponse(response *http.Response, target any) error {
	defer response.Body.Close()
	if response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices {
		if target == nil {
			return nil
		}
		return common.DecodeJson(response.Body, target)
	}
	var agentError vmAgentError
	if err := common.DecodeJson(response.Body, &agentError); err != nil || agentError.Error == "" {
		return fmt.Errorf("virtual machine agent returned status %d", response.StatusCode)
	}
	return errors.New(agentError.Error)
}

func ListVirtualMachines() ([]VirtualMachine, error) {
	response, err := callVMAgent(http.MethodGet, "/v1/vms", nil)
	if err != nil {
		return nil, err
	}
	var result vmListResponse
	if err := decodeVMAgentResponse(response, &result); err != nil {
		return nil, err
	}
	return result.VMs, nil
}

func GetVirtualMachineSettings() (VirtualMachineSettings, error) {
	response, err := callVMAgent(http.MethodGet, "/v1/settings", nil)
	if err != nil {
		return VirtualMachineSettings{}, err
	}
	var result VirtualMachineSettings
	if err := decodeVMAgentResponse(response, &result); err != nil {
		return VirtualMachineSettings{}, err
	}
	return result, nil
}

func UpdateVirtualMachineSettings(settings VirtualMachineSettings) (VirtualMachineSettings, error) {
	response, err := callVMAgent(http.MethodPut, "/v1/settings", settings)
	if err != nil {
		return VirtualMachineSettings{}, err
	}
	var result VirtualMachineSettings
	if err := decodeVMAgentResponse(response, &result); err != nil {
		return VirtualMachineSettings{}, err
	}
	return result, nil
}

func ControlVirtualMachine(name string, action string) (VirtualMachine, error) {
	response, err := callVMAgent(
		http.MethodPost,
		"/v1/vms/"+url.PathEscape(name)+"/action",
		map[string]string{"action": action},
	)
	if err != nil {
		return VirtualMachine{}, err
	}
	var result vmActionResponse
	if err := decodeVMAgentResponse(response, &result); err != nil {
		return VirtualMachine{}, err
	}
	return result.VM, nil
}

func GetVirtualMachineScreenshot(name string) ([]byte, error) {
	response, err := callVMAgent(http.MethodGet, "/v1/vms/"+url.PathEscape(name)+"/screenshot", nil)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var agentError vmAgentError
		if err := common.DecodeJson(response.Body, &agentError); err == nil && agentError.Error != "" {
			return nil, errors.New(agentError.Error)
		}
		return nil, fmt.Errorf("virtual machine agent returned status %d", response.StatusCode)
	}
	return io.ReadAll(io.LimitReader(response.Body, 16*1024*1024))
}

func SendVirtualMachineInput(name string, inputType string, input VirtualMachineInput) error {
	response, err := callVMAgent(
		http.MethodPost,
		"/v1/vms/"+url.PathEscape(name)+"/"+inputType,
		input,
	)
	if err != nil {
		return err
	}
	return decodeVMAgentResponse(response, nil)
}
