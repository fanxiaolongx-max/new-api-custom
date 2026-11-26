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
	"crypto/sha256"
	"fmt"
	"math"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type ONTWANState struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Service string `json:"service"`
	IP      string `json:"ip"`
	Status  string `json:"status"`
	Online  *bool  `json:"online"`
}

type ONTEvent struct {
	ID         string `json:"id"`
	Timestamp  int64  `json:"timestamp"`
	Kind       string `json:"kind"`
	Severity   string `json:"severity"`
	Metric     string `json:"metric,omitempty"`
	Connection string `json:"connection,omitempty"`
	Previous   string `json:"previous,omitempty"`
	Current    string `json:"current,omitempty"`
}

type ONTTrafficCounter struct {
	ID       string  `json:"id"`
	Category string  `json:"category"`
	Name     string  `json:"name"`
	Service  string  `json:"service"`
	Source   string  `json:"source"`
	RXBytes  *uint64 `json:"rx_bytes,string"`
	TXBytes  *uint64 `json:"tx_bytes,string"`
}

type ONTPoint struct {
	Traffic       []ONTTrafficCounter `json:"traffic"`
	Timestamp     int64               `json:"timestamp"`
	Collected     bool                `json:"collected"`
	RXPower       *float64            `json:"rx_power"`
	TXPower       *float64            `json:"tx_power"`
	Temperature   *float64            `json:"temperature"`
	Voltage       *float64            `json:"voltage"`
	BiasCurrent   *float64            `json:"bias_current"`
	Online        *bool               `json:"online"`
	InternetIP    string              `json:"internet_ip"`
	WAN           []ONTWANState       `json:"wan"`
	KnownIPs      map[string]string   `json:"known_ips"`
	Sources       map[string]string   `json:"sources"`
	Events        []ONTEvent          `json:"events"`
	ActiveAlarms  []string            `json:"active_alarms"`
	AlarmReported bool                `json:"alarm_reported"`
	Error         string              `json:"error,omitempty"`
}

type ONTHistory struct {
	Points        []ONTPoint `json:"points"`
	Events        []ONTEvent `json:"events"`
	TotalSamples  int        `json:"total_samples"`
	RetentionDays int        `json:"retention_days"`
	Downsampled   bool       `json:"downsampled"`
}

type ontSavedSnapshot struct {
	Pages       []ONTPage `json:"pages"`
	LastSuccess int64     `json:"last_success"`
}

var ontFieldPunctuation = regexp.MustCompile(`[^a-z0-9]`)
var ontNumericReading = regexp.MustCompile(`(?i)^\s*(-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*(dbm|°c|c|v|mv|ma)?\s*$`)

func ontFieldName(value string) string {
	return ontFieldPunctuation.ReplaceAllString(strings.ToLower(value), "")
}

func ontField(fields map[string]string, aliases ...string) (string, string) {
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, alias := range aliases {
		for _, key := range keys {
			if ontFieldName(key) == alias {
				return fields[key], key
			}
		}
	}
	return "", ""
}

func ontReading(value string, low, high float64, unit string) *float64 {
	match := ontNumericReading.FindStringSubmatch(strings.ReplaceAll(value, "−", "-"))
	if match == nil {
		return nil
	}
	n, err := strconv.ParseFloat(match[1], 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
		return nil
	}
	actualUnit := strings.ToLower(match[2])
	if actualUnit == "mv" && unit == "v" {
		n /= 1000
	} else if actualUnit != "" && actualUnit != unit && !(unit == "c" && actualUnit == "°c") {
		return nil
	}
	// Bare scaled integers have unknown units; retain them in the raw field
	// cards rather than guessing a scale or inventing a graph measurement.
	if n < low || n > high {
		return nil
	}
	return &n
}

func ontOnline(value string) *bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "connected", "up", "online", "active", "operational":
		v := true
		return &v
	case "disconnected", "down", "offline", "inactive":
		v := false
		return &v
	default:
		return nil
	}
}

