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

package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetONTMonitorHistory(c *gin.Context) {
	if !common.IsMasterNode {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "ONT monitoring is available on the primary node only"})
		return
	}
	hours, err := strconv.Atoi(c.DefaultQuery("hours", "24"))
	if err != nil || (hours != 1 && hours != 6 && hours != 24 && hours != 168 && hours != 720) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid ONT history window"})
		return
	}
	history, err := service.GetONTHistory(hours)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Unable to read ONT history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": history})
}

func GetONTMonitor(c *gin.Context) {
	if !common.IsMasterNode {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "ONT monitoring is available on the primary node only"})
		return
	}
	view, err := service.GetONTOverview()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Unable to load ONT settings; check the database and deployment secret"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

func UpdateONTMonitor(c *gin.Context) {
	if !common.IsMasterNode {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Configure ONT monitoring on the primary node"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var input service.ONTConfigInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid ONT settings"})
		return
	}
	if err := service.SaveONTConfig(input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func RefreshONTMonitor(c *gin.Context) {
	if !common.IsMasterNode {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Refresh ONT monitoring on the primary node"})
		return
	}
	if err := service.QueueONTRefresh(); err != nil {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true})
}
