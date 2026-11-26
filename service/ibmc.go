package service

import (
	"net/http"
)

// CallIBMC keeps the simulated controller behind the existing local VM agent.
// Operation paths are fixed by controllers, never supplied by the browser.
func CallIBMC(method, path string, payload any) (map[string]any, error) {
	response, err := callVMAgent(method, path, payload)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := decodeVMAgentResponse(response, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func GetIBMC() (map[string]any, error) {
	return CallIBMC(http.MethodGet, "/v1/ibmc", nil)
}
