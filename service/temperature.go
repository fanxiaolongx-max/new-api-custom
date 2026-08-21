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
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	MaxHistoryPoints      = 120 // 采样间隔 2 分钟，保留最近 4 小时的高精走势（或在 Redis 中保留 24 小时 288 个点）
	MaxRedisHistoryPoints = 288 // 24 小时
	TemperatureRedisKey   = "sys:temperature:history:v1"
	TemperatureInterval   = 2 * time.Minute
)

type SensorMetric struct {
	Name     string  `json:"name"`
	Label    string  `json:"label"`
	TempC    float64 `json:"temp_c"`
	Category string  `json:"category"` // "cpu", "nvme", "pch", "other"
}

type TemperaturePoint struct {
	Timestamp int64   `json:"timestamp"`
	TimeStr   string  `json:"time_str"` // "15:04"
	CPU       float64 `json:"cpu"`
	NVMe      float64 `json:"nvme"`
	PCH       float64 `json:"pch"`
}

type TemperatureOverview struct {
	Available   bool               `json:"available"`
	Message     string             `json:"message,omitempty"`
	Current     TemperaturePoint   `json:"current"`
	Sensors     []SensorMetric     `json:"sensors"`
	History     []TemperaturePoint `json:"history"`
	UpdatedTime int64              `json:"updated_time"`
}

var (
	tempMutex        sync.RWMutex
	tempHistory      []TemperaturePoint
	currentOverview  TemperatureOverview
	monitorOnceStart sync.Once
)

// StartSystemTemperatureMonitor 启动周期温度监测协程
func StartSystemTemperatureMonitor() {
	monitorOnceStart.Do(func() {
		// 1. 初始化从 Redis 加载历史记录（如有）
		loadHistoryFromRedis()

		// 2. 立即进行首次采样
		CollectTemperatureSample()

		// 3. 开启周期采样协程
		go func() {
			ticker := time.NewTicker(TemperatureInterval)
			defer ticker.Stop()
			for range ticker.C {
				CollectTemperatureSample()
			}
		}()
	})
}

// CollectTemperatureSample 采集一次最新硬件温度
func CollectTemperatureSample() TemperatureOverview {
	sensors := scanHardwareSensors()
	now := time.Now()
	timestamp := now.Unix()
	timeStr := now.Format("15:04")

	var cpuTemps, nvmeTemps, pchTemps []float64
	for _, s := range sensors {
		switch s.Category {
		case "cpu":
			cpuTemps = append(cpuTemps, s.TempC)
		case "nvme":
			nvmeTemps = append(nvmeTemps, s.TempC)
		case "pch":
			pchTemps = append(pchTemps, s.TempC)
		}
	}

	point := TemperaturePoint{
		Timestamp: timestamp,
		TimeStr:   timeStr,
		CPU:       calcRepresentativeTemp(cpuTemps),
		NVMe:      calcRepresentativeTemp(nvmeTemps),
		PCH:       calcRepresentativeTemp(pchTemps),
	}

	available := len(sensors) > 0 || point.CPU > 0 || point.NVMe > 0 || point.PCH > 0
	msg := ""
	if !available {
		msg = "No hardware thermal sensors found in /sys/class/hwmon or /sys/class/thermal."
	}

	tempMutex.Lock()
	// 添加到历史曲线
	tempHistory = append(tempHistory, point)
	if len(tempHistory) > MaxRedisHistoryPoints {
		tempHistory = tempHistory[len(tempHistory)-MaxRedisHistoryPoints:]
	}

	currentOverview = TemperatureOverview{
		Available:   available,
		Message:     msg,
		Current:     point,
		Sensors:     sensors,
		History:     tempHistory,
		UpdatedTime: timestamp,
	}
	overviewCopy := currentOverview
	tempMutex.Unlock()

	// 异步更新到 Redis 缓存
	if common.RedisEnabled && available {
		go saveHistoryToRedis(tempHistory)
	}

	return overviewCopy
}

// GetSystemTemperatureOverview 获取温度全景数据
func GetSystemTemperatureOverview() TemperatureOverview {
	tempMutex.RLock()
	defer tempMutex.RUnlock()

	if currentOverview.UpdatedTime == 0 {
		tempMutex.RUnlock()
		res := CollectTemperatureSample()
		tempMutex.RLock()
		return res
	}

	return currentOverview
}

