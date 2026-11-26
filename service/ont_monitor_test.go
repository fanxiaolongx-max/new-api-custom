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
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestONTConfigRejectsUnboundedPollingAndNonRouterOrigins(t *testing.T) {
	valid := ONTConfig{Address: "https://192.168.100.1", IntervalSeconds: 300, Username: "admin", Enabled: true}
	require.NoError(t, validateONTConfig(valid))
	for _, address := range []string{"https://example.com", "http://127.0.0.1", "http://169.254.169.254", "file:///etc/passwd", "https://admin:secret@192.168.100.1", "http://192.168.100.1:3000", "https://192.168.100.1/secret", "https://192.168.100.1?x=1"} {
		t.Run(address, func(t *testing.T) {
			config := valid
			config.Address = address
			assert.Error(t, validateONTConfig(config))
		})
	}
	for _, interval := range []int{-1, 0, 59, 86401} {
		config := valid
		config.IntervalSeconds = interval
		assert.Error(t, validateONTConfig(config))
	}
}

func TestONTReadScopeRejectsOperationsAndOffDeviceURLs(t *testing.T) {
	assert.True(t, safeONTPage("/html/amp/wlaninfo/wlaninfo.asp?5G"))
	for _, path := range []string{"https://example.com/html/a.asp", "//example.com/html/a.asp", "/html/../login.asp", "/html/ssmp/reboot/reboot.asp", "/html/config.asp?apply=1", "/html/diagnose/ping.asp", "/login.cgi"} {
		assert.False(t, safeONTPage(path), path)
	}
}

func TestONTExtractorReadsFirmwareDataWithoutExecutingScriptsOrExposingSecrets(t *testing.T) {
	source := `<table><tr><td>RX power</td><td>-21.3 dBm</td></tr><tr><td>WiFi Password</td><td>wifi-secret</td></tr></table>
<input id="SSID" type="text" value="Dragon WiFi"><input id="Password" type="text" value="wifi-secret"><input id="token" type="hidden" value="csrf-secret"><input id="WPSPIN" type="text" value="87654321">
<script>
function Device(sn,rx,pwd,psk){this.SerialNumber=sn;this.RxPower=rx;this.Password=pwd;this.PreSharedKey=psk;}
var info = new Device('HW123','-21.3','admin-secret','wifi-secret');
function Entry(name,value){this.Name=name;this.Value=value;}
var secret = new Entry('ConnectionRequestPassword','acs-secret');
function Setting(domain,value){this.Domain=domain;this.Value=value;}
var setting = new Setting('Device.WLAN.NetworkKey','opaque-sensitive-value');
var ProductName='HG8145V5';
fetch('https://example.com/leak');
var invalid = new Device('NO', dangerous(), 'NO', 'NO');
</script>`
	records := extractONTRecords(source, "admin-secret")
	encoded, err := common.Marshal(records)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), "-21.3")
	assert.Contains(t, string(encoded), "Dragon WiFi")
	assert.Contains(t, string(encoded), "HW123")
	assert.Contains(t, string(encoded), "HG8145V5")
	for _, secret := range []string{"wifi-secret", "admin-secret", "acs-secret", "csrf-secret", "example.com", "dangerous", "87654321", "opaque-sensitive-value"} {
		assert.NotContains(t, string(encoded), secret)
	}
}

func TestONTLiteralParserPreservesZeroAndEscapesAndRejectsExpressions(t *testing.T) {
	values, ok := ontLiteralArguments(`'a,b',0,false,null,'\x48\u0057',"quoted\"value"`)
	require.True(t, ok)
	assert.Equal(t, []string{"a,b", "0", "false", "", "HW", `quoted"value`}, values)
	for _, source := range []string{`'x', fetch('bad')`, `window.password`, `'unterminated`, `0,`} {
		_, ok := ontLiteralArguments(source)
		assert.False(t, ok, source)
	}
}

func TestONTCollectionAuthenticatesOnceAndReusesSession(t *testing.T) {
	logins, unexpected := 0, []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			fmt.Fprint(w, `var LockLeftTime = '0';`)
		case "/asp/GetRandCount.asp":
			assert.Equal(t, http.MethodPost, r.Method)
			fmt.Fprint(w, "\ufeff0123456789abcdef0123456789abcdef")
		case "/login.cgi":
			logins++
			require.NoError(t, r.ParseForm())
			assert.Equal(t, "admin", r.Form.Get("UserName"))
			assert.Equal(t, base64.StdEncoding.EncodeToString([]byte("test-password")), r.Form.Get("PassWord"))
			assert.Equal(t, "0123456789abcdef0123456789abcdef", r.Form.Get("x.X_HW_Token"))
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "valid", Path: "/"})
			w.WriteHeader(http.StatusFound)
		case "/index.asp":
			cookie, err := r.Cookie("session")
			if err != nil || cookie.Value != "valid" {
				w.WriteHeader(403)
				return
			}
			fmt.Fprint(w, `<iframe id="menuIframe"></iframe><script src="/menu.js?v=1"></script>`)
		case "/menu.js":
			fmt.Fprint(w, `var menu=['html/ssmp/status/status.asp','/html/ssmp/reboot/reboot.asp'];`)
		case "/html/ssmp/status/status.asp":
			fmt.Fprint(w, `<table><tr><td>Model</td><td>HG8145V5</td></tr></table>`)
		default:
			if strings.HasPrefix(r.URL.Path, "/html/") && !strings.Contains(r.URL.Path, "reboot") {
				w.WriteHeader(404)
				return
			}
			unexpected = append(unexpected, r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	client := newONTClient(ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL, Username: "admin"}, Password: "test-password"})
	for range 2 {
		pages, code := client.collect(context.Background())
		assert.Equal(t, "partial", code)
		found := false
		for _, page := range pages {
			if page.Path == "/html/ssmp/status/status.asp" {
				assert.NotEmpty(t, page.Records)
				found = true
			}
		}
		assert.True(t, found)
	}
	assert.Equal(t, 1, logins)
	assert.Empty(t, unexpected)
}

