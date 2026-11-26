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
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type ONTConfig struct {
	Enabled         bool   `json:"enabled"`
	Address         string `json:"address"`
	Username        string `json:"username"`
	IntervalSeconds int    `json:"interval_seconds"`
	InsecureTLS     bool   `json:"insecure_tls"`
	PasswordSet     bool   `json:"password_set"`
}

type ONTConfigInput struct {
	ONTConfig
	Password *string `json:"password,omitempty"`
}

type ontStoredConfig struct {
	ONTConfig
	Password string `json:"password"`
}

type ONTRecord struct {
	Name   string            `json:"name"`
	Fields map[string]string `json:"fields"`
}

type ONTPage struct {
	Path    string      `json:"path"`
	Records []ONTRecord `json:"records"`
	Error   string      `json:"error,omitempty"`
}

type ONTOverview struct {
	Config       ONTConfig `json:"config"`
	State        string    `json:"state"`
	Error        string    `json:"error,omitempty"`
	LastAttempt  int64     `json:"last_attempt"`
	LastSuccess  int64     `json:"last_success"`
	NextPoll     int64     `json:"next_poll"`
	Pages        []ONTPage `json:"pages"`
	Failures     []ONTPage `json:"failures,omitempty"`
	Current      *ONTPoint `json:"current,omitempty"`
	HistoryError bool      `json:"history_error"`
}

type ontMonitor struct {
	mu       sync.Mutex
	config   ontStoredConfig
	loaded   bool
	client   *ontClient
	view     ONTOverview
	wake     chan struct{}
	previous *ONTPoint
}

var opticalMonitor = &ontMonitor{wake: make(chan struct{}, 1)}
var opticalMonitorOnce sync.Once

func validateONTConfig(config ONTConfig) error {
	u, err := url.Parse(config.Address)
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return errors.New("ONT address must be an HTTP(S) origin with a private IPv4 address")
	}
	ip := net.ParseIP(u.Hostname())
	if ip == nil || ip.To4() == nil || !ip.IsPrivate() {
		return errors.New("ONT address must use a private IPv4 address")
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return errors.New("ONT address must use port 80 or 443")
	}
	if config.IntervalSeconds < 60 || config.IntervalSeconds > 86400 {
		return errors.New("ONT polling interval must be between 60 and 86400 seconds")
	}
	if len(config.Username) > 128 || (config.Enabled && strings.TrimSpace(config.Username) == "") {
		return errors.New("ONT username is required and must be at most 128 characters")
	}
	return nil
}

func ontCredentialCipher() (cipher.AEAD, error) {
	if os.Getenv("CRYPTO_SECRET") == "" && os.Getenv("SESSION_SECRET") == "" {
		return nil, errors.New("configure a persistent CRYPTO_SECRET or SESSION_SECRET first")
	}
	key := sha256.Sum256([]byte("new-api/ont-monitor/v1:" + common.CryptoSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func encryptONTConfig(config ontStoredConfig) (string, error) {
	aead, err := ontCredentialCipher()
	if err != nil {
		return "", err
	}
	data, err := common.Marshal(config)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, data, []byte("ONTMonitorSecret"))), nil
}

func decryptONTConfig(value string) (ontStoredConfig, error) {
	var config ontStoredConfig
	aead, err := ontCredentialCipher()
	if err != nil {
		return config, err
	}
	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(data) < aead.NonceSize() {
		return config, errors.New("invalid ONT settings")
	}
	plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], []byte("ONTMonitorSecret"))
	if err != nil {
		return config, errors.New("cannot decrypt ONT settings; check the deployment secret")
	}
	err = common.Unmarshal(plain, &config)
	return config, err
}

func (m *ontMonitor) loadLocked() error {
	if m.loaded {
		return nil
	}
	value, err := model.GetONTMonitorSecret()
	if err != nil {
		return err
	}
	config := ontStoredConfig{ONTConfig: ONTConfig{Address: "https://192.168.100.1", IntervalSeconds: 300}}
	if value != "" {
		config, err = decryptONTConfig(value)
		if err != nil {
			return err
		}
		if err = validateONTConfig(config.ONTConfig); err != nil {
			return err
		}
	}
	config.PasswordSet = config.Password != ""
	m.config, m.loaded = config, true
	m.view = ONTOverview{Config: config.ONTConfig, State: "disabled", Pages: []ONTPage{}}
	if config.Enabled {
		m.view.State = "pending"
	}
	if value != "" {
		target := ontHistoryTarget(config.ONTConfig)
		snapshot, err := model.GetONTSnapshot(target)
		if err != nil {
			m.loaded = false
			return err
		}
		if snapshot != nil {
			var saved ontSavedSnapshot
			if err = common.UnmarshalJsonStr(snapshot.Payload, &saved); err != nil {
				m.loaded = false
				return err
			}
			m.view.Pages, m.view.LastSuccess = saved.Pages, saved.LastSuccess
		}
		last, err := model.GetONTLastObservation(target)
		if err != nil {
			m.loaded = false
			return err
		}
		if last != nil {
			var point ONTPoint
			if err = common.UnmarshalJsonStr(last.Payload, &point); err != nil {
				m.loaded = false
				return err
			}
			m.previous = &point
			m.view.Current = &point
			m.view.LastAttempt = point.Timestamp
		}
	}
	return nil
}

func GetONTOverview() (ONTOverview, error) {
	opticalMonitor.mu.Lock()
	defer opticalMonitor.mu.Unlock()
	if err := opticalMonitor.loadLocked(); err != nil {
		return ONTOverview{}, err
	}
	return opticalMonitor.view, nil
}

