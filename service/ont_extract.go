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
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"golang.org/x/net/html"
)

var ontSensitive = regexp.MustCompile(`(?i)pass|pwd|psk|preshared|pre.shared|secret|token|cookie|credential|authorization|csrf|community|private.?key|access.?key|wep.?key|wpa.?key|(?:wifi|wlan|network|auth|encryption|sae)[_. -]*key|keyvalue|keyindex|key[1-4]|(?:^|[^a-z])key(?:[^a-z]|$)|wps.?pin|(?:^|[^a-z])pin(?:[^a-z]|$)|密码|密钥|令牌`)
var ontConstructor = regexp.MustCompile(`function\s+(\w+)\s*\(([^)]*)\)\s*\{([^}]*)\}`)
var ontProperty = regexp.MustCompile(`this\.(\w+)\s*=\s*(\w+)\s*;`)
var ontInstance = regexp.MustCompile(`\bnew\s+(\w+)\s*\(((?:[^()"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)\)`)
var ontLiteral = regexp.MustCompile(`^(?:-?[0-9]+(?:\.[0-9]+)?|true|false|null)$`)
var ontScalar = regexp.MustCompile(`\b(?:var|let|const)\s+(ProductName|ProductClass|SerialNumber|HardwareVersion|SoftwareVersion|DeviceName|UpTime|Uptime|RxPower|TxPower|Temperature|Voltage|BiasCurrent|PonState)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[0-9.]+)\s*;`)

// Parse only JavaScript literal argument lists. Firmware JavaScript is never
// evaluated on the server, and expressions/function calls are rejected.
func ontLiteralArguments(source string) ([]string, bool) {
	values := []string{}
	i := 0
	for i < len(source) {
		for i < len(source) && strings.ContainsRune(" \t\r\n", rune(source[i])) {
			i++
		}
		if i >= len(source) {
			return nil, false
		}
		var value strings.Builder
		if source[i] == '\'' || source[i] == '"' {
			quote := source[i]
			i++
			closed := false
			for i < len(source) {
				ch := source[i]
				i++
				if ch == quote {
					closed = true
					break
				}
				if ch != '\\' {
					value.WriteByte(ch)
					continue
				}
				if i >= len(source) {
					return nil, false
				}
				escaped := source[i]
				i++
				switch escaped {
				case 'n':
					value.WriteByte('\n')
				case 'r':
					value.WriteByte('\r')
				case 't':
					value.WriteByte('\t')
				case 'x', 'u':
					length := 2
					if escaped == 'u' {
						length = 4
					}
					if i+length > len(source) {
						return nil, false
					}
					n, err := strconv.ParseUint(source[i:i+length], 16, 32)
					if err != nil {
						return nil, false
					}
					value.WriteRune(rune(n))
					i += length
				default:
					value.WriteByte(escaped)
				}
			}
			if !closed {
				return nil, false
			}
		} else {
			start := i
			for i < len(source) && source[i] != ',' {
				i++
			}
			literal := strings.TrimSpace(source[start:i])
			if !ontLiteral.MatchString(literal) {
				return nil, false
			}
			if literal != "null" {
				value.WriteString(literal)
			}
		}
		values = append(values, value.String())
		if len(values) > 96 {
			return nil, false
		}
		for i < len(source) && strings.ContainsRune(" \t\r\n", rune(source[i])) {
			i++
		}
		if i == len(source) {
			return values, true
		}
		if source[i] != ',' {
			return nil, false
		}
		i++
		if i == len(source) {
			return nil, false
		}
	}
	return values, true
}

func ontCleanText(value, password string) string {
	value = strings.Join(strings.Fields(value), " ")
	if password != "" {
		value = strings.ReplaceAll(value, password, "[redacted]")
	}
	if len(value) > 512 {
		value = value[:512]
		for !utf8.ValidString(value) {
			value = value[:len(value)-1]
		}
	}
	return value
}

func ontAttribute(node *html.Node, name string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, name) {
			return attr.Val
		}
	}
	return ""
}