func TestONTLoginBusyBacksOffAndKeepsLastSuccessfulSnapshot(t *testing.T) {
	initONTTestDatabase(t)
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		switch r.URL.Path {
		case "/asp/GetRandCount.asp":
			fmt.Fprint(w, "0123456789abcdef")
		case "/login.cgi":
			fmt.Fprint(w, `<title>Failed</title><script>PrompterDes['s1321'];</script>`)
		default:
			fmt.Fprint(w, `var LockLeftTime = '0';`)
		}
	}))
	defer server.Close()
	config := ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL, Username: "admin", Enabled: true, IntervalSeconds: 60}, Password: "test-password"}
	m := &ontMonitor{loaded: true, config: config, client: newONTClient(config), view: ONTOverview{LastSuccess: 100, Pages: []ONTPage{{Path: "old", Records: []ONTRecord{{Name: "Model", Fields: map[string]string{"Model": "HG8145V5"}}}}}}}
	m.poll()
	assert.Equal(t, "error", m.view.State)
	assert.Equal(t, "login_busy", m.view.Error)
	assert.Equal(t, int64(100), m.view.LastSuccess)
	assert.Len(t, m.view.Pages, 1)
	assert.GreaterOrEqual(t, m.view.NextPoll, time.Now().Add(14*time.Minute).Unix())
	count := requests
	m.poll()
	assert.Equal(t, count, requests)
}

func TestONTClientRejectsRedirectsWithoutSendingCredentialsOffDevice(t *testing.T) {
	otherRequests := 0
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { otherRequests++ }))
	defer other.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	client := newONTClient(ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL}})
	_, status, err := client.request(context.Background(), http.MethodPost, "/login.cgi", nil)
	require.NoError(t, err)
	assert.Equal(t, 307, status)
	assert.Zero(t, otherRequests)
}

func TestONTFailedPagesDoNotReplaceTheLastSuccessfulData(t *testing.T) {
	initONTTestDatabase(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/index.asp" {
			fmt.Fprint(w, `<iframe id="menuIframe"></iframe>`)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	config := ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL, Enabled: true, IntervalSeconds: 300}}
	client := newONTClient(config)
	client.authenticated = true
	previous := []ONTPage{{Path: "/html/amp/opticinfo/opticinfo.asp", Records: []ONTRecord{{Name: "Optics", Fields: map[string]string{"RxPower": "-21.3"}}}}}
	m := &ontMonitor{loaded: true, config: config, client: client, view: ONTOverview{LastSuccess: 100, Pages: previous}}
	m.poll()
	assert.Equal(t, "error", m.view.State)
	assert.Equal(t, int64(100), m.view.LastSuccess)
	assert.Equal(t, previous, m.view.Pages)
	assert.NotEmpty(t, m.view.Failures)
	assert.Equal(t, "unavailable", m.view.Failures[0].Error)
}

func TestONTManualRefreshHonorsLoginBackoffAndMinimumGap(t *testing.T) {
	oldMonitor := opticalMonitor
	t.Cleanup(func() { opticalMonitor = oldMonitor })
	now := time.Now().Unix()
	for _, tc := range []struct {
		name        string
		enabled     bool
		state       string
		code        string
		lastAttempt int64
		nextPoll    int64
		allowed     bool
	}{
		{name: "disabled", state: "disabled"},
		{name: "collection running", enabled: true, state: "collecting"},
		{name: "minimum gap", enabled: true, state: "ok", lastAttempt: now - 10},
		{name: "login cooldown", enabled: true, state: "error", code: "login_busy", lastAttempt: now - 100, nextPoll: now + 800},
		{name: "manual refresh before scheduled poll", enabled: true, state: "ok", lastAttempt: now - 100, nextPoll: now + 500, allowed: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			opticalMonitor = &ontMonitor{loaded: true, wake: make(chan struct{}, 1), config: ontStoredConfig{ONTConfig: ONTConfig{Enabled: tc.enabled}}, view: ONTOverview{State: tc.state, Error: tc.code, LastAttempt: tc.lastAttempt, NextPoll: tc.nextPoll}}
			err := QueueONTRefresh()
			if tc.allowed {
				require.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

func TestONTSelfSignedCertificateRequiresExplicitOptIn(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "OK") }))
	defer server.Close()
	config := ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL}}
	client := newONTClient(config)
	_, _, err := client.request(context.Background(), http.MethodGet, "/", nil)
	assert.Error(t, err)
	config.InsecureTLS = true
	client = newONTClient(config)
	_, status, err := client.request(context.Background(), http.MethodGet, "/", nil)
	require.NoError(t, err)
	assert.Equal(t, 200, status)
}