func ontHistoryTarget(config ONTConfig) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(config.Address+"\x00"+config.Username)))
}

func buildONTPoint(pages []ONTPage, timestamp int64, code string, previous *ONTPoint) ONTPoint {
	point := ONTPoint{Timestamp: timestamp, WAN: []ONTWANState{}, Sources: map[string]string{}, Events: []ONTEvent{}, Error: code}
	point.Traffic = collectONTTraffic(pages)
	point.KnownIPs = map[string]string{}
	if previous != nil {
		for id, ip := range previous.KnownIPs {
			point.KnownIPs[id] = ip
		}
		for _, wan := range previous.WAN {
			if wan.IP != "" {
				point.KnownIPs[wan.ID] = wan.IP
			}
		}
	}
	seenWAN := map[string]bool{}
	for _, page := range pages {
		if len(page.Records) > 0 {
			point.Collected = true
		}
		for _, record := range page.Records {
			lowerPath := strings.ToLower(page.Path)
			if strings.Contains(lowerPath, "optic") {
				for _, metric := range []struct {
					name        string
					aliases     []string
					low, high   float64
					unit        string
					destination **float64
				}{
					{"rx_power", []string{"rxpower", "receivepower", "receivedpower", "rxopticalpower", "opticalrxpower", "revopticpower"}, -80, 20, "dbm", &point.RXPower},
					{"tx_power", []string{"txpower", "transmitpower", "txopticalpower", "opticaltxpower", "transopticpower"}, -80, 20, "dbm", &point.TXPower},
					{"temperature", []string{"temperature", "onttemperature", "optictemperature", "transceivertemperature"}, -50, 150, "c", &point.Temperature},
					{"voltage", []string{"voltage", "supplyvoltage", "workingvoltage"}, 0, 20, "v", &point.Voltage},
					{"bias_current", []string{"biascurrent", "bias", "txbiascurrent"}, 0, 200, "ma", &point.BiasCurrent},
				} {
					if *metric.destination != nil {
						continue
					}
					value, key := ontField(record.Fields, metric.aliases...)
					// HG8145 stOpticInfo displays its bare voltage field in mV.
					// Other record types still require explicit units or V range.
					if metric.name == "voltage" && record.Name == "stOpticInfo" && strings.Contains(record.Fields["domain"], "AMP.Optic") && ontNumericReading.MatchString(value) && !strings.ContainsAny(strings.ToLower(value), "vc") {
						value += " mV"
					}
					reading := ontReading(value, metric.low, metric.high, metric.unit)
					if reading != nil {
						*metric.destination = reading
						point.Sources[metric.name] = page.Path + " · " + key
					}
				}
			}
			if strings.Contains(lowerPath, "waninfo") {
				ip, _ := ontField(record.Fields, "externalipaddress", "ipaddress", "ipv4address", "ipv4ipaddress", "wanip")
				status, _ := ontField(record.Fields, "connectionstatus", "wanstatus", "status", "state")
				if ip == "" && status == "" {
					continue
				}
				name, _ := ontField(record.Fields, "connectionname", "wanname", "name", "interfacename")
				id, _ := ontField(record.Fields, "domain", "path", "instanceid")
				if id == "" {
					id = name
				}
				if id == "" {
					id = record.Name
				}
				if seenWAN[id] {
					continue
				}
				seenWAN[id] = true
				service, _ := ontField(record.Fields, "exservicelist", "servicelist", "xhwservicelist", "service", "servicetype")
				if service == "" {
					service, _ = ontField(record.Fields, "servicelist", "xhwservicelist", "service", "servicetype")
				}
				parsedIP := net.ParseIP(ip)
				if parsedIP == nil || parsedIP.IsUnspecified() {
					ip = ""
				}
				if name == "" {
					name = id
				}
				point.WAN = append(point.WAN, ONTWANState{ID: id, Name: name, Service: service, IP: ip, Status: status, Online: ontOnline(status)})
			}
			for name, value := range record.Fields {
				key := ontFieldName(name)
				if key != "los" && key != "lof" && key != "losstatus" && key != "lofstatus" && !strings.HasSuffix(key, "alarm") {
					continue
				}
				alarmValue := strings.ToLower(strings.TrimSpace(value))
				active := alarmValue == "1" || alarmValue == "active" || alarmValue == "true" || alarmValue == "alarm" || alarmValue == "critical"
				clear := alarmValue == "0" || alarmValue == "inactive" || alarmValue == "false" || alarmValue == "normal" || alarmValue == "clear"
				if active || clear {
					point.AlarmReported = true
				}
				if active {
					point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "device_alarm", Severity: "critical", Metric: name, Current: value, Connection: record.Name})
				}
			}
		}
	}
	sort.Slice(point.WAN, func(i, j int) bool { return point.WAN[i].ID < point.WAN[j].ID })
	for _, wan := range point.WAN {
		if wan.IP != "" {
			oldIP := point.KnownIPs[wan.ID]
			if previous != nil && timestamp > previous.Timestamp && timestamp-previous.Timestamp <= 1800 && oldIP != "" && oldIP != wan.IP {
				point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "ip_changed", Severity: "info", Connection: wan.Name, Previous: oldIP, Current: wan.IP})
			}
			point.KnownIPs[wan.ID] = wan.IP
		}
	}
	for _, wan := range point.WAN {
		serviceName := wan.Service
		if wan.Name != wan.ID {
			serviceName += " " + wan.Name
		}
		if strings.Contains(strings.ToUpper(serviceName), "INTERNET") || len(point.WAN) == 1 {
			point.Online = wan.Online
			point.InternetIP = wan.IP
			break
		}
	}
	if previous != nil {
		if previous.Collected && !point.Collected {
			point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "collection_failed", Severity: "warning", Current: code})
		}
		if !previous.Collected && point.Collected {
			point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "collection_recovered", Severity: "info"})
		}
		// A long polling gap is a gap in evidence, not an observed transition.
		if timestamp-previous.Timestamp <= 1800 && timestamp > previous.Timestamp {
			for _, metric := range []struct {
				name         string
				old, current *float64
			}{{"rx_power", previous.RXPower, point.RXPower}, {"tx_power", previous.TXPower, point.TXPower}} {
				if metric.old != nil && metric.current != nil && math.Abs(*metric.current-*metric.old) >= 3 {
					point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "optical_shift", Severity: "warning", Metric: metric.name, Previous: strconv.FormatFloat(*metric.old, 'f', 2, 64), Current: strconv.FormatFloat(*metric.current, 'f', 2, 64)})
				}
			}
			for _, wan := range point.WAN {
				for _, old := range previous.WAN {
					if wan.ID != old.ID {
						continue
					}
					if wan.Online != nil && old.Online != nil && *wan.Online != *old.Online {
						kind, severity := "link_down", "critical"
						if *wan.Online {
							kind, severity = "link_up", "info"
						}
						point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: kind, Severity: severity, Connection: wan.Name, Previous: old.Status, Current: wan.Status})
					}
				}
			}
		}
	}
	if previous == nil && !point.Collected {
		point.Events = append(point.Events, ONTEvent{Timestamp: timestamp, Kind: "collection_failed", Severity: "warning", Current: code})
	}
	// Repeated firmware alarm flags are retained in readings, but the event feed
	// records their onset rather than flooding every poll with the same alarm.
	filtered := make([]ONTEvent, 0, len(point.Events))
	for _, event := range point.Events {
		repeated := false
		if event.Kind == "device_alarm" {
			signature := event.Metric + "\x00" + event.Connection
			point.ActiveAlarms = append(point.ActiveAlarms, signature)
			if previous != nil {
				for _, old := range previous.ActiveAlarms {
					if old == signature {
						repeated = true
						break
					}
				}
			}
		}
		if !repeated {
			event.ID = fmt.Sprintf("%d-%x", timestamp, sha256.Sum256([]byte(event.Kind+event.Metric+event.Connection+event.Current)))
			filtered = append(filtered, event)
		}
	}
	point.Events = filtered
	return point
}