func SaveONTConfig(input ONTConfigInput) error {
	input.Address = strings.TrimRight(strings.TrimSpace(input.Address), "/")
	input.Username = strings.TrimSpace(input.Username)
	if err := validateONTConfig(input.ONTConfig); err != nil {
		return err
	}
	m := opticalMonitor
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.loadLocked(); err != nil {
		return err
	}
	if m.view.State == "collecting" {
		return errors.New("wait for the current ONT collection to finish")
	}
	config := ontStoredConfig{ONTConfig: input.ONTConfig, Password: m.config.Password}
	if input.Password != nil && *input.Password != "" {
		config.Password = *input.Password
	}
	if len(config.Password) > 256 || (config.Enabled && config.Password == "") {
		return errors.New("ONT password is required and must be at most 256 characters")
	}
	config.PasswordSet = config.Password != ""
	value, err := encryptONTConfig(config)
	if err != nil {
		return err
	}
	if err = model.SaveONTMonitorSecret(value); err != nil {
		return errors.New("could not save ONT settings")
	}
	connectionChanged := config.Address != m.config.Address || config.Username != m.config.Username || config.Password != m.config.Password || config.InsecureTLS != m.config.InsecureTLS
	if connectionChanged && m.client != nil {
		m.client.http.CloseIdleConnections()
		m.client = nil
	}
	if connectionChanged {
		m.view = ONTOverview{State: "pending", Pages: []ONTPage{}}
		m.previous = nil
	}
	if !config.Enabled {
		m.view.State = "disabled"
	} else if !m.config.Enabled || connectionChanged {
		m.view.State = "pending"
	}
	m.config = config
	m.view.Config = config.ONTConfig
	select {
	case m.wake <- struct{}{}:
	default:
	}
	return nil
}

// Manual refresh never bypasses the minimum polling interval or login backoff.
func QueueONTRefresh() error {
	m := opticalMonitor
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.loadLocked(); err != nil {
		return err
	}
	if !m.config.Enabled {
		return errors.New("enable ONT monitoring first")
	}
	now := time.Now().Unix()
	loginBackoff := m.view.Error == "authentication" || m.view.Error == "login_busy" || m.view.Error == "locked"
	if m.view.State == "collecting" || now < m.view.LastAttempt+60 || (loginBackoff && now < m.view.NextPoll) {
		return errors.New("ONT collection is already running or waiting for the next poll")
	}
	m.view.NextPoll = now
	select {
	case m.wake <- struct{}{}:
	default:
	}
	return nil
}

func StartONTMonitor() {
	if !common.IsMasterNode {
		return
	}
	opticalMonitorOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			for {
				opticalMonitor.poll()
				select {
				case <-ticker.C:
				case <-opticalMonitor.wake:
				}
			}
		}()
	})
}

func (m *ontMonitor) poll() {
	m.mu.Lock()
	if err := m.loadLocked(); err != nil {
		m.mu.Unlock()
		return
	}
	if !m.config.Enabled || m.view.State == "collecting" || time.Now().Unix() < m.view.NextPoll {
		m.mu.Unlock()
		return
	}
	config := m.config
	if m.client == nil {
		m.client = newONTClient(config)
	}
	client := m.client
	m.view.State, m.view.LastAttempt = "collecting", time.Now().Unix()
	m.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	pages, code := client.collect(ctx)
	cancel()
	m.mu.Lock()
	m.view.State, m.view.Error = "error", code
	m.view.Failures = nil
	m.view.NextPoll = time.Now().Add(time.Duration(config.IntervalSeconds) * time.Second).Unix()
	if code == "authentication" || code == "login_busy" || code == "locked" {
		backoff := time.Now().Add(15 * time.Minute).Unix()
		if backoff > m.view.NextPoll {
			m.view.NextPoll = backoff
		}
	}
	if len(pages) > 0 {
		usable := false
		for _, page := range pages {
			if len(page.Records) > 0 {
				usable = true
				m.view.LastSuccess = time.Now().Unix()
				m.view.State = "ok"
				if code != "" {
					m.view.State = "partial"
				}
				break
			}
		}
		if usable || m.view.LastSuccess == 0 {
			m.view.Pages = pages
		} else {
			// Keep the actual last successful snapshot, while exposing the latest
			// per-page failures separately rather than replacing data with blanks.
			m.view.Failures = pages
		}
	}
	point := buildONTPoint(pages, time.Now().Unix(), code, m.previous)
	m.previous = &point
	m.view.Current = &point
	target := ontHistoryTarget(config.ONTConfig)
	encoded, err := common.Marshal(point)
	var snapshot *model.ONTSnapshot
	if point.Collected {
		var data []byte
		data, err = common.Marshal(ontSavedSnapshot{Pages: m.view.Pages, LastSuccess: m.view.LastSuccess})
		if err == nil {
			snapshot = &model.ONTSnapshot{Target: target, Timestamp: point.Timestamp, Payload: string(data)}
		}
	}
	m.mu.Unlock()
	if err == nil {
		err = model.SaveONTObservation(&model.ONTObservation{Target: target, Timestamp: point.Timestamp, HasEvents: len(point.Events) > 0, Payload: string(encoded)}, snapshot)
	}
	if err != nil {
		common.SysError("could not persist ONT monitoring history")
	}
	m.mu.Lock()
	if ontHistoryTarget(m.config.ONTConfig) == target {
		m.view.HistoryError = err != nil
	}
	m.mu.Unlock()
}
