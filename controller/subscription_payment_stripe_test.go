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
package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v81"
)

func TestNewStripeSubscriptionSessionParamsCreatesCustomerImplicitly(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://example.com"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	params := newStripeSubscriptionSessionParams("sub_ref_123", "", "user@example.com", "price_123")

	require.NotNil(t, params.Mode)
	assert.Equal(t, string(stripe.CheckoutSessionModeSubscription), *params.Mode)
	assert.Nil(t, params.Customer)
	assert.Nil(t, params.CustomerCreation)
	require.NotNil(t, params.CustomerEmail)
	assert.Equal(t, "user@example.com", *params.CustomerEmail)
	require.Len(t, params.LineItems, 1)
	require.NotNil(t, params.LineItems[0].Price)
	assert.Equal(t, "price_123", *params.LineItems[0].Price)
}

func TestNewStripeSubscriptionSessionParamsReusesExistingCustomer(t *testing.T) {
	params := newStripeSubscriptionSessionParams("sub_ref_123", "cus_123", "user@example.com", "price_123")

	require.NotNil(t, params.Customer)
	assert.Equal(t, "cus_123", *params.Customer)
	assert.Nil(t, params.CustomerEmail)
	assert.Nil(t, params.CustomerCreation)
}
