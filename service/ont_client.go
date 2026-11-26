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
	"crypto/tls"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var ontPagePath = regexp.MustCompile(`(?i)^/(?:html|CustomApp)/[a-z0-9_./-]+\.asp$`)
var ontMutatingPath = regexp.MustCompile(`(?i)logout|login|reboot|restart|reset|restore|upload|download|backup|export|delete|factory|diagnos|ping|traceroute|speedtest`)
var ontPageReference = regexp.MustCompile(`(?i)["'](/?(?:html|CustomApp)/[a-z0-9_./-]+\.asp(?:\?(?:2G|5G))?)["']`)
var ontMenuReference = regexp.MustCompile(`(?i)["']([^"'<>\s]*menu[^"'<>\s]*\.(?:js|xml|asp)(?:\?[a-z0-9_=&.-]+)?)["']`)
var ontLockTime = regexp.MustCompile(`(?i)(?:LockLeftTime|LoginTimes)\s*=\s*['"]([1-9][0-9]*)`)
var ontToken = regexp.MustCompile(`^[a-fA-F0-9]{16,128}$`)
var ontCookie = regexp.MustCompile(`document\.cookie\s*=\s*['"](Cookie=body:[^'"\r\n]+)['"]`)
var ontScriptSource = regexp.MustCompile(`(?i)<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']`)
var ontWANValue = regexp.MustCompile(`^(?:[0-9]{1,3}|true|false|up|down|normal|connected|disconnected)$`)

// These are read-only status pages used by the HG8145 firmware family. Actual
// menu entries discovered from the authenticated index are included as well.
var ontStatusPages = []string{
	"/html/ssmp/deviceinfo/deviceinfo.asp",
	"/html/amp/opticinfo/opticinfo.asp",
	"/html/bbsp/waninfo/waninfo.asp",
	"/html/bbsp/lanhost/lanhost.asp",
	"/html/amp/wlaninfo/wlaninfo.asp",
	"/html/amp/ethinfo/ethinfo.asp",
	"/html/bbsp/common/wanStateMonitor.asp",
}

type ontClient struct {
	http          *http.Client
	config        ontStoredConfig
	authenticated bool
}

func newONTClient(config ontStoredConfig) *ontClient {
	jar, _ := cookiejar.New(nil)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil                                                                                         // Never send LAN credentials through an environment proxy.
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: config.InsecureTLS} // #nosec G402 -- explicit, device-scoped setting.
	return &ontClient{config: config, http: &http.Client{
		Jar: jar, Transport: transport, Timeout: 8 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (c *ontClient) request(ctx context.Context, method, path string, form url.Values) (string, int, error) {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, c.config.Address+path, body)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Referer", c.config.Address+"/")
	req.Header.Set("Origin", c.config.Address)
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024+1))
	if err != nil {
		return "", resp.StatusCode, err
	}
	if len(data) > 2*1024*1024 {
		return "", resp.StatusCode, errors.New("ONT response exceeds limit")
	}
	return strings.TrimPrefix(string(data), "\ufeff"), resp.StatusCode, nil
}

func ontHasSession(body string, status int) bool {
	return status == http.StatusOK && (strings.Contains(body, "menuIframe") || strings.Contains(body, "menulist")) && !strings.Contains(body, "txt_Password")
}

func (c *ontClient) login(ctx context.Context) (string, string) {
	body, status, err := c.request(ctx, http.MethodGet, "/", nil)
	if err != nil {
		return "", "connection"
	}
	if status != http.StatusOK {
		return "", "authentication"
	}
	if ontLockTime.MatchString(body) {
		return "", "locked"
	}
	token, status, err := c.request(ctx, http.MethodPost, "/asp/GetRandCount.asp", url.Values{})
	if err != nil {
		return "", "connection"
	}
	token = strings.TrimSpace(token)
	if status != http.StatusOK || !ontToken.MatchString(token) {
		return "", "unsupported"
	}
	base, _ := url.Parse(c.config.Address)
	c.http.Jar.SetCookies(base, []*http.Cookie{{Name: "Cookie", Value: "body:Language:english:id=-1", Path: "/"}})
	body, status, err = c.request(ctx, http.MethodPost, "/login.cgi", url.Values{
		"UserName": {c.config.Username}, "PassWord": {base64.StdEncoding.EncodeToString([]byte(c.config.Password))},
		"Language": {"english"}, "x.X_HW_Token": {token},
	})
	if err != nil {
		return "", "connection"
	}
	if strings.Contains(body, "PrompterDes['s1321']") || strings.Contains(body, `PrompterDes["s1321"]`) {
		return "", "login_busy"
	}
	if status >= 400 || strings.Contains(body, "<title>Failed</title>") {
		return "", "authentication"
	}
	// Some firmware sets the session cookie in the returned HTML instead of a header.
	if match := ontCookie.FindStringSubmatch(body); match != nil {
		cookie := strings.SplitN(strings.SplitN(match[1], ";", 2)[0], "=", 2)
		c.http.Jar.SetCookies(base, []*http.Cookie{{Name: cookie[0], Value: cookie[1], Path: "/"}})
	}
	index, status, err := c.request(ctx, http.MethodGet, "/index.asp", nil)
	if err != nil {
		return "", "connection"
	}
	if !ontHasSession(index, status) {
		return "", "authentication"
	}
	c.authenticated = true
	return index, ""
}