// scanHardwareSensors 遍历 Linux sysfs 硬件温度传感器
func scanHardwareSensors() []SensorMetric {
	var metrics []SensorMetric

	// 1. 扫描 /sys/class/hwmon 与 /host/sys/class/hwmon
	hwmonBases := []string{"/sys/class/hwmon", "/host/sys/class/hwmon"}
	for _, base := range hwmonBases {
		if entries, err := os.ReadDir(base); err == nil {
			for _, entry := range entries {
				hwmonPath := filepath.Join(base, entry.Name())
				nameBytes, _ := os.ReadFile(filepath.Join(hwmonPath, "name"))
				hwName := strings.TrimSpace(string(nameBytes))

				files, err := os.ReadDir(hwmonPath)
				if err != nil {
					continue
				}
				for _, f := range files {
					fName := f.Name()
					if strings.HasPrefix(fName, "temp") && strings.HasSuffix(fName, "_input") {
						tempBytes, err := os.ReadFile(filepath.Join(hwmonPath, fName))
						if err != nil {
							continue
						}
						milli, err := strconv.ParseFloat(strings.TrimSpace(string(tempBytes)), 64)
						if err != nil || milli <= 0 || milli > 150000 {
							continue // 忽略异常/离谱读数
						}
						tempC := milli / 1000.0

						// 读取对应 label（如 temp1_label）
						labelFile := strings.Replace(fName, "_input", "_label", 1)
						labelBytes, _ := os.ReadFile(filepath.Join(hwmonPath, labelFile))
						label := strings.TrimSpace(string(labelBytes))
						if label == "" {
							label = fName
						}

						cat := categorizeSensor(hwName, label)
						metrics = append(metrics, SensorMetric{
							Name:     hwName,
							Label:    label,
							TempC:    roundToOneDecimal(tempC),
							Category: cat,
						})
					}
				}
			}
		}
	}

	// 2. 如果 hwmon 没有扫到足够信息，补充扫描 /sys/class/thermal/thermal_zone*
	thermalBases := []string{"/sys/class/thermal", "/host/sys/class/thermal"}
	for _, base := range thermalBases {
		if entries, err := os.ReadDir(base); err == nil {
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), "thermal_zone") {
					zonePath := filepath.Join(base, entry.Name())
					typeBytes, _ := os.ReadFile(filepath.Join(zonePath, "type"))
					zType := strings.TrimSpace(string(typeBytes))

					tempBytes, err := os.ReadFile(filepath.Join(zonePath, "temp"))
					if err != nil {
						continue
					}
					milli, err := strconv.ParseFloat(strings.TrimSpace(string(tempBytes)), 64)
					if err != nil || milli <= 0 || milli > 150000 {
						continue
					}
					tempC := milli / 1000.0

					// 检查是否已经在 hwmon 中录入（避免重复）
					alreadyFound := false
					for _, m := range metrics {
						if m.Name == zType || m.Label == zType {
							alreadyFound = true
							break
						}
					}

					if !alreadyFound {
						cat := categorizeSensor(zType, zType)
						metrics = append(metrics, SensorMetric{
							Name:     entry.Name(),
							Label:    zType,
							TempC:    roundToOneDecimal(tempC),
							Category: cat,
						})
					}
				}
			}
		}
	}

	// 排序：CPU -> NVMe -> PCH -> Other
	sort.Slice(metrics, func(i, j int) bool {
		order := map[string]int{"cpu": 1, "nvme": 2, "pch": 3, "other": 4}
		return order[metrics[i].Category] < order[metrics[j].Category]
	})

	return metrics
}

// categorizeSensor 判断传感器分类
func categorizeSensor(name, label string) string {
	combined := strings.ToLower(name + " " + label)

	// CPU 判定
	if strings.Contains(combined, "coretemp") ||
		strings.Contains(combined, "package id") ||
		strings.Contains(combined, "x86_pkg_temp") ||
		strings.Contains(combined, "k10temp") ||
		strings.Contains(combined, "zenpower") ||
		strings.Contains(combined, "tdie") ||
		strings.Contains(combined, "tctl") ||
		strings.Contains(combined, "cpu") {
		return "cpu"
	}

	// NVMe 固态硬盘判定
	if strings.Contains(combined, "nvme") ||
		strings.Contains(combined, "composite") ||
		strings.Contains(combined, "drive") ||
		strings.Contains(combined, "ssd") {
		return "nvme"
	}

	// 主板芯片组 PCH / ACPI 判定
	if strings.Contains(combined, "pch") ||
		strings.Contains(combined, "cannonlake") ||
		strings.Contains(combined, "acpitz") ||
		strings.Contains(combined, "int3400") ||
		strings.Contains(combined, "motherboard") ||
		strings.Contains(combined, "sen") ||
		strings.Contains(combined, "b0d4") {
		return "pch"
	}

	return "other"
}

func calcRepresentativeTemp(temps []float64) float64 {
	if len(temps) == 0 {
		return 0
	}
	// 取最高温或均值
	max := temps[0]
	for _, t := range temps {
		if t > max {
			max = t
		}
	}
	return roundToOneDecimal(max)
}

func roundToOneDecimal(v float64) float64 {
	return float64(int(v*10+0.5)) / 10.0
}

func loadHistoryFromRedis() {
	if !common.RedisEnabled {
		return
	}
	val, err := common.RedisGet(TemperatureRedisKey)
	if err != nil || val == "" {
		return
	}
	var pts []TemperaturePoint
	if err := json.Unmarshal([]byte(val), &pts); err == nil && len(pts) > 0 {
		tempMutex.Lock()
		tempHistory = pts
		tempMutex.Unlock()
	}
}

func saveHistoryToRedis(history []TemperaturePoint) {
	if !common.RedisEnabled || len(history) == 0 {
		return
	}
	data, err := json.Marshal(history)
	if err != nil {
		return
	}
	_ = common.RedisSet(TemperatureRedisKey, string(data), 48*time.Hour)
}