func ontNodeText(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data + " "
	}
	if node.Type == html.ElementNode {
		switch node.Data {
		case "script", "style", "input", "select", "textarea", "button":
			return ""
		}
	}
	var text strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		text.WriteString(ontNodeText(child))
	}
	return strings.Join(strings.Fields(text.String()), " ")
}

func extractONTRecords(source, password string) []ONTRecord {
	records := []ONTRecord{}
	root, err := html.Parse(strings.NewReader(source))
	if err != nil {
		return records
	}
	var scripts strings.Builder
	var nodes []*html.Node
	nodes = append(nodes, root)
	for len(nodes) > 0 && len(records) < 256 {
		node := nodes[len(nodes)-1]
		nodes = nodes[:len(nodes)-1]
		if node.Type == html.ElementNode && (node.Data == "script" || node.Data == "style") {
			if node.Data == "script" && node.FirstChild != nil {
				scripts.WriteString(node.FirstChild.Data)
				scripts.WriteByte('\n')
			}
			continue
		}
		style := strings.ReplaceAll(strings.ToLower(ontAttribute(node, "style")), " ", "")
		hidden := false
		for _, attr := range node.Attr {
			if attr.Key == "hidden" {
				hidden = true
				break
			}
		}
		if hidden || ontAttribute(node, "aria-hidden") == "true" || strings.Contains(style, "display:none") {
			continue
		}
		if node.Data == "tr" {
			cells := []string{}
			nested := false
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if child.Data == "td" || child.Data == "th" {
					text := ontCleanText(ontNodeText(child), password)
					cells = append(cells, text)
					for sub := child.FirstChild; sub != nil; sub = sub.NextSibling {
						if sub.Data == "table" {
							nested = true
						}
					}
				}
			}
			// Only label/value rows are safe without rendered column metadata.
			if !nested && len(cells) == 2 && cells[0] != "" && cells[1] != "" && !ontSensitive.MatchString(cells[0]) && !ontSensitive.MatchString(cells[1]) {
				records = append(records, ONTRecord{Name: cells[0], Fields: map[string]string{cells[0]: cells[1]}})
			}
		}
		if node.Data == "input" || node.Data == "select" {
			name := ontAttribute(node, "name")
			if name == "" {
				name = ontAttribute(node, "id")
			}
			kind := strings.ToLower(ontAttribute(node, "type"))
			label := name
			// Include the row label when testing whether a field is sensitive.
			for parent := node.Parent; parent != nil; parent = parent.Parent {
				if parent.Data == "tr" {
					label += " " + ontNodeText(parent)
					break
				}
			}
			if name != "" && !ontSensitive.MatchString(label) && (kind == "text" || kind == "number" || kind == "checkbox" || (kind == "" && node.Data == "input")) {
				value := ontCleanText(ontAttribute(node, "value"), password)
				if kind == "checkbox" {
					value = "false"
					for _, attr := range node.Attr {
						if attr.Key == "checked" {
							value = "true"
						}
					}
				}
				if value != "" && !ontSensitive.MatchString(value) {
					records = append(records, ONTRecord{Name: name, Fields: map[string]string{name: value}})
				}
			}
		}
		// Reverse push preserves firmware order in the output.
		for child := node.LastChild; child != nil; child = child.PrevSibling {
			nodes = append(nodes, child)
		}
	}
	js := scripts.String()
	schemas := map[string]map[int]string{}
	for _, match := range ontConstructor.FindAllStringSubmatch(js, 128) {
		params := strings.Split(match[2], ",")
		fields := map[int]string{}
		for _, property := range ontProperty.FindAllStringSubmatch(match[3], 96) {
			for i, param := range params {
				if strings.TrimSpace(param) == property[2] {
					fields[i] = property[1]
				}
			}
		}
		if len(fields) > 0 {
			schemas[match[1]] = fields
		}
	}
	for _, match := range ontInstance.FindAllStringSubmatch(js, 512) {
		if len(records) >= 256 {
			break
		}
		schema := schemas[match[1]]
		if len(schema) == 0 || ontSensitive.MatchString(match[1]) {
			continue
		}
		args, ok := ontLiteralArguments(match[2])
		if !ok {
			continue
		}
		fields := map[string]string{}
		// Generic Name/Value records may carry secrets under a neutral Value key.
		sensitiveRecord := false
		for i, name := range schema {
			if i >= len(args) {
				continue
			}
			if (strings.EqualFold(name, "Name") || strings.EqualFold(name, "Parameter") || strings.EqualFold(name, "Domain") || strings.EqualFold(name, "Path") || strings.EqualFold(name, "Key")) && ontSensitive.MatchString(args[i]) {
				sensitiveRecord = true
			}
			if ontSensitive.MatchString(name) {
				continue
			}
			value := ontCleanText(args[i], password)
			if value != "" && !ontSensitive.MatchString(value) {
				fields[name] = value
			}
		}
		if len(fields) > 0 && !sensitiveRecord {
			records = append(records, ONTRecord{Name: match[1], Fields: fields})
		}
	}
	device := map[string]string{}
	for _, match := range ontScalar.FindAllStringSubmatch(js, 32) {
		args, ok := ontLiteralArguments(match[2])
		if ok && len(args) == 1 {
			device[match[1]] = ontCleanText(args[0], password)
		}
	}
	if len(device) > 0 && len(records) < 256 {
		records = append(records, ONTRecord{Name: "Device", Fields: device})
	}
	// HTML forms and embedded data can describe the same record twice.
	unique := make([]ONTRecord, 0, len(records))
	seen := make(map[string]bool, len(records))
	for _, record := range records {
		encoded, err := common.Marshal(record)
		if err != nil || seen[string(encoded)] {
			continue
		}
		seen[string(encoded)] = true
		unique = append(unique, record)
	}
	return unique
}

