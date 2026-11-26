package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDragonLabDefaultsKeepDevicePlansSeparateFromConsoleBindings(t *testing.T) {
	config := DefaultDragonLabConfig()
	require.NoError(t, ValidateDragonLabConfig(config))
	assert.Len(t, config.Nodes, 5)
	assert.Len(t, config.Links, 6)
	for _, node := range config.Nodes {
		if node.ID == "sw2" {
			assert.Equal(t, "remote", node.ConsoleMode)
			assert.Equal(t, 8, node.ConsoleID)
		}
		if node.ID == "ibmc" {
			assert.Equal(t, "remote", node.ConsoleMode)
			assert.Equal(t, 9, node.ConsoleID)
		}
	}
	for _, link := range config.Links {
		if link.ID != "ibmc-os" {
			assert.Equal(t, "planned", link.Phase)
		}
	}
}
func TestDragonLabRejectsInvalidConsoleBindingsAndDuplicateNodes(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*DragonLabConfig)
	}{
		{"duplicate node", func(c *DragonLabConfig) { c.Nodes[1].ID = c.Nodes[0].ID }},
		{"remote console without ID", func(c *DragonLabConfig) { c.Nodes[0].ConsoleID = 0 }},
		{"arbitrary URL mode", func(c *DragonLabConfig) { c.Nodes[0].ConsoleMode = "https://example.com" }},
		{"negative console ID", func(c *DragonLabConfig) { c.Nodes[0].ConsoleID = -1 }},
		{"SOL conflict", func(c *DragonLabConfig) { c.Nodes[0].ConsoleMode = "sol" }},
		{"invalid link state", func(c *DragonLabConfig) { c.Links[0].Phase = "online" }},
		{"multiline port", func(c *DragonLabConfig) { c.Links[0].SourcePort = "eth0\ncommand" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			config := DefaultDragonLabConfig()
			test.change(&config)
			require.Error(t, ValidateDragonLabConfig(config))
		})
	}
}
func TestDragonLabPermitsFutureRegisteredConsolesWithoutChangingTopology(t *testing.T) {
	config := DefaultDragonLabConfig()
	for i := range config.Nodes {
		if config.Nodes[i].ID == "sw2" {
			config.Nodes[i].ConsoleMode = "remote"
			config.Nodes[i].ConsoleID = 8
		}
	}
	require.NoError(t, ValidateDragonLabConfig(config))
}

func TestDragonLabWorkbenchAddressOnlyAllowsWebURLs(t *testing.T) {
	for _, test := range []struct {
		name, address string
		valid         bool
	}{
		{"bundled tool", "", true},
		{"temporary link", "https://lab.example/t/taisha/test-access", true},
		{"internal web page", "http://192.168.1.2:8080/tool?standalone=1", true},
		{"javascript", "javascript:alert(1)", false},
		{"data document", "data:text/html,test", false},
		{"relative page", "/tool", false},
		{"embedded password", "https://user:password@example.com/tool", false},
		{"control character", "https://example.com/\n", false},
		{"missing host", "https:///tool", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			config := DefaultDragonLabConfig()
			config.WorkbenchURL = test.address
			err := ValidateDragonLabConfig(config)
			if test.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
