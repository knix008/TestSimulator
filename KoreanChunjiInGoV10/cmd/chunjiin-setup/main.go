// chunjiin-setup - 천지인 한글 입력기 설치 프로그램.
//
// C++ 판의 installer/setup.c 와 같은 생각으로 만들었다. 실행 파일을 자기
// 안에 리소스로 품고 있다가 설치 폴더에 푼다. 관리자 권한은 필요 없다.
// 다른 설치 도구(Inno Setup, NSIS, dpkg)를 깔지 않아도 되도록 Go 로만 짰다.
//
//	Windows  %LOCALAPPDATA%\Programs\Chunjiin   + 시작 메뉴 바로 가기
//	Linux    ~/.local/bin                       + .desktop 항목
//	macOS    ~/Applications/Chunjiin.app        (앱 묶음)
//
// 품고 있는 실행 파일은 payload 폴더에서 온다. scripts/package.ps1 (또는
// package.sh) 가 앱을 먼저 빌드해 그 폴더에 넣은 뒤 이 프로그램을 빌드한다.
//
// Windows 탐색기 아이콘은 rsrc_windows_amd64.syso 가 담당한다.
// scripts/embed-win-icon.ps1 또는 아래 generate 로 만든다.
package main

//go:generate go run github.com/tc-hib/go-winres@v0.3.3 simply --icon ../../assets/chunjiin.ico --arch amd64 --manifest gui --product-name 천지인 한글 입력기 --file-description 천지인 한글 입력기 설치 --original-filename chunjiin-setup.exe --product-version 1.0.0.0 --file-version 1.0.0.0

import (
	"embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"

	"fyne.io/fyne/v2"
	fyneapp "fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/knix008/chunjiin/assets"
)

//go:embed payload
var payload embed.FS

// Version 은 설치할 판 번호다. 빌드할 때 -ldflags 로 덮어쓴다.
var Version = "1.0"

const appName = "Chunjiin"

// exeName 은 payload 안에 든 실행 파일의 이름이다.
func exeName() string {
	if runtime.GOOS == "windows" {
		return "chunjiin.exe"
	}
	return "chunjiin"
}

func payloadPath() string { return "payload/" + exeName() }

// hasPayload 는 설치할 실행 파일이 들어 있는지만 본다.
// ReadFile 은 수십 MB 를 메모리에 올리므로 쓰면 창이 뜨기 전에 멈춘다.
func hasPayload() bool {
	f, err := payload.Open(payloadPath())
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}

// extractPayload 는 품고 있는 실행 파일을 dest 로 흘려 보낸다.
func extractPayload(dest string) error {
	if err := copyPayload(dest); err == nil {
		return nil
	}
	old := dest + ".old"
	_ = os.Remove(old)
	if err := os.Rename(dest, old); err != nil {
		return fmt.Errorf("실행 파일을 쓰지 못했습니다(프로그램이 실행 중일 수 있습니다): %w", err)
	}
	if err := copyPayload(dest); err != nil {
		return fmt.Errorf("실행 파일을 쓰지 못했습니다: %w", err)
	}
	return nil
}

