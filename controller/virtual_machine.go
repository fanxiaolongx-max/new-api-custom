/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

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
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type virtualMachineActionRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown save poweroff"`
}

type virtualMachineInputRequest struct {
	Text      string `json:"text"`
	Scancodes []int  `json:"scancodes"`
	X         *int   `json:"x"`
	Y         *int   `json:"y"`
	Buttons   int    `json:"buttons"`
}

func writeVirtualMachineError(c *gin.Context, err error) {
	status := http.StatusBadGateway
	if errors.Is(err, service.ErrVMAgentUnavailable) {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}

func ListVirtualMachines(c *gin.Context) {
	machines, err := service.ListVirtualMachines()
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": machines})
}

func ControlVirtualMachine(c *gin.Context) {
	var request virtualMachineActionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid virtual machine action"})
		return
	}
	machine, err := service.ControlVirtualMachine(c.Param("name"), request.Action)
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": machine})
}

func GetVirtualMachineScreenshot(c *gin.Context) {
	image, err := service.GetVirtualMachineScreenshot(c.Param("name"))
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "image/png", image)
}

func SendVirtualMachineKeyboard(c *gin.Context) {
	sendVirtualMachineInput(c, "keyboard")
}

func SendVirtualMachineMouse(c *gin.Context) {
	sendVirtualMachineInput(c, "mouse")
}

func sendVirtualMachineInput(c *gin.Context, inputType string) {
	var request virtualMachineInputRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid virtual machine input"})
		return
	}
	err := service.SendVirtualMachineInput(c.Param("name"), inputType, service.VirtualMachineInput{
		Text: request.Text, Scancodes: request.Scancodes,
		X: request.X, Y: request.Y, Buttons: request.Buttons,
	})
	if err != nil {
		writeVirtualMachineError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
