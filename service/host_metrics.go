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
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/disk"
	"github.com/shirou/gopsutil/host"
	"github.com/shirou/gopsutil/load"
	"github.com/shirou/gopsutil/mem"
)

const (
	MaxHostMetricsHistoryPoints = 30 // 保存最近 30 个采样点（支持实时趋势图）
	HostMetricsSampleInterval   = 10 * time.Second
)

type HostInfo struct {
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Platform string `json:"platform"`
	Arch     string `json:"arch"`
	Uptime   uint64 `json:"uptime"`
	BootTime uint64 `json:"boot_time"`
}

type CPUInfo struct {
	UsagePercent float64 `json:"usage_percent"`
	Cores        int     `json:"cores"`
	LogicalCores int     `json:"logical_cores"`
	ModelName    string  `json:"model_name"`
	Mhz          float64 `json:"mhz"`
}

type MemoryInfo struct {
	TotalBytes       uint64  `json:"total_bytes"`
	UsedBytes        uint64  `json:"used_bytes"`
	FreeBytes        uint64  `json:"free_bytes"`
	AvailableBytes   uint64  `json:"available_bytes"`
	UsagePercent     float64 `json:"usage_percent"`
	SwapTotalBytes   uint64  `json:"swap_total_bytes"`
	SwapUsedBytes    uint64  `json:"swap_used_bytes"`
	SwapUsagePercent float64 `json:"swap_usage_percent"`
}

type StorageInfo struct {
	TotalBytes   uint64  `json:"total_bytes"`
	UsedBytes    uint64  `json:"used_bytes"`
	FreeBytes    uint64  `json:"free_bytes"`
	UsagePercent float64 `json:"usage_percent"`
}

type LoadAvgInfo struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type ProcessInfo struct {
	NumGoroutines int    `json:"num_goroutines"`
	AllocBytes    uint64 `json:"alloc_bytes"`
	SysBytes      uint64 `json:"sys_bytes"`
	NumGC         uint32 `json:"num_gc"`
}

