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

func install(target, name string, data []byte) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return fmt.Errorf("폴더를 만들지 못했습니다: %w", err)
	}

	exe := filepath.Join(target, name)
	if err := writeExe(exe, data); err != nil {
		return err
	}

	// 설치 프로그램 자신을 제거기로 복사해 둔다.
	if self, err := os.Executable(); err == nil {
		if raw, err := os.ReadFile(self); err == nil {
			_ = os.WriteFile(filepath.Join(target, "uninstall.exe"), raw, 0o755)
		}
	}

	if err := makeShortcut(shortcutPath(), exe, target); err != nil {
		return fmt.Errorf("바로 가기를 만들지 못했습니다: %w", err)
	}
	if err := writeUninstallEntry(target, exe); err != nil {
		return fmt.Errorf("등록 정보를 쓰지 못했습니다: %w", err)
	}
	return nil
}

// writeExe 는 실행 파일을 쓴다.
// 이미 돌고 있으면 덮어쓸 수 없으므로, 옆으로 밀어 두고 새로 쓴다.
func writeExe(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0o755); err == nil {
		return nil
	}

	old := path + ".old"
	_ = os.Remove(old)
	if err := os.Rename(path, old); err != nil {
		return fmt.Errorf("실행 파일을 쓰지 못했습니다(프로그램이 실행 중일 수 있습니다): %w", err)
	}
	if err := os.WriteFile(path, data, 0o755); err != nil {
		return fmt.Errorf("실행 파일을 쓰지 못했습니다: %w", err)
	}
	return nil
}

// makeShortcut 은 .lnk 파일을 만든다.
//
// IShellLink 는 COM 이라 Go 에서 직접 부르려면 의존성이 늘어난다.
// Windows 에 늘 있는 PowerShell 의 WScript.Shell 로 대신한다.
func makeShortcut(link, exe, workDir string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}

	// 작은따옴표는 PowerShell 문자열에서 두 번 적어 막는다.
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

	script := "$s = (New-Object -ComObject WScript.Shell).CreateShortcut(" + q(link) + ");" +
		"$s.TargetPath = " + q(exe) + ";" +
		"$s.WorkingDirectory = " + q(workDir) + ";" +
		"$s.IconLocation = " + q(exe) + ";" +
		"$s.Description = '천지인 한글 입력기';" +
		"$s.Save()"

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
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
		{"UninstallString", filepath.Join(target, "uninstall.exe")},
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