func TestONTSettingsAreEncryptedPreserveBlankPasswordAndSurviveReload(t *testing.T) {
	t.Setenv("CRYPTO_SECRET", "test-secret")
	oldDB, oldMonitor := model.DB, opticalMonitor
	t.Cleanup(func() { model.DB = oldDB; opticalMonitor = oldMonitor })
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.ONTObservation{}, &model.ONTSnapshot{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	opticalMonitor = &ontMonitor{wake: make(chan struct{}, 1)}
	password := "test-password"
	input := ONTConfigInput{ONTConfig: ONTConfig{Address: "https://192.168.100.1", Username: "admin", Enabled: true, IntervalSeconds: 300}, Password: &password}
	require.NoError(t, SaveONTConfig(input))
	client := newONTClient(opticalMonitor.config)
	opticalMonitor.client = client
	opticalMonitor.view.State = "error"
	opticalMonitor.view.Error = "login_busy"
	opticalMonitor.view.NextPoll = time.Now().Add(15 * time.Minute).Unix()
	backoff := opticalMonitor.view.NextPoll
	stored, err := model.GetONTMonitorSecret()
	require.NoError(t, err)
	assert.NotContains(t, stored, password)
	input.Password = nil
	input.IntervalSeconds = 600
	require.NoError(t, SaveONTConfig(input))
	assert.Same(t, client, opticalMonitor.client, "interval edits must preserve the device session")
	assert.Equal(t, backoff, opticalMonitor.view.NextPoll, "interval edits must not bypass login backoff")
	opticalMonitor = &ontMonitor{wake: make(chan struct{}, 1)}
	view, err := GetONTOverview()
	require.NoError(t, err)
	assert.True(t, view.Config.PasswordSet)
	assert.Equal(t, 600, view.Config.IntervalSeconds)
	assert.Equal(t, password, opticalMonitor.config.Password)
	encoded, err := common.Marshal(view)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), password)
	stored, err = model.GetONTMonitorSecret()
	require.NoError(t, err)
	decoded, err := base64.StdEncoding.DecodeString(stored)
	require.NoError(t, err)
	decoded[len(decoded)-1] ^= 1
	_, err = decryptONTConfig(base64.StdEncoding.EncodeToString(decoded))
	assert.Error(t, err)
}

func TestONTClientReadsReferencedWANDataSourcesAndIgnoresOtherScripts(t *testing.T) {
	requested := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested[r.URL.Path]++
		switch r.URL.Path {
		case "/index.asp":
			fmt.Fprint(w, `<iframe id="menuIframe"></iframe>`)
		case "/html/bbsp/waninfo/waninfo.asp":
			fmt.Fprint(w, `<script src="../common/wan_dynamicinfo.asp"></script><script src="../common/wan_staticinfo.asp?123"></script><script src="https://example.com/html/bbsp/common/wan_dynamicinfo.asp"></script><script src="/html/reboot.asp"></script>`)
		case "/html/bbsp/common/wan_dynamicinfo.asp":
			fmt.Fprint(w, `function WanPPPDynamic(domain,ConnectionStatus,IPAddress,dnsstr){this.domain=domain;} var rows = [new WanPPPDynamic('wan.1','Connected','203.0.113.21','1.1.1.1,8.8.8.8')];`)
		case "/html/bbsp/common/wan_staticinfo.asp":
			fmt.Fprint(w, `function wanStaticInfoArray(domain,Name,ServiceList,ExServiceList,Username){if (Name) {this.Name=Name;}this.domain=domain;}var rows=[new wanStaticInfoArray('wan.1','INTERNET','INTERNET','','private-user','ignored-extra')];`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	client := newONTClient(ontStoredConfig{ONTConfig: ONTConfig{Address: server.URL}})
	client.authenticated = true
	pages, _ := client.collect(context.Background())
	point := buildONTPoint(pages, 100, "", nil)
	require.NotNil(t, point.Online)
	assert.True(t, *point.Online)
	assert.Equal(t, "203.0.113.21", point.InternetIP)
	assert.Equal(t, 1, requested["/html/bbsp/common/wan_dynamicinfo.asp"])
	assert.Equal(t, 1, requested["/html/bbsp/common/wan_staticinfo.asp"])
	assert.Zero(t, requested["/html/reboot.asp"])
	encoded, err := common.Marshal(pages)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "private-user")
	assert.Contains(t, string(encoded), "1.1.1.1,8.8.8.8")
}
