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
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type vmAgentRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip vmAgentRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

func withVMAgentFixture(t *testing.T, roundTrip vmAgentRoundTripper) {
	original := vmAgentClientFactory
	vmAgentClientFactory = func() *http.Client {
		return &http.Client{Transport: roundTrip}
	}
	t.Cleanup(func() { vmAgentClientFactory = original })
}

func TestListVirtualMachinesPreservesHostState(t *testing.T) {
	withVMAgentFixture(t, func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, http.MethodGet, request.Method)
		assert.Equal(t, "/v1/vms", request.URL.Path)
		return &http.Response{
			StatusCode: http.StatusOK,
			Body: io.NopCloser(strings.NewReader(
				`{"vms":[{"name":"win11","state":"saved","os_type":"Windows 11 (64-bit)","memory_mb":4096,"cpu_count":2}]}`,
			)),
		}, nil
	})

	machines, err := ListVirtualMachines()

	require.NoError(t, err)
	require.Len(t, machines, 1)
	assert.Equal(t, VirtualMachine{
		Name: "win11", State: "saved", OSType: "Windows 11 (64-bit)",
		MemoryMB: 4096, CPUCount: 2,
	}, machines[0])
}

func TestControlVirtualMachineReturnsAgentValidationError(t *testing.T) {
	withVMAgentFixture(t, func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, http.MethodPost, request.Method)
		assert.Equal(t, "/v1/vms/win11/action", request.URL.Path)
		return &http.Response{
			StatusCode: http.StatusBadRequest,
			Body:       io.NopCloser(strings.NewReader(`{"error":"unsupported action"}`)),
		}, nil
	})

	_, err := ControlVirtualMachine("win11", "invalid")

	require.Error(t, err)
	assert.Equal(t, "unsupported action", err.Error())
}
