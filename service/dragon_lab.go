package service

import (
	_ "embed"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

//go:embed lab-assets/TaiSha.html
var DragonLabScriptTool []byte

const dragonLabOptionKey = "DragonLabTopology"

type DragonLabNode struct {
	ID          string `json:"id"`
	Address     string `json:"address"`
	Gateway     string `json:"gateway"`
	ConsoleID   int    `json:"console_id"`
	ConsoleMode string `json:"console_mode"`
}
type DragonLabLink struct {
	ID            string `json:"id"`
	SourcePort    string `json:"source_port"`
	TargetPort    string `json:"target_port"`
	SourceAddress string `json:"source_address"`
	TargetAddress string `json:"target_address"`
	VLAN          string `json:"vlan"`
	Phase         string `json:"phase"`
}
type DragonLabConfig struct {
	WorkbenchURL string          `json:"workbench_url,omitempty"`
	Nodes        []DragonLabNode `json:"nodes"`
	Links        []DragonLabLink `json:"links"`
}

func DefaultDragonLabConfig() DragonLabConfig {
	return DragonLabConfig{
		Nodes: []DragonLabNode{
			{ID: "pc", Address: "62.2.90.164", ConsoleID: 1, ConsoleMode: "remote"},
			{ID: "sw1", Address: "192.168.56.254/24", ConsoleID: 7, ConsoleMode: "remote"},
			{ID: "sw2", Address: "60.11.40.1 · 62.2.90.x", ConsoleID: 8, ConsoleMode: "remote"},
			{ID: "ibmc", Address: "192.168.2.100 → 8.35.155.29", Gateway: "8.35.155.1", ConsoleID: 9, ConsoleMode: "remote"},
			{ID: "os", Address: "60.11.42.99/19", Gateway: "60.11.40.1", ConsoleID: 6, ConsoleMode: "remote"},
		},
		Links: []DragonLabLink{
			{ID: "pc-sw1", SourcePort: "Loopback / Cloud", TargetPort: "GE0/0/1", SourceAddress: "192.168.56.10/24", TargetAddress: "192.168.56.254/24", VLAN: "10", Phase: "planned"},
			{ID: "sw1-ibmc", SourcePort: "GE0/0/2", TargetPort: "iBMC management", SourceAddress: "VLAN 10 · Access", TargetAddress: "8.35.155.29/24", VLAN: "10", Phase: "planned"},
			{ID: "pc-sw2", SourcePort: "Installation NIC", TargetPort: "GE0/0/3", SourceAddress: "62.2.90.164", TargetAddress: "62.2.90.x", Phase: "planned"},
			{ID: "sw2-os-a", SourcePort: "GE0/0/1", TargetPort: "enp0s9", SourceAddress: "Eth-Trunk1 · LACP", TargetAddress: "bond4 · 60.11.42.99/19", Phase: "planned"},
			{ID: "sw2-os-b", SourcePort: "GE0/0/2", TargetPort: "enp0s10", SourceAddress: "Eth-Trunk1 · LACP", TargetAddress: "bond4 · 60.11.42.99/19", Phase: "planned"},
			{ID: "ibmc-os", SourcePort: "SOL / COM1", TargetPort: "ttyS0", SourceAddress: "115200 8N1", TargetAddress: "OS login", Phase: "configured"},
		},
	}
}

func ValidateDragonLabConfig(config DragonLabConfig) error {
	if config.WorkbenchURL != "" {
		target, err := url.Parse(config.WorkbenchURL)
		if err != nil || len(config.WorkbenchURL) > 4096 || strings.ContainsAny(config.WorkbenchURL, "\r\n\x00\\") || target == nil || (target.Scheme != "https" && target.Scheme != "http") || target.Hostname() == "" || target.User != nil {
			return errors.New("Invalid workbench URL")
		}
	}
	expectedNodes := map[string]bool{"pc": true, "sw1": true, "sw2": true, "ibmc": true, "os": true}
	expectedLinks := map[string]bool{"pc-sw1": true, "sw1-ibmc": true, "pc-sw2": true, "sw2-os-a": true, "sw2-os-b": true, "ibmc-os": true}
	if len(config.Nodes) != len(expectedNodes) || len(config.Links) != len(expectedLinks) {
		return errors.New("The lab requires five nodes and six links")
	}
	for _, node := range config.Nodes {
		if !expectedNodes[node.ID] {
			return errors.New("Invalid or duplicate lab node")
		}
		delete(expectedNodes, node.ID)
		if node.ConsoleID < 0 || node.ConsoleID > 999999 {
			return errors.New("Invalid registered console ID")
		}
		if node.ConsoleMode != "remote" && node.ConsoleMode != "sol" && node.ConsoleMode != "pending" {
			return errors.New("Invalid console mode")
		}
		if node.ConsoleMode == "remote" && node.ConsoleID == 0 {
			return errors.New("A remote console requires a registered connection ID")
		}
		if node.ConsoleMode == "sol" && node.ID != "ibmc" {
			return errors.New("COM1 is reserved for the iBMC node")
		}
		if len(node.Address) > 160 || len(node.Gateway) > 80 || strings.ContainsAny(node.Address+node.Gateway, "\r\n\x00") {
			return errors.New("Invalid lab address label")
		}
	}
	for _, link := range config.Links {
		if !expectedLinks[link.ID] {
			return errors.New("Invalid or duplicate lab link")
		}
		delete(expectedLinks, link.ID)
		if link.Phase != "planned" && link.Phase != "configured" {
			return errors.New("Invalid link planning state")
		}
		for _, label := range []string{link.SourcePort, link.TargetPort, link.SourceAddress, link.TargetAddress, link.VLAN} {
			if len(label) > 160 || strings.ContainsAny(label, "\r\n\x00") {
				return errors.New("Invalid lab port label")
			}
		}
	}
	return nil
}

func GetDragonLabConfig() (DragonLabConfig, error) {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[dragonLabOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if value == "" {
		return DefaultDragonLabConfig(), nil
	}
	var config DragonLabConfig
	if err := common.UnmarshalJsonStr(value, &config); err != nil {
		return DragonLabConfig{}, fmt.Errorf("Unable to decode lab configuration: %w", err)
	}
	if err := ValidateDragonLabConfig(config); err != nil {
		return DragonLabConfig{}, err
	}
	return config, nil
}

func SaveDragonLabConfig(config DragonLabConfig) error {
	if err := ValidateDragonLabConfig(config); err != nil {
		return err
	}
	value, err := common.Marshal(config)
	if err != nil {
		return err
	}
	return model.UpdateOptionsBulk(map[string]string{dragonLabOptionKey: string(value)})
}