type HostMetricsPoint struct {
	Timestamp int64   `json:"timestamp"`
	TimeStr   string  `json:"time_str"` // "15:04:05"
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"memory"`
}

type HostMetricsOverview struct {
	Host        HostInfo           `json:"host"`
	CPU         CPUInfo            `json:"cpu"`
	Memory      MemoryInfo         `json:"memory"`
	Storage     StorageInfo        `json:"storage"`
	LoadAvg     LoadAvgInfo        `json:"load_avg"`
	Process     ProcessInfo        `json:"process"`
	Current     HostMetricsPoint   `json:"current"`
	History     []HostMetricsPoint `json:"history"`
	UpdatedTime int64              `json:"updated_time"`
}

var (
	hostMetricsMutex       sync.RWMutex
	currentHostMetrics     HostMetricsOverview
	hostMetricsHistory     []HostMetricsPoint
	hostMetricsMonitorOnce sync.Once
)

func init() {
	hostMetricsHistory = make([]HostMetricsPoint, 0, MaxHostMetricsHistoryPoints)
}

// StartHostMetricsMonitor 启动后台周期性采集
func StartHostMetricsMonitor() {
	hostMetricsMonitorOnce.Do(func() {
		// 初始立即采集一次
		CollectHostMetricsSample()

		gopool.Go(func() {
			ticker := time.NewTicker(HostMetricsSampleInterval)
			defer ticker.Stop()
			for range ticker.C {
				CollectHostMetricsSample()
			}
		})
	})
}

// CollectHostMetricsSample 采样当前机器系统资源指标
func CollectHostMetricsSample() HostMetricsOverview {
	now := time.Now()
	timestamp := now.Unix()
	timeStr := now.Format("15:04:05")

	// 1. Host Info
	var hostData HostInfo
	if hInfo, err := host.Info(); err == nil && hInfo != nil {
		hostData = HostInfo{
			Hostname: hInfo.Hostname,
			OS:       hInfo.OS,
			Platform: hInfo.Platform,
			Arch:     runtime.GOARCH,
			Uptime:   hInfo.Uptime,
			BootTime: hInfo.BootTime,
		}
	} else {
		hostname, _ := os.Hostname()
		hostData = HostInfo{
			Hostname: hostname,
			OS:       runtime.GOOS,
			Platform: runtime.GOOS,
			Arch:     runtime.GOARCH,
		}
	}

	// 2. CPU Info
	var cpuData CPUInfo
	logicalCores, _ := cpu.Counts(true)
	physicalCores, _ := cpu.Counts(false)
	if logicalCores <= 0 {
		logicalCores = runtime.NumCPU()
	}
	if physicalCores <= 0 {
		physicalCores = logicalCores
	}
	cpuData.LogicalCores = logicalCores
	cpuData.Cores = physicalCores

	if cpuInfos, err := cpu.Info(); err == nil && len(cpuInfos) > 0 {
		cpuData.ModelName = cpuInfos[0].ModelName
		cpuData.Mhz = cpuInfos[0].Mhz
	}

	// 获取 CPU 总体使用率 (间隔为 0 瞬时计算)
	if percents, err := cpu.Percent(0, false); err == nil && len(percents) > 0 {
		cpuData.UsagePercent = percents[0]
	} else {
		// 回退到 common.GetSystemStatus()
		sysStatus := common.GetSystemStatus()
		cpuData.UsagePercent = sysStatus.CPUUsage
	}

	// 3. Memory Info
	var memData MemoryInfo
	if vMem, err := mem.VirtualMemory(); err == nil && vMem != nil {
		memData.TotalBytes = vMem.Total
		memData.UsedBytes = vMem.Used
		memData.FreeBytes = vMem.Free
		memData.AvailableBytes = vMem.Available
		memData.UsagePercent = vMem.UsedPercent
	}
	if sMem, err := mem.SwapMemory(); err == nil && sMem != nil {
		memData.SwapTotalBytes = sMem.Total
		memData.SwapUsedBytes = sMem.Used
		memData.SwapUsagePercent = sMem.UsedPercent
	}

	// 4. Storage Info
	var storageData StorageInfo
	if dUsage, err := disk.Usage("/"); err == nil && dUsage != nil {
		storageData.TotalBytes = dUsage.Total
		storageData.UsedBytes = dUsage.Used
		storageData.FreeBytes = dUsage.Free
		storageData.UsagePercent = dUsage.UsedPercent
	} else {
		diskInfo := common.GetDiskSpaceInfo()
		storageData.TotalBytes = diskInfo.Total
		storageData.UsedBytes = diskInfo.Used
		storageData.FreeBytes = diskInfo.Free
		storageData.UsagePercent = diskInfo.UsedPercent
	}

	// 5. Load Avg
	var loadData LoadAvgInfo
	if lAvg, err := load.Avg(); err == nil && lAvg != nil {
		loadData.Load1 = lAvg.Load1
		loadData.Load5 = lAvg.Load5
		loadData.Load15 = lAvg.Load15
	}

	// 6. Go Runtime / Process
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	procData := ProcessInfo{
		NumGoroutines: runtime.NumGoroutine(),
		AllocBytes:    memStats.Alloc,
		SysBytes:      memStats.Sys,
		NumGC:         memStats.NumGC,
	}

	point := HostMetricsPoint{
		Timestamp: timestamp,
		TimeStr:   timeStr,
		CPU:       cpuData.UsagePercent,
		Memory:    memData.UsagePercent,
	}

	hostMetricsMutex.Lock()
	// 加入历史记录
	hostMetricsHistory = append(hostMetricsHistory, point)
	if len(hostMetricsHistory) > MaxHostMetricsHistoryPoints {
		hostMetricsHistory = hostMetricsHistory[len(hostMetricsHistory)-MaxHostMetricsHistoryPoints:]
	}

	historyCopy := make([]HostMetricsPoint, len(hostMetricsHistory))
	copy(historyCopy, hostMetricsHistory)

	currentHostMetrics = HostMetricsOverview{
		Host:        hostData,
		CPU:         cpuData,
		Memory:      memData,
		Storage:     storageData,
		LoadAvg:     loadData,
		Process:     procData,
		Current:     point,
		History:     historyCopy,
		UpdatedTime: timestamp,
	}
	res := currentHostMetrics
	hostMetricsMutex.Unlock()

	return res
}

// GetSystemHostMetricsOverview 获取当前系统资源状态
func GetSystemHostMetricsOverview() HostMetricsOverview {
	hostMetricsMutex.RLock()
	updated := currentHostMetrics.UpdatedTime
	hostMetricsMutex.RUnlock()

	// 若尚未采样，或者距上次采样已超过 30 秒，则立即采样一次
	if updated == 0 || time.Now().Unix()-updated > 30 {
		return CollectHostMetricsSample()
	}

	hostMetricsMutex.RLock()
	defer hostMetricsMutex.RUnlock()

	historyCopy := make([]HostMetricsPoint, len(currentHostMetrics.History))
	copy(historyCopy, currentHostMetrics.History)
	res := currentHostMetrics
	res.History = historyCopy
	return res
}
