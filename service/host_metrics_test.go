/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHostMetricsCollection(t *testing.T) {
	metrics := CollectHostMetricsSample()

	require.NotEmpty(t, metrics.Host.OS)
	require.NotEmpty(t, metrics.Host.Arch)
	assert.Greater(t, metrics.CPU.LogicalCores, 0)
	assert.Greater(t, metrics.Process.NumGoroutines, 0)
	assert.Greater(t, metrics.UpdatedTime, int64(0))

	overview := GetSystemHostMetricsOverview()
	assert.GreaterOrEqual(t, len(overview.History), 1)
	assert.Equal(t, overview.Current.Timestamp, overview.UpdatedTime)
}