func safeONTPage(path string) bool {
	u, err := url.Parse(path)
	return err == nil && u != nil && u.Host == "" && u.Scheme == "" && u.User == nil && u.Fragment == "" &&
		!strings.Contains(u.Path, "..") && ontPagePath.MatchString(u.Path) && !ontMutatingPath.MatchString(u.Path) &&
		(u.RawQuery == "" || u.RawQuery == "2G" || u.RawQuery == "5G")
}

func (c *ontClient) collect(ctx context.Context) ([]ONTPage, string) {
	var index string
	if c.authenticated {
		body, status, err := c.request(ctx, http.MethodGet, "/index.asp", nil)
		if err != nil {
			return nil, "connection"
		}
		if ontHasSession(body, status) {
			index = body
		} else {
			c.authenticated = false
		}
	}
	if !c.authenticated {
		var code string
		index, code = c.login(ctx)
		if code != "" {
			return nil, code
		}
	}
	paths := append([]string{}, ontStatusPages...)
	sources := []string{index}
	seenAssets := map[string]bool{}
	// Follow only same-origin menu resources explicitly named by the firmware.
	for sourceIndex := 0; sourceIndex < len(sources) && sourceIndex < 9; sourceIndex++ {
		for _, match := range ontPageReference.FindAllStringSubmatch(sources[sourceIndex], 128) {
			paths = append(paths, "/"+strings.TrimPrefix(match[1], "/"))
		}
		for _, match := range ontMenuReference.FindAllStringSubmatch(sources[sourceIndex], 16) {
			base, _ := url.Parse(c.config.Address + "/index.asp")
			u, err := base.Parse(match[1])
			if err != nil || u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil || strings.Contains(u.Path, "..") || ontMutatingPath.MatchString(u.Path) || seenAssets[u.Path] || len(seenAssets) >= 8 {
				continue
			}
			seenAssets[u.Path] = true
			body, status, err := c.request(ctx, http.MethodGet, u.RequestURI(), nil)
			if err == nil && status == http.StatusOK {
				sources = append(sources, body)
			}
		}
	}
	pages := make([]ONTPage, 0)
	seen := map[string]bool{}
	code := ""
	for _, path := range paths {
		if !safeONTPage(path) || seen[path] {
			continue
		}
		if len(pages) >= 64 {
			code = "partial"
			break
		}
		seen[path] = true
		page := ONTPage{Path: path, Records: []ONTRecord{}}
		body, status, err := c.request(ctx, http.MethodGet, path, nil)
		if err != nil {
			page.Error = "connection"
		} else if status == 401 || status == 403 || strings.Contains(body, "txt_Password") || strings.Contains(body, "top.location.replace(pageName)") {
			// Session expiration/permission rejection never triggers a login loop.
			page.Error = "permission"
		} else if status != http.StatusOK {
			page.Error = "unavailable"
		} else {
			page.Records = extractONTRecords(body, c.config.Password)
			if path == "/html/bbsp/waninfo/waninfo.asp" {
				base, _ := url.Parse(c.config.Address + path)
				wanSources := []string{}
				seenWAN := map[string]bool{}
				for _, ref := range ontScriptSource.FindAllStringSubmatch(body, 32) {
					u, parseErr := base.Parse(ref[1])
					if parseErr != nil || u.Host != base.Host || u.Scheme != base.Scheme || u.User != nil || u.Fragment != "" {
						continue
					}
					if u.Path != "/html/bbsp/common/wan_dynamicinfo.asp" && u.Path != "/html/bbsp/common/wan_staticinfo.asp" {
						continue
					}
					if seenWAN[u.Path] {
						continue
					}
					seenWAN[u.Path] = true
					data, sourceStatus, sourceErr := c.request(ctx, http.MethodGet, u.RequestURI(), nil)
					if sourceErr != nil || sourceStatus != http.StatusOK || strings.Contains(data, "txt_Password") {
						page.Error = "unavailable"
						continue
					}
					wanSources = append(wanSources, data)
				}
				page.Records = append(page.Records, extractONTWANRecords(wanSources, c.config.Password)...)
			}
			if strings.HasSuffix(path, "/wanStateMonitor.asp") && ontWANValue.MatchString(strings.TrimSpace(body)) {
				page.Records = []ONTRecord{{Name: "WAN", Fields: map[string]string{"Status": strings.TrimSpace(body)}}}
			}
			if len(page.Records) == 0 {
				page.Error = "no_data"
			}
		}
		if page.Error != "" {
			code = "partial"
		}
		pages = append(pages, page)
		if ctx.Err() != nil {
			break
		}
		select {
		case <-ctx.Done():
			return pages, "partial"
		case <-time.After(150 * time.Millisecond):
		}
	}
	return pages, code
}