// WAN data lives in two ASP script resources. Project only named literal
// constructor arguments; do not execute the firmware's computed expressions.
func extractONTWANRecords(sources []string, password string) []ONTRecord {
	allowed := map[string]bool{}
	for _, field := range []string{"domain", "name", "enable", "servicelist", "exservicelist", "wanmode", "ipv4enable", "ipv6enable", "ipv4addressmode", "natenabled", "macaddress", "priority", "connectionstatus", "connectiontrigger", "lastconnectionerror", "ipaddress", "subnetmask", "gateway", "dnsstr", "dhcpleasetime", "dhcpleasetimeremaining", "uptime", "pppoeacname"} {
		allowed[field] = true
	}
	records := []ONTRecord{}
	byDomain := map[string]int{}
	for _, source := range sources {
		schemas := map[string][]string{}
		for _, match := range ontConstructor.FindAllStringSubmatch(source, 128) {
			if match[1] == "wanStaticInfoArray" || match[1] == "WanIPDynamic" || match[1] == "WanPPPDynamic" {
				schemas[match[1]] = strings.Split(match[2], ",")
			}
		}
		for _, match := range ontInstance.FindAllStringSubmatch(source, 512) {
			params := schemas[match[1]]
			if len(params) == 0 {
				continue
			}
			args, ok := ontLiteralArguments(match[2])
			if !ok || len(args) < len(params) {
				continue
			}
			fields := map[string]string{}
			for i, name := range params {
				name = strings.TrimSpace(name)
				if !allowed[strings.ToLower(name)] {
					continue
				}
				value := ontCleanText(args[i], password)
				if !ontSensitive.MatchString(value) {
					fields[name] = value
				}
			}
			domain := fields["domain"]
			if domain == "" {
				continue
			}
			index, found := byDomain[domain]
			if !found {
				index = len(records)
				byDomain[domain] = index
				records = append(records, ONTRecord{Name: "WANConnection", Fields: map[string]string{}})
			}
			for key, value := range fields {
				records[index].Fields[key] = value
			}
		}
	}
	return records
}
