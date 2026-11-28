package controller

import (
	"net/http"
	"net/url"
	"regexp"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func validIBMCNode(node string) bool {
	return node == "" || ibmcSerialNodePattern.MatchString(node)
}

func GetIBMC(c *gin.Context) {
	node := c.Query("node")
	if !validIBMCNode(node) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid iBMC node"})
		return
	}
	data, err := service.GetIBMCForNode(node)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

type ibmcActionRequest struct {
	Node     string `json:"node,omitempty" binding:"omitempty,max=16"`
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
	if !validIBMCNode(request.Node) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid iBMC node"})
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
	// Node selects a provisioned lab guest's COM1; empty means the original openEuler.
	Node string `json:"node,omitempty" binding:"omitempty,max=16"`
}

// Lab guests are named Node-NN by the provisioning slots.
var ibmcSerialNodePattern = regexp.MustCompile(`^Node-[0-9]{2,3}$`)

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
	if !validIBMCNode(request.Node) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid serial node"})
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
	node := c.Query("node")
	if err != nil || cursor < 0 || len(session) > 64 || session == "" ||
		!validIBMCNode(node) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid serial cursor or session"})
		return
	}
	query := "/v1/ibmc/serial?session=" + url.QueryEscape(session) + "&cursor=" + strconv.FormatInt(cursor, 10)
	if node != "" {
		query += "&node=" + url.QueryEscape(node)
	}
	data, err := service.CallIBMC(http.MethodGet, query, nil)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
