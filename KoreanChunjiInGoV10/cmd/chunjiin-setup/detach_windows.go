//go:build windows

package main

import "syscall"

// detached 는 지우기를 맡을 cmd 창이 뜨지 않게 한다.
func detached() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}