func copyPayload(dest string) error {
	src, err := payload.Open(payloadPath())
	if err != nil {
		return fmt.Errorf("품고 있는 실행 파일을 읽지 못했습니다: %w", err)
	}
	defer src.Close()

	f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(f, src)
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func main() {
	a := fyneapp.NewWithID("com.knix008.chunjiin.setup")
	a.SetIcon(assets.Icon)

	w := a.NewWindow("천지인 한글 입력기 설치")
	w.SetIcon(assets.Icon)

	ui := newSetupUI(a, w)
	w.SetContent(ui.content())
	w.Resize(fyne.NewSize(520, 300))
	w.CenterOnScreen()
	w.ShowAndRun()
}

type setupUI struct {
	app fyne.App
	win fyne.Window

	pathEntry *widget.Entry
	status    *widget.Label
	install   *widget.Button
	remove    *widget.Button
	busy      bool
}

func newSetupUI(a fyne.App, w fyne.Window) *setupUI {
	u := &setupUI{app: a, win: w}

	u.pathEntry = widget.NewEntry()
	u.pathEntry.SetText(defaultTarget())

	u.status = widget.NewLabel("")
	u.status.Wrapping = fyne.TextWrapWord

	return u
}

func (u *setupUI) content() fyne.CanvasObject {
	title := widget.NewLabelWithStyle(
		"천지인 한글 입력기  "+Version, fyne.TextAlignLeading,
		fyne.TextStyle{Bold: true})

	intro := widget.NewLabel(
		"12키 천지인 자판으로 한글을 조합하는 프로그램입니다.\n" +
			"관리자 권한 없이 아래 폴더에 설치됩니다.")
	intro.Wrapping = fyne.TextWrapWord

	browse := widget.NewButtonWithIcon("", theme.FolderOpenIcon(), func() {
		dialog.ShowFolderOpen(func(list fyne.ListableURI, err error) {
			if err != nil || list == nil {
				return
			}
			u.pathEntry.SetText(filepath.Join(list.Path(), appName))
		}, u.win)
	})

	pathRow := container.NewBorder(nil, nil, nil, browse, u.pathEntry)

	u.install = widget.NewButtonWithIcon("설치", theme.DownloadIcon(), u.doInstall)
	u.install.Importance = widget.HighImportance

	u.remove = widget.NewButtonWithIcon("제거", theme.DeleteIcon(), u.doRemove)

	quit := widget.NewButton("닫기", func() { u.win.Close() })

	if !hasPayload() {
		u.install.Disable()
		u.status.SetText(
			"설치할 실행 파일이 들어 있지 않습니다.\n" +
				"scripts/package.ps1 (또는 package.sh) 로 다시 빌드하세요.")
	} else if installed(u.pathEntry.Text) {
		u.status.SetText("이미 설치되어 있습니다. 다시 설치하면 덮어씁니다.")
	}

	buttons := container.NewHBox(u.install, u.remove, widget.NewSeparator(), quit)

	return container.NewPadded(container.NewVBox(
		title,
		intro,
		widget.NewSeparator(),
		widget.NewLabel("설치 폴더"),
		pathRow,
		widget.NewSeparator(),
		buttons,
		u.status,
	))
}

func (u *setupUI) setBusy(on bool) {
	u.busy = on
	if on {
		u.install.Disable()
		u.remove.Disable()
		u.pathEntry.Disable()
	} else {
		u.install.Enable()
		u.remove.Enable()
		u.pathEntry.Enable()
	}
}

func (u *setupUI) doInstall() {
	if u.busy {
		return
	}
	target := u.pathEntry.Text
	if target == "" {
		u.status.SetText("설치 폴더를 정해 주세요.")
		return
	}

	u.setBusy(true)
	u.status.SetText("설치하는 중입니다…")

	go func() {
		err := install(target, exeName())
		fyne.Do(func() {
			u.setBusy(false)
			if err != nil {
				u.fail(err)
				return
			}
			u.status.SetText("설치를 마쳤습니다.\n" + target)
			dialog.ShowInformation("설치 완료",
				"천지인 한글 입력기를 설치했습니다.\n\n"+target, u.win)
		})
	}()
}

func (u *setupUI) doRemove() {
	if u.busy {
		return
	}
	target := u.pathEntry.Text

	if !installed(target) {
		u.status.SetText("그 폴더에 설치된 것이 없습니다.")
		return
	}

	dialog.ShowConfirm("제거", "설치한 파일을 모두 지울까요?\n\n"+target,
		func(ok bool) {
			if !ok || u.busy {
				return
			}
			u.setBusy(true)
			u.status.SetText("제거하는 중입니다…")
			go func() {
				err := uninstall(target)
				fyne.Do(func() {
					u.setBusy(false)
					if err != nil {
						u.fail(err)
						return
					}
					u.status.SetText("제거를 마쳤습니다.")
				})
			}()
		}, u.win)
}

func (u *setupUI) fail(err error) {
	u.status.SetText("실패: " + err.Error())
	dialog.ShowError(err, u.win)
}

// installed 는 그 폴더에 이미 설치되어 있는지 본다.
func installed(target string) bool {
	if target == "" {
		return false
	}
	_, err := os.Stat(installedExePath(target))
	return err == nil
}
