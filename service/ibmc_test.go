package service

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIBMCStatusPreservesSimulationAndActualPowerState(t *testing.T) {
	withVMAgentFixture(t, func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, http.MethodGet, request.Method)
		assert.Equal(t, "/v1/ibmc", request.URL.Path)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"simulation":true,"state":"poweroff","name":"openEuler","serial":true}`))}, nil
	})
	status, err := GetIBMC()
	require.NoError(t, err)
	assert.Equal(t, true, status["simulation"])
	assert.Equal(t, "poweroff", status["state"])
}

func TestIBMCForwardsSerialBytesWithoutChangingThePayload(t *testing.T) {
	withVMAgentFixture(t, func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, http.MethodPost, request.Method)
		assert.Equal(t, "/v1/ibmc/serial", request.URL.Path)
		var input map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &input))
		assert.Equal(t, "Aw0=", input["data"])
		assert.Equal(t, "lease", input["session"])
		return &http.Response{StatusCode: 400, Body: io.NopCloser(strings.NewReader(`{"error":"Serial session expired or invalid"}`))}, nil
	})
	_, err := CallIBMC(http.MethodPost, "/v1/ibmc/serial", map[string]string{"operation": "write", "data": "Aw0=", "session": "lease"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Serial session expired or invalid")
}
