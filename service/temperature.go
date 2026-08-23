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
	Name        string  `json:"name"`         // 硬件驱动名 (如 coretemp, nvme, pch_cannonlake)
	Label       string  `json:"label"`        // 硬件原始标签 (如 Package id 0, Core 0, Composite)
	DisplayName string  `json:"display_name"` // 友好中文名 (如 "CPU 封装总温", "CPU 核心 0", "NVMe 固态硬盘")
	TempC       float64 `json:"temp_c"`
	Category    string  `json:"category"`     // "cpu", "nvme", "pch", "wifi", "gpu", "other"
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

// StartSystemTemperatureMonitor 启动硬件温度周期监控协程
func StartSystemTemperatureMonitor() {
	monitorOnceStart.Do(func() {
		loadHistoryFromRedis()
		// 启动时立即采集一次
		CollectTemperatureSample()

		go func() {
			ticker := time.NewTicker(TemperatureInterval)
			defer ticker.Stop()
			for range ticker.C {
				CollectTemperatureSample()
			}
		}()
	})
}

// CollectTemperatureSample 执行一次硬件温度采样并持久化
func CollectTemperatureSample() TemperatureOverview {
	sensors := scanHardwareSensors()
	now := time.Now()
	timestamp := now.Unix()
	timeStr := now.Format("15:04")

	var cpuTemps []float64
	var nvmeTemps []float64
	var pchTemps []float64

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
	seenNames := make(map[string]bool)

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
						rawLabel := strings.TrimSpace(string(labelBytes))
						if rawLabel == "" {
							rawLabel = hwName
						}

						displayName, cat := formatSensorDisplayName(hwName, rawLabel)
						seenNames[hwName] = true
						seenNames[rawLabel] = true
						seenNames[displayName] = true

						metrics = append(metrics, SensorMetric{
							Name:        hwName,
							Label:       rawLabel,
							DisplayName: displayName,
							TempC:       roundToOneDecimal(tempC),
							Category:    cat,
						})
					}
				}
			}
		}
	}

	// 2. 补充扫描 /sys/class/thermal/thermal_zone*，智能去重
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

					displayName, cat := formatSensorDisplayName(entry.Name(), zType)

					// 检查是否已经在 hwmon 中录入（避免重复，如 x86_pkg_temp 与 Package id 0 重复、acpitz 重复等）
					if seenNames[zType] || seenNames[displayName] {
						continue
					}

					seenNames[zType] = true
					seenNames[displayName] = true

					metrics = append(metrics, SensorMetric{
						Name:        entry.Name(),
						Label:       zType,
						DisplayName: displayName,
						TempC:       roundToOneDecimal(tempC),
						Category:    cat,
					})
				}
			}
		}
	}

	// 排序：CPU -> NVMe -> PCH -> Wi-Fi -> GPU -> Other
	categoryOrder := map[string]int{
		"cpu":   1,
		"nvme":  2,
		"pch":   3,
		"wifi":  4,
		"gpu":   5,
		"other": 6,
	}

	sort.Slice(metrics, func(i, j int) bool {
		oi := categoryOrder[metrics[i].Category]
		oj := categoryOrder[metrics[j].Category]
		if oi != oj {
			return oi < oj
		}
		return metrics[i].DisplayName < metrics[j].DisplayName
	})

	return metrics
}

// formatSensorDisplayName 智能识别硬件传感器并生成中文友好名
func formatSensorDisplayName(hwName, rawLabel string) (displayName, category string) {
	nameLower := strings.ToLower(hwName)
	labelLower := strings.ToLower(rawLabel)
	combined := nameLower + " " + labelLower

	// 1. CPU 核心与封装
	if strings.Contains(labelLower, "package id") || strings.Contains(labelLower, "x86_pkg_temp") {
		return "CPU 封装总温", "cpu"
	}
	if strings.HasPrefix(labelLower, "core ") {
		coreNum := strings.TrimPrefix(labelLower, "core ")
		return "CPU 核心 " + coreNum, "cpu"
	}
	if strings.Contains(combined, "coretemp") && strings.HasPrefix(rawLabel, "temp") {
		return "CPU 核心温度", "cpu"
	}
	if strings.Contains(combined, "tdie") || strings.Contains(combined, "tctl") {
		return "CPU 核心温度 (AMD)", "cpu"
	}
	if strings.Contains(labelLower, "b0d4") {
		return "CPU 功耗温控 (DPTF)", "cpu"
	}

	// 2. NVMe / 存储
	if strings.Contains(combined, "nvme") || strings.Contains(labelLower, "composite") || strings.Contains(combined, "ssd") {
		if strings.Contains(labelLower, "sensor 1") {
			return "NVMe 闪存颗粒 1", "nvme"
		}
		if strings.Contains(labelLower, "sensor 2") {
			return "NVMe 闪存颗粒 2", "nvme"
		}
		return "NVMe 固态硬盘", "nvme"
	}

	// 3. 主板南桥 / PCH
	if strings.Contains(combined, "pch") || strings.Contains(combined, "cannonlake") || strings.Contains(combined, "cometlake") || strings.Contains(combined, "tigerlake") {
		return "主板南桥芯片 (PCH)", "pch"
	}

	// 4. Wi-Fi / 无线网卡
	if strings.Contains(combined, "iwlwifi") || strings.Contains(combined, "wifi") || strings.Contains(combined, "wlan") || strings.Contains(combined, "ath9k") || strings.Contains(combined, "rtw") {
		return "无线网卡 (Wi-Fi)", "wifi"
	}

	// 5. 显卡 GPU
	if strings.Contains(combined, "nouveau") || strings.Contains(combined, "nvidia") || strings.Contains(combined, "amdgpu") || strings.Contains(combined, "radeon") {
		return "独立显卡 (GPU)", "gpu"
	}

	// 6. 电池 / 电源
	if strings.Contains(combined, "bat") || strings.Contains(combined, "battery") {
		return "电池组温度", "other"
	}

	// 7. ACPI / 散热管理
	if strings.Contains(labelLower, "int3400") {
		return "散热策略管理框架", "other"
	}
	if strings.Contains(labelLower, "acpitz") || strings.Contains(combined, "acpitz") {
		return "ACPI 主板环境温", "pch"
	}

	// 8. SEN1 ~ SEN8 主板辅助热敏电阻
	if strings.HasPrefix(strings.ToUpper(rawLabel), "SEN") {
		senNum := strings.TrimPrefix(strings.ToUpper(rawLabel), "SEN")
		switch senNum {
		case "1":
			return "主板供电/内存区 (SEN1)", "pch"
		case "2":
			return "主板进风口区 (SEN2)", "pch"
		case "3":
			return "机壳掌托区 1 (SEN3)", "other"
		case "4":
			return "机壳掌托区 2 (SEN4)", "other"
		case "5":
			return "电池仓环境 (SEN5)", "other"
		case "6":
			return "底壳散热出风口 (SEN6)", "other"
		case "7":
			return "侧边扩展区 (SEN7)", "other"
		default:
			return "主板探头 SEN" + senNum, "other"
		}
	}

	if rawLabel != "" && !strings.HasPrefix(rawLabel, "temp") {
		return rawLabel, "other"
	}
	if hwName != "" && !strings.HasPrefix(hwName, "temp") {
		return hwName, "other"
	}
	return "硬件温度传感器", "other"
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
