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
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	LogsSessionCookieName = "new_api_logs_session"
	LogsSessionTTL        = 12 * time.Hour
	logsSessionKeyPrefix  = "auth:logs:"
)

var ErrLogsSessionInvalid = errors.New("logs session is invalid")

func IssueLogsSession(identity AuthIdentity) (string, error) {
	if identity.UserID <= 0 || identity.SessionID == "" || identity.UserAuthVersion <= 0 || identity.SessionVersion <= 0 || !common.RedisEnabled {
		return "", ErrLogsSessionInvalid
	}
	ticket, err := common.GenerateRandomCharsKey(64)
	if err != nil {
		return "", err
	}
	payload, err := common.Marshal(identity)
	if err != nil {
		return "", err
	}
	if err := common.RedisSet(logsSessionKey(ticket), string(payload), LogsSessionTTL); err != nil {
		return "", err
	}
	return ticket, nil
}

func ValidateLogsSession(ticket string) (AuthIdentity, *model.UserBase, error) {
	if ticket == "" || !common.RedisEnabled {
		return AuthIdentity{}, nil, ErrLogsSessionInvalid
	}
	payload, err := common.RedisGet(logsSessionKey(ticket))
	if err != nil {
		return AuthIdentity{}, nil, ErrLogsSessionInvalid
	}
	var identity AuthIdentity
	if err := common.Unmarshal([]byte(payload), &identity); err != nil {
		return AuthIdentity{}, nil, ErrLogsSessionInvalid
	}
	_, user, err := ValidateLoginSession(identity)
	if err != nil {
		return AuthIdentity{}, nil, err
	}
	return identity, user, nil
}

func logsSessionKey(ticket string) string {
	digest := common.GenerateHMACWithKey([]byte("new-api/logs-session/v1:"+common.SessionSecret), ticket)
	return logsSessionKeyPrefix + digest
}
