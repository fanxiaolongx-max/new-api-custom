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

package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const ONTRetentionDays = 30

type ONTObservation struct {
	ID        int64  `gorm:"primaryKey"`
	Target    string `gorm:"size:64;index:idx_ont_observation_target_time,priority:1"`
	Timestamp int64  `gorm:"index:idx_ont_observation_target_time,priority:2"`
	HasEvents bool
	Payload   string `gorm:"type:text"`
}

type ONTSnapshot struct {
	Target    string `gorm:"primaryKey;size:64"`
	Timestamp int64
	Payload   string `gorm:"type:text"`
}

func SaveONTObservation(observation *ONTObservation, snapshot *ONTSnapshot) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(observation).Error; err != nil {
			return err
		}
		if snapshot != nil {
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "target"}}, DoUpdates: clause.AssignmentColumns([]string{"timestamp", "payload"})}).Create(snapshot).Error; err != nil {
				return err
			}
		}
		cutoff := time.Now().AddDate(0, 0, -ONTRetentionDays).Unix()
		if err := tx.Where("timestamp < ?", cutoff).Delete(&ONTObservation{}).Error; err != nil {
			return err
		}
		return tx.Where("timestamp < ?", cutoff).Delete(&ONTSnapshot{}).Error
	})
}

func GetONTLastObservation(target string) (*ONTObservation, error) {
	var row ONTObservation
	err := DB.Where("target = ?", target).Order("timestamp DESC, id DESC").First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &row, err
}

func GetONTSnapshot(target string) (*ONTSnapshot, error) {
	var row ONTSnapshot
	err := DB.Where("target = ?", target).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &row, err
}

// Select a bounded, evenly spaced history while retaining the most recent 200
// event-bearing observations. Only IDs are loaded for the full time window.
func GetONTObservations(target string, since int64) ([]ONTObservation, int, error) {
	var ids []int64
	if err := DB.Model(&ONTObservation{}).Where("target = ? AND timestamp >= ?", target, since).Order("timestamp ASC, id ASC").Pluck("id", &ids).Error; err != nil {
		return nil, 0, err
	}
	total := len(ids)
	if total == 0 {
		return []ONTObservation{}, 0, nil
	}
	selected := ids
	if total > 600 {
		selected = make([]int64, 0, 800)
		for i := 0; i < 600; i++ {
			selected = append(selected, ids[i*(total-1)/599])
		}
		var eventIDs []int64
		if err := DB.Model(&ONTObservation{}).Where("target = ? AND timestamp >= ? AND has_events = ?", target, since, true).Order("timestamp DESC, id DESC").Limit(200).Pluck("id", &eventIDs).Error; err != nil {
			return nil, 0, err
		}
		selected = append(selected, eventIDs...)
	}
	var rows []ONTObservation
	err := DB.Where("id IN ?", selected).Order("timestamp ASC, id ASC").Find(&rows).Error
	return rows, total, err
}

// The Secret suffix excludes the encrypted value from the generic options API.
const ontMonitorOptionKey = "ONTMonitorSecret"

func GetONTMonitorSecret() (string, error) {
	var option Option
	err := DB.Where(&Option{Key: ontMonitorOptionKey}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	return option.Value, err
}

func SaveONTMonitorSecret(value string) error {
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&Option{Key: ontMonitorOptionKey, Value: value}).Error
}
