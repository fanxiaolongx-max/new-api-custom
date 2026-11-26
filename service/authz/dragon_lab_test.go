package authz

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestDragonLabDelegationDoesNotGrantRootOrOtherSensitivePermissions(t *testing.T) {
	db := newAuthzTestDB(t)
	require.NoError(t, Init(db))
	assert.True(t, Can(1, common.RoleRootUser, DragonLabFull))
	assert.False(t, Can(5, common.RoleAdminUser, DragonLabFull))
	require.NoError(t, SetUserPermissions(5, PermissionsMap{"dragon_lab": {"full": true}}))
	assert.True(t, Can(5, common.RoleAdminUser, DragonLabFull))
	assert.False(t, Can(5, common.RoleAdminUser, DragonLabDesktop))
	require.NoError(t, SetUserPermissions(5, PermissionsMap{"dragon_lab": {"full": true, "desktop": true}}))
	assert.True(t, Can(5, common.RoleAdminUser, DragonLabDesktop))
	assert.False(t, Can(6, common.RoleAdminUser, DragonLabFull))
	assert.False(t, Can(5, common.RoleCommonUser, DragonLabFull))
	assert.False(t, Can(5, common.RoleAdminUser, ChannelSensitiveWrite))
	assert.False(t, Can(5, common.RoleAdminUser, ChannelSecretView))
	require.NoError(t, SetUserPermissions(5, PermissionsMap{"dragon_lab": {"full": false}}))
	assert.False(t, Can(5, common.RoleAdminUser, DragonLabFull))
	assert.True(t, Can(1, common.RoleRootUser, DragonLabFull))
}
