//go:build !windows

// install_unix.go - Linux 와 macOS 설치.
//
//	Linux  ~/.local/bin/chunjiin                      실행 파일
//	       ~/.local/share/applications/chunjiin.desktop  프로그램 목록 항목
//	       ~/.local/share/icons/hicolor/256x256/apps/    아이콘
//
//	macOS  ~/Applications/Chunjiin.app                앱 묶음
//	       Contents/MacOS/chunjiin, Contents/Info.plist
//
// 둘 다 사용자 홈 아래라 sudo 가 필요 없다.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/knix008/chunjiin/assets"
)

func defaultTarget() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Applications", appName+".app")
	}
	return filepath.Join(home, ".local", "share", appName)
}

func installedExePath(target string) string {
	if runtime.GOOS == "darwin" {
		return filepath.Join(target, "Contents", "MacOS", exeName())
	}
	return filepath.Join(target, exeName())
}

func install(target, name string) error {
	if runtime.GOOS == "darwin" {
		return installMac(target, name)
	}
	return installLinux(target, name)
}

// installLinux 는 실행 파일과 아이콘을 두고 프로그램 목록에 항목을 만든다.
func installLinux(target, name string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return fmt.Errorf("폴더를 만들지 못했습니다: %w", err)
	}
	exe := filepath.Join(target, name)
	if err := extractPayload(exe); err != nil {
		return err
	}

	home, _ := os.UserHomeDir()

	// PATH 에 잡히도록 ~/.local/bin 에 심볼릭 링크를 건다.
	binDir := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(binDir, 0o755); err == nil {
		link := filepath.Join(binDir, name)
		_ = os.Remove(link)
		_ = os.Symlink(exe, link)
	}

	iconDir := filepath.Join(home, ".local", "share", "icons",
		"hicolor", "256x256", "apps")
	iconPath := filepath.Join(iconDir, "chunjiin.png")
	if err := os.MkdirAll(iconDir, 0o755); err == nil {
		_ = os.WriteFile(iconPath, assets.Icon.Content(), 0o644)
	}

	appDir := filepath.Join(home, ".local", "share", "applications")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return fmt.Errorf("프로그램 목록 폴더를 만들지 못했습니다: %w", err)
	}

	desktop := "[Desktop Entry]\n" +
		"Type=Application\n" +
		"Name=Chunjiin Hangul Keyboard\n" +
		"Name[ko]=천지인 한글 입력기\n" +
		"Comment=12-key Chunjiin Hangul input\n" +
		"Comment[ko]=12키 천지인 자판 한글 입력기\n" +
		"Exec=" + exe + "\n" +
		"Icon=" + iconPath + "\n" +
		"Terminal=false\n" +
		"Categories=Utility;\n" +
		"StartupWMClass=chunjiin\n"

	return os.WriteFile(filepath.Join(appDir, "chunjiin.desktop"),
		[]byte(desktop), 0o644)
}

// installMac 은 .app 묶음을 만든다.
func installMac(target, name string) error {
	macOS := filepath.Join(target, "Contents", "MacOS")
	res := filepath.Join(target, "Contents", "Resources")

	for _, d := range []string{macOS, res} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("폴더를 만들지 못했습니다: %w", err)
		}
	}

	if err := extractPayload(filepath.Join(macOS, name)); err != nil {
		return err
	}
	_ = os.WriteFile(filepath.Join(res, "chunjiin.png"), assets.Icon.Content(), 0o644)

	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key><string>Chunjiin</string>
	<key>CFBundleDisplayName</key><string>Chunjiin</string>
	<key>CFBundleIdentifier</key><string>com.knix008.chunjiin</string>
	<key>CFBundleVersion</key><string>` + Version + `</string>
	<key>CFBundleShortVersionString</key><string>` + Version + `</string>
	<key>CFBundleExecutable</key><string>` + name + `</string>
	<key>CFBundleIconFile</key><string>chunjiin.png</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`
	return os.WriteFile(filepath.Join(target, "Contents", "Info.plist"),
		[]byte(plist), 0o644)
}

func uninstall(target string) error {
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("폴더를 지우지 못했습니다: %w", err)
	}

	if runtime.GOOS != "darwin" {
		home, _ := os.UserHomeDir()
		_ = os.Remove(filepath.Join(home, ".local", "bin", exeName()))
		_ = os.Remove(filepath.Join(home, ".local", "share", "applications",
			"chunjiin.desktop"))
		_ = os.Remove(filepath.Join(home, ".local", "share", "icons",
			"hicolor", "256x256", "apps", "chunjiin.png"))
	}
	return nil
}
