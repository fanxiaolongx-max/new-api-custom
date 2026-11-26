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
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func initONTTestDatabase(t *testing.T) {
	t.Helper()
	old := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.ONTObservation{}, &model.ONTSnapshot{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { model.DB = old; require.NoError(t, sqlDB.Close()) })
}

func TestONTTelemetryUsesMeasuredUnitsAndSelectsInternetInsteadOfManagementWAN(t *testing.T) {
	pages := []ONTPage{
		{Path: "/html/amp/opticinfo/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"RxPower": "-21.37 dBm", "TxPower": "2.45", "Temperature": "38.2 °C", "Voltage": "3300 mV", "BiasCurrent": "12.4 mA"}}}},
		{Path: "/html/bbsp/waninfo/waninfo.asp", Records: []ONTRecord{
			{Name: "WAN", Fields: map[string]string{"Domain": "wan.1", "Name": "TR069", "ServiceList": "TR069", "ExternalIPAddress": "10.0.0.5", "ConnectionStatus": "Connected"}},
			{Name: "WAN", Fields: map[string]string{"Domain": "wan.2", "Name": "INTERNET", "ServiceList": "INTERNET", "ExternalIPAddress": "203.0.113.5", "ConnectionStatus": "Connected"}},
		}},
	}
	point := buildONTPoint(pages, 100, "", nil)
	require.NotNil(t, point.RXPower)
	assert.InDelta(t, -21.37, *point.RXPower, 0.001)
	require.NotNil(t, point.TXPower)
	assert.InDelta(t, 2.45, *point.TXPower, 0.001)
	require.NotNil(t, point.Voltage)
	assert.InDelta(t, 3.3, *point.Voltage, 0.001)
	assert.Equal(t, "203.0.113.5", point.InternetIP)
	require.NotNil(t, point.Online)
	assert.True(t, *point.Online)
	assert.Contains(t, point.Sources["rx_power"], "opticinfo.asp")
	firmware := buildONTPoint([]ONTPage{{Path: "/html/amp/opticinfo/opticinfo.asp", Records: []ONTRecord{{Name: "stOpticInfo", Fields: map[string]string{"revOpticPower": "-14.92", "transOpticPower": "2.36", "voltage": "3274", "LosStatus": "0", "domain": "InternetGatewayDevice.X_HW_DEBUG.AMP.Optic"}}}}}, 101, "", nil)
	require.NotNil(t, firmware.RXPower)
	assert.InDelta(t, -14.92, *firmware.RXPower, 0.001)
	require.NotNil(t, firmware.TXPower)
	assert.InDelta(t, 2.36, *firmware.TXPower, 0.001)
	require.NotNil(t, firmware.Voltage)
	assert.InDelta(t, 3.274, *firmware.Voltage, 0.0001)
	assert.True(t, firmware.AlarmReported)
	assert.Empty(t, firmware.ActiveAlarms)
	for _, value := range []string{"-2137", "NaN", "+Inf", "--", "2.5 V"} {
		assert.Nil(t, ontReading(value, -80, 20, "dbm"), value)
	}
}

func TestONTTelemetryMarksPowerShiftsIPChangesAndLinkTransitionsWithEvidence(t *testing.T) {
	old := buildONTPoint([]ONTPage{
		{Path: "/html/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"RxPower": "-20"}}}},
		{Path: "/html/waninfo.asp", Records: []ONTRecord{{Name: "WAN", Fields: map[string]string{"Domain": "wan.1", "Name": "INTERNET", "IPAddress": "203.0.113.1", "ConnectionStatus": "Connected"}}}},
	}, 100, "", nil)
	point := buildONTPoint([]ONTPage{
		{Path: "/html/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"RxPower": "-24.5"}}}},
		{Path: "/html/waninfo.asp", Records: []ONTRecord{{Name: "WAN", Fields: map[string]string{"Domain": "wan.1", "Name": "INTERNET", "IPAddress": "203.0.113.2", "ConnectionStatus": "Disconnected"}}}},
	}, 160, "", &old)
	kinds := map[string]ONTEvent{}
	for _, event := range point.Events {
		kinds[event.Kind] = event
	}
	require.Contains(t, kinds, "optical_shift")
	assert.Equal(t, "-20.00", kinds["optical_shift"].Previous)
	assert.Equal(t, "-24.50", kinds["optical_shift"].Current)
	require.Contains(t, kinds, "ip_changed")
	assert.Equal(t, "203.0.113.1", kinds["ip_changed"].Previous)
	require.Contains(t, kinds, "link_down")
	assert.Equal(t, "critical", kinds["link_down"].Severity)
}

func TestONTTelemetryKeepsUnknownStatesAndCollectionFailuresOutOfOutageData(t *testing.T) {
	connected := true
	previous := ONTPoint{Timestamp: 100, Collected: true, Online: &connected, WAN: []ONTWANState{{ID: "wan", Online: &connected, Status: "Connected"}}}
	failed := buildONTPoint(nil, 160, "connection", &previous)
	assert.False(t, failed.Collected)
	assert.Nil(t, failed.Online)
	assert.Nil(t, failed.RXPower)
	require.Len(t, failed.Events, 1)
	assert.Equal(t, "collection_failed", failed.Events[0].Kind)
	unknown := buildONTPoint([]ONTPage{{Path: "/html/waninfo.asp", Records: []ONTRecord{{Name: "WAN", Fields: map[string]string{"Status": "1"}}}}}, 220, "", &failed)
	assert.Nil(t, unknown.Online)
	require.Len(t, unknown.Events, 1)
	assert.Equal(t, "collection_recovered", unknown.Events[0].Kind)
}

func TestONTIPAddressChangesRemainDetectableAfterAnEmptyOutageReading(t *testing.T) {
	old := ONTPoint{Timestamp: 100, Collected: true, KnownIPs: map[string]string{"wan.1": "203.0.113.1"}}
	down := buildONTPoint([]ONTPage{{Path: "/html/waninfo.asp", Records: []ONTRecord{{Name: "WAN", Fields: map[string]string{"Domain": "wan.1", "Name": "INTERNET", "IPAddress": "0.0.0.0", "ConnectionStatus": "Disconnected"}}}}}, 160, "", &old)
	assert.Empty(t, down.InternetIP)
	up := buildONTPoint([]ONTPage{{Path: "/html/waninfo.asp", Records: []ONTRecord{{Name: "WAN", Fields: map[string]string{"Domain": "wan.1", "Name": "INTERNET", "IPAddress": "203.0.113.2", "ConnectionStatus": "Connected"}}}}}, 220, "", &down)
	found := false
	for _, event := range up.Events {
		if event.Kind == "ip_changed" {
			found = true
			assert.Equal(t, "203.0.113.1", event.Previous)
			assert.Equal(t, "203.0.113.2", event.Current)
		}
	}
	assert.True(t, found)
}

func TestONTTelemetryRecordsAnActiveDeviceAlarmOnceUntilItClears(t *testing.T) {
	pages := []ONTPage{{Path: "/html/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"LOS": "1"}}}}}
	first := buildONTPoint(pages, 100, "", nil)
	require.Len(t, first.Events, 1)
	second := buildONTPoint(pages, 160, "", &first)
	assert.Empty(t, second.Events)
	assert.Len(t, second.ActiveAlarms, 1)
	third := buildONTPoint(pages, 220, "", &second)
	assert.Empty(t, third.Events)
	clear := buildONTPoint([]ONTPage{{Path: "/html/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"LOS": "0"}}}}}, 280, "", &third)
	assert.Empty(t, clear.ActiveAlarms)
	again := buildONTPoint(pages, 340, "", &clear)
	require.Len(t, again.Events, 1)
	assert.Equal(t, "device_alarm", again.Events[0].Kind)
}

func TestONTHistoryRetainsEventPointsWhileReducingDisplayAndExpiresOldSamples(t *testing.T) {
	initONTTestDatabase(t)
	target := "router"
	now := time.Now().Unix()
	rows := make([]model.ONTObservation, 0, 650)
	for i := 0; i < 650; i++ {
		point := ONTPoint{Timestamp: now - int64(650-i)*60, Collected: true, Events: []ONTEvent{}}
		if i == 321 {
			point.Events = []ONTEvent{{ID: "important", Timestamp: point.Timestamp, Kind: "ip_changed", Severity: "info"}}
		}
		payload, err := common.Marshal(point)
		require.NoError(t, err)
		rows = append(rows, model.ONTObservation{Target: target, Timestamp: point.Timestamp, HasEvents: len(point.Events) > 0, Payload: string(payload)})
	}
	require.NoError(t, model.DB.CreateInBatches(rows, 100).Error)
	selected, total, err := model.GetONTObservations(target, now-86400)
	require.NoError(t, err)
	assert.Equal(t, 650, total)
	assert.LessOrEqual(t, len(selected), 601)
	found := false
	for _, row := range selected {
		if row.HasEvents {
			found = true
		}
	}
	assert.True(t, found, "marked observations must survive reduction")
	other, _, err := model.GetONTObservations("another-router", now-86400)
	require.NoError(t, err)
	assert.Empty(t, other)
	old := model.ONTObservation{Target: target, Timestamp: now - 31*86400, Payload: "{}"}
	require.NoError(t, model.DB.Create(&old).Error)
	last := model.ONTObservation{Target: target, Timestamp: now, Payload: "{}"}
	require.NoError(t, model.SaveONTObservation(&last, &model.ONTSnapshot{Target: target, Timestamp: now, Payload: `{"pages":[],"last_success":1}`}))
	var count int64
	require.NoError(t, model.DB.Model(&model.ONTObservation{}).Where("id = ?", old.ID).Count(&count).Error)
	assert.Zero(t, count)
	snapshot, err := model.GetONTSnapshot(target)
	require.NoError(t, err)
	require.NotNil(t, snapshot)
	assert.Equal(t, now, snapshot.Timestamp)
	loaded, err := model.GetONTLastObservation(target)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	assert.Equal(t, last.ID, loaded.ID)
}

func TestONTWarmStartLoadsTheDurableSnapshotAndLastObservation(t *testing.T) {
	initONTTestDatabase(t)
	t.Setenv("CRYPTO_SECRET", "history-test-secret")
	config := ontStoredConfig{ONTConfig: ONTConfig{Address: "https://192.168.100.1", Username: "admin", Enabled: true, IntervalSeconds: 300}, Password: "test-password"}
	encrypted, err := encryptONTConfig(config)
	require.NoError(t, err)
	require.NoError(t, model.SaveONTMonitorSecret(encrypted))
	now := time.Now().Unix()
	pages := []ONTPage{{Path: "/html/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"RxPower": "-21.5"}}}}}
	point := buildONTPoint(pages, now, "", nil)
	payload, err := common.Marshal(point)
	require.NoError(t, err)
	snapshot, err := common.Marshal(ontSavedSnapshot{Pages: pages, LastSuccess: now})
	require.NoError(t, err)
	target := ontHistoryTarget(config.ONTConfig)
	require.NoError(t, model.SaveONTObservation(&model.ONTObservation{Target: target, Timestamp: now, Payload: string(payload)}, &model.ONTSnapshot{Target: target, Timestamp: now, Payload: string(snapshot)}))
	m := &ontMonitor{wake: make(chan struct{}, 1)}
	require.NoError(t, m.loadLocked())
	assert.Equal(t, pages, m.view.Pages)
	assert.Equal(t, now, m.view.LastSuccess)
	require.NotNil(t, m.view.Current)
	require.NotNil(t, m.view.Current.RXPower)
	assert.Equal(t, -21.5, *m.view.Current.RXPower)
	assert.Equal(t, "pending", m.view.State, "persisted data is not a claim that a new poll succeeded")
}

func TestONTTrafficKeepsScopesSeparateAndPreservesMissingAndLargeCounters(t *testing.T) {
	pages := []ONTPage{
		{Path: "/html/bbsp/waninfo/waninfo.asp", Records: []ONTRecord{
			{Name: "WANStats", Fields: map[string]string{"domain": "wan.1.Stats", "rxBytes": "1024", "txBytes": "2048"}},
			{Name: "WANConnection", Fields: map[string]string{"domain": "wan.1", "Name": "INTERNET", "ServiceList": "INTERNET"}},
			{Name: "WANStats", Fields: map[string]string{"domain": "wan.2.Stats", "rxBytes": "18446744073709551615", "txBytes": "-1"}},
		}},
		{Path: "/html/amp/wlaninfo/wlaninfo.asp", Records: []ONTRecord{{Name: "stWlan", Fields: map[string]string{"domain": "wifi.1", "ssid": "Home"}}, {Name: "stPacketInfo", Fields: map[string]string{"domain": "wifi.1.Stats", "totalBytesReceived": "100", "totalBytesSent": "200"}}}},
		{Path: "/html/amp/wlaninfo/wlaninfo.asp?5G", Records: []ONTRecord{{Name: "stPacketInfo", Fields: map[string]string{"domain": "wifi.1.Stats", "totalBytesReceived": "100", "totalBytesSent": "200"}}}},
		{Path: "/html/amp/opticinfo/opticinfo.asp", Records: []ONTRecord{{Name: "stStats", Fields: map[string]string{"domain": "pon.1.Stats", "BytesReceived": "300", "BytesSent": "400"}}}},
	}
	point := buildONTPoint(pages, 100, "", nil)
	require.Len(t, point.Traffic, 4)
	assert.Equal(t, "wan", point.Traffic[0].Category)
	assert.Equal(t, "INTERNET", point.Traffic[0].Service)
	require.NotNil(t, point.Traffic[0].RXBytes)
	assert.Equal(t, uint64(1024), *point.Traffic[0].RXBytes)
	assert.Nil(t, point.Traffic[1].TXBytes)
	assert.Equal(t, "wlan", point.Traffic[2].Category)
	assert.Equal(t, "pon", point.Traffic[3].Category)
	encoded, err := common.Marshal(point.Traffic)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"rx_bytes":"18446744073709551615"`)
	assert.Contains(t, string(encoded), `"tx_bytes":null`)
}

func TestONTWANPathsAreNotEvidenceOfInternetService(t *testing.T) {
	point := buildONTPoint([]ONTPage{{Path: "/html/bbsp/waninfo/waninfo.asp", Records: []ONTRecord{
		{Name: "WANConnection", Fields: map[string]string{"domain": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1", "IPAddress": "10.0.0.1", "ConnectionStatus": "Connected"}},
		{Name: "WANConnection", Fields: map[string]string{"domain": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1", "IPAddress": "10.0.0.2", "ConnectionStatus": "Connected"}},
	}}}, 100, "", nil)
	require.Len(t, point.WAN, 2)
	assert.Nil(t, point.Online)
	assert.Empty(t, point.InternetIP)
}
