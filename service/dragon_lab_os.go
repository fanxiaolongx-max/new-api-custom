package service

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Each guest has its own console bindings and endpoint samples. The two PC
// uplinks belong to the lab and continue to use the shared topology.
type DragonLabOS struct {
	Name   string              `json:"name"`
	State  string              `json:"state"`
	Nodes  []DragonLabNode     `json:"nodes"`
	Links  []DragonLabLink     `json:"links"`
	Status DragonLabLinkStatus `json:"status"`
}

func GetDragonLabOSNodes() ([]DragonLabOS, error) {
	f, err := os.Open(filepath.Join(filepath.Dir(dragonLabResetSocket()), "lab-os-nodes.json"))
	if errors.Is(err, os.ErrNotExist) {
		return []DragonLabOS{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var nodes []DragonLabOS
	if err := common.DecodeJson(io.LimitReader(f, 1<<20), &nodes); err != nil {
		return nil, err
	}
	for i := range nodes {
		stale := time.Since(time.Unix(nodes[i].Status.Updated, 0)) > 45*time.Second
		nodes[i].Status.Stale = stale
		if stale {
			nodes[i].State = "unknown"
		}
	}
	return nodes, nil
}

// DragonLabFactoryCheck compares one node property with what the factory reset produces.
type DragonLabFactoryCheck struct {
	Node     string  `json:"node"`
	Item     string  `json:"item"` // sw1 | ibmc | bond | selinux
	Target   string  `json:"target,omitempty"`
	Expected string  `json:"expected"`
	Actual   *string `json:"actual"`
	OK       *bool   `json:"ok"`
}

// DragonLabFactoryStatus is sampled about once a minute by the OS port monitor.
type DragonLabFactoryStatus struct {
	Updated int64                   `json:"updated"`
	State   string                  `json:"state"` // factory | modified | unknown
	Checks  []DragonLabFactoryCheck `json:"checks"`
}

func GetDragonLabFactoryStatus() (DragonLabFactoryStatus, error) {
	f, err := os.Open(filepath.Join(filepath.Dir(dragonLabResetSocket()), "lab-factory.json"))
	if errors.Is(err, os.ErrNotExist) {
		return DragonLabFactoryStatus{State: "unknown", Checks: []DragonLabFactoryCheck{}}, nil
	}
	if err != nil {
		return DragonLabFactoryStatus{}, err
	}
	defer f.Close()
	var status DragonLabFactoryStatus
	if err := common.DecodeJson(io.LimitReader(f, 1<<20), &status); err != nil {
		return DragonLabFactoryStatus{}, err
	}
	// A sample older than three check intervals no longer proves anything.
	if time.Since(time.Unix(status.Updated, 0)) > 3*time.Minute {
		status.State = "unknown"
	}
	return status, nil
}
