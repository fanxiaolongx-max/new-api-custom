package controller

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetIBMC(c *gin.Context) {
	data, err := service.GetIBMC()
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

type ibmcActionRequest struct {
	Action   string `json:"action" binding:"required,oneof=start shutdown poweroff reset save pause resume boot mount eject snapshot uid alarm"`
	Device   string `json:"device,omitempty"`
	Media    string `json:"media,omitempty"`
	Enabled  *bool  `json:"enabled,omitempty"`
	Severity string `json:"severity,omitempty"`
}

func ControlIBMC(c *gin.Context) {
	var request ibmcActionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid iBMC action"})
		return
	}
	data, err := service.CallIBMC(http.MethodPost, "/v1/ibmc/action", request)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}

type ibmcSerialRequest struct {
	AutoLogin bool   `json:"auto_login,omitempty"`
	Operation string `json:"operation" binding:"required,oneof=open write close"`
	Session   string `json:"session,omitempty" binding:"max=64"`
	Data      string `json:"data,omitempty" binding:"max=5500"`
}

func WriteIBMCSerial(c *gin.Context) {
	if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
		c.AbortWithStatus(403)
		return
	}
	var request ibmcSerialRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid serial request"})
		return
	}
	// Keystrokes are private terminal traffic, not one administrative audit per key.
	// No request body, serial output, or lease token is logged.
	common.SetContextKey(c, constant.ContextKeyAuditLogged, true)
	data, err := service.CallIBMC(http.MethodPost, "/v1/ibmc/serial", request)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}

func ReadIBMCSerial(c *gin.Context) {
	if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
		c.AbortWithStatus(403)
		return
	}
	cursor, err := strconv.ParseInt(c.Query("cursor"), 10, 64)
	session := c.GetHeader("X-IBMC-Session")
	if err != nil || cursor < 0 || len(session) > 64 || session == "" {
		c.JSON(400, gin.H{"success": false, "message": "Invalid serial cursor or session"})
		return
	}
	data, err := service.CallIBMC(http.MethodGet, "/v1/ibmc/serial?session="+url.QueryEscape(session)+"&cursor="+strconv.FormatInt(cursor, 10), nil)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
