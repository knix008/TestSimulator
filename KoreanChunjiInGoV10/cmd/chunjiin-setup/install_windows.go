//go:build windows

// install_windows.go - Windows 설치.
//
//	%LOCALAPPDATA%\Programs\Chunjiin\chunjiin.exe   실행 파일
//	시작 메뉴\프로그램\천지인 한글 입력기.lnk        바로 가기
//	HKCU\...\Uninstall\Chunjiin                     "설정 > 앱" 목록
//
// 모두 사용자 영역이라 관리자 권한이 필요 없다.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unicode/utf16"

	"golang.org/x/sys/windows/registry"
)

const uninstallKey = `Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin`

func defaultTarget() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserHomeDir()
	}
	return filepath.Join(base, "Programs", appName)
}

func installedExePath(target string) string {
	return filepath.Join(target, exeName())
}

// shortcutPath 는 시작 메뉴 바로 가기의 자리다.
func shortcutPath() string {
	return filepath.Join(os.Getenv("APPDATA"),
		`Microsoft\Windows\Start Menu\Programs`, "천지인 한글 입력기.lnk")
}

func install(target, name string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return fmt.Errorf("폴더를 만들지 못했습니다: %w", err)
	}

	exe := filepath.Join(target, name)
	if err := extractPayload(exe); err != nil {
		return err
	}
	if err := writeUninstallBat(target); err != nil {
		return fmt.Errorf("제거 스크립트를 쓰지 못했습니다: %w", err)
	}

	if err := makeShortcut(shortcutPath(), exe, target); err != nil {
		return fmt.Errorf("바로 가기를 만들지 못했습니다: %w", err)
	}
	if err := writeUninstallEntry(target, exe); err != nil {
		return fmt.Errorf("등록 정보를 쓰지 못했습니다: %w", err)
	}
	return nil
}

// writeUninstallBat 은 설정 > 앱 에서 쓸 작은 제거 스크립트를 둔다.
// 설치 프로그램 자신(수십 MB)을 복사하지 않는다.
func writeUninstallBat(target string) error {
	link := shortcutPath()
	body := "@echo off\r\n" +
		"del /f /q " + cmdQuote(link) + " >nul 2>nul\r\n" +
		"reg delete \"HKCU\\" + uninstallKey + "\" /f >nul 2>nul\r\n" +
		"cd /d \"%TEMP%\"\r\n" +
		"start \"\" /min cmd /c \"timeout /t 1 /nobreak >nul & rd /s /q " + cmdQuote(target) + "\"\r\n"
	return os.WriteFile(filepath.Join(target, "uninstall.bat"),
		utf16LE(body), 0o755)
}

func cmdQuote(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }

// makeShortcut 은 .lnk 파일을 만든다.
//
// PowerShell 은 켜지는 데만 수 초가 걸린다. Windows 에 늘 있는
// cscript 가 같은 WScript.Shell 을 훨씬 빨리 부른다.
func makeShortcut(link, exe, workDir string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}

	vbs := filepath.Join(os.TempDir(), "chunjiin-lnk.vbs")
	q := func(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }
	script := "Set s = CreateObject(\"WScript.Shell\").CreateShortcut(" + q(link) + ")\r\n" +
		"s.TargetPath = " + q(exe) + "\r\n" +
		"s.WorkingDirectory = " + q(workDir) + "\r\n" +
		"s.IconLocation = " + q(exe) + "\r\n" +
		"s.Description = \"천지인 한글 입력기\"\r\n" +
		"s.Save\r\n"
	if err := os.WriteFile(vbs, utf16LE(script), 0o644); err != nil {
		return err
	}
	defer os.Remove(vbs)

	cmd := exec.Command("cscript.exe", "//Nologo", "//B", vbs)
	cmd.SysProcAttr = detached()
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// utf16LE 는 Windows 스크립트가 한글 경로를 읽도록 BOM 을 붙인다.
func utf16LE(s string) []byte {
	u := utf16.Encode([]rune(s))
	out := make([]byte, 2+len(u)*2)
	out[0], out[1] = 0xFF, 0xFE
	for i, r := range u {
		out[2+2*i] = byte(r)
		out[2+2*i+1] = byte(r >> 8)
	}
	return out
}

// writeUninstallEntry 는 "설정 > 앱" 목록에 나오도록 등록 정보를 쓴다.
func writeUninstallEntry(target, exe string) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, uninstallKey, registry.WRITE)
	if err != nil {
		return err
	}
	defer k.Close()

	pairs := []struct{ name, value string }{
		{"DisplayName", "천지인 한글 입력기"},
		{"DisplayVersion", Version},
		{"Publisher", "SHKWON"},
		{"DisplayIcon", exe},
		{"InstallLocation", target},
		{"UninstallString", `"` + filepath.Join(target, "uninstall.bat") + `"`},
	}
	for _, p := range pairs {
		if err := k.SetStringValue(p.name, p.value); err != nil {
			return err
		}
	}
	return k.SetDWordValue("NoModify", 1)
}

func uninstall(target string) error {
	_ = os.Remove(shortcutPath())
	_ = registry.DeleteKey(registry.CURRENT_USER, uninstallKey)

	// 제거기 자신이 그 폴더에서 돌고 있으면 지금 지울 수 없다.
	// 잠깐 기다렸다 지우는 cmd 를 띄우고 우리는 물러난다.
	self, err := os.Executable()
	if err == nil && strings.HasPrefix(strings.ToLower(self), strings.ToLower(target)) {
		cmd := exec.Command("cmd", "/C",
			"timeout /t 2 /nobreak >nul & rd /s /q "+`"`+target+`"`)
		cmd.SysProcAttr = detached()
		return cmd.Start()
	}

	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("폴더를 지우지 못했습니다: %w", err)
	}
	return nil
}