func GetONTHistory(hours int) (ONTHistory, error) {
	m := opticalMonitor
	m.mu.Lock()
	if err := m.loadLocked(); err != nil {
		m.mu.Unlock()
		return ONTHistory{}, err
	}
	target := ontHistoryTarget(m.config.ONTConfig)
	m.mu.Unlock()
	rows, total, err := model.GetONTObservations(target, time.Now().Add(-time.Duration(hours)*time.Hour).Unix())
	result := ONTHistory{Points: []ONTPoint{}, Events: []ONTEvent{}, TotalSamples: total, RetentionDays: model.ONTRetentionDays}
	if err != nil {
		return result, err
	}
	for _, row := range rows {
		var point ONTPoint
		if err = common.UnmarshalJsonStr(row.Payload, &point); err != nil {
			return result, err
		}
		result.Points = append(result.Points, point)
		result.Events = append(result.Events, point.Events...)
	}
	sort.Slice(result.Events, func(i, j int) bool { return result.Events[i].Timestamp > result.Events[j].Timestamp })
	if len(result.Events) > 200 {
		result.Events = result.Events[:200]
	}
	result.Downsampled = total > len(result.Points)
	return result, nil
}

// Keep WAN, PON, Ethernet and WLAN counters as separate measurement scopes.
// They overlap physically and must never be added into one device total.
func collectONTTraffic(pages []ONTPage) []ONTTrafficCounter {
	result := []ONTTrafficCounter{}
	seen := map[string]bool{}
	for _, page := range pages {
		category := ""
		switch page.Path {
		case "/html/bbsp/waninfo/waninfo.asp":
			category = "wan"
		case "/html/amp/ethinfo/ethinfo.asp":
			category = "ethernet"
		case "/html/amp/wlaninfo/wlaninfo.asp", "/html/amp/wlaninfo/wlaninfo.asp?2G", "/html/amp/wlaninfo/wlaninfo.asp?5G":
			category = "wlan"
		case "/html/amp/opticinfo/opticinfo.asp":
			category = "pon"
		default:
			continue
		}
		metadata := map[string]ONTRecord{}
		for _, record := range page.Records {
			domain, _ := ontField(record.Fields, "domain")
			name, _ := ontField(record.Fields, "name", "ssid", "wanname", "connectionname")
			if domain != "" && name != "" {
				metadata[domain] = record
			}
			if record.Name == "WANConnection" {
				metadata[domain] = record
			}
		}
		for _, record := range page.Records {
			rx, _ := ontField(record.Fields, "bytesreceived", "totalbytesreceived", "rxbytes")
			tx, _ := ontField(record.Fields, "bytessent", "totalbytessent", "txbytes")
			reading := ONTTrafficCounter{Category: category, Source: page.Path}
			if value, err := strconv.ParseUint(rx, 10, 64); err == nil {
				reading.RXBytes = &value
			}
			if value, err := strconv.ParseUint(tx, 10, 64); err == nil {
				reading.TXBytes = &value
			}
			if reading.RXBytes == nil && reading.TXBytes == nil {
				continue
			}
			domain, _ := ontField(record.Fields, "domain")
			domain = strings.TrimSuffix(domain, ".Stats")
			if domain == "" || seen[category+":"+domain] {
				continue
			}
			seen[category+":"+domain] = true
			reading.ID = domain
			fields := metadata[domain].Fields
			reading.Name, _ = ontField(fields, "ssid", "name", "wanname", "connectionname")
			reading.Service, _ = ontField(fields, "exservicelist", "servicelist", "xhwservicelist")
			if reading.Service == "" {
				reading.Service, _ = ontField(fields, "servicelist", "xhwservicelist")
			}
			result = append(result, reading)
		}
	}
	return result
}
