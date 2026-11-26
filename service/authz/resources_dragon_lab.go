package authz

// DragonLabFull grants laboratory operations without granting the Root role.
// For non-Root users its frontend presents only the laboratory workspace.
var DragonLabDesktop = Permission{Resource: "dragon_lab", Action: "desktop"}

var DragonLabFull = Permission{Resource: "dragon_lab", Action: "full"}

func init() {
	RegisterResource(ResourceDefinition{
		Resource: "dragon_lab",
		LabelKey: "Dragon Lab",
		Actions: []ActionDefinition{{
			Action:         "full",
			LabelKey:       "Dragon Lab only (full control)",
			DescriptionKey: "Show only Dragon Lab and allow its configuration, consoles, scripts, and factory reset.",
		}, {Action: "desktop", LabelKey: "Debian desktop", DescriptionKey: "Debian desktop"}},
	})
}
