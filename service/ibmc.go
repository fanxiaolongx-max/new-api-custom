package service

import (
	"net/http"
	"net/url"
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
	return GetIBMCForNode("")
}

func GetIBMCForNode(node string) (map[string]any, error) {
	path := "/v1/ibmc"
	if node != "" {
		path += "?node=" + url.QueryEscape(node)
	}
	result, err := CallIBMC(http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	if _, ok := result["console_id"]; !ok {
		if name, ok := result["name"].(string); ok && name != "" {
			if consoles := ReadWorkspaceConsoles(); consoles != nil {
				if id := consoles.VMConsoles[name]; id > 0 {
					result["console_id"] = id
				}
			}
		}
	}
	return result, nil
}
