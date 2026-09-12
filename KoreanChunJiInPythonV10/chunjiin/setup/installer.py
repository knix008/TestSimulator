"""installer.py - 운영체제마다 다른 설치 자리와 절차.

    Windows  %LOCALAPPDATA%\\Programs\\Chunjiin\\chunjiin.exe   실행 파일
             시작 메뉴\\프로그램\\천지인 한글 입력기.lnk        바로 가기
             HKCU\\...\\Uninstall\\Chunjiin                     "설정 > 앱" 목록

    Linux    ~/.local/share/Chunjiin/chunjiin                실행 파일
             ~/.local/bin/chunjiin                           PATH 에 걸리는 링크
             ~/.local/share/applications/chunjiin.desktop    프로그램 목록 항목
             ~/.local/share/icons/.../chunjiin.png           아이콘

    macOS    ~/Applications/Chunjiin.app                     앱 묶음

모두 사용자 영역이라 관리자 권한(sudo)이 필요 없다.

모듈 이름이 install.py 가 아닌 까닭: 그러면 꾸러미 안에서 모듈 `install`
과 함수 `install()` 이 같은 이름을 다툰다. __init__.py 가 함수를 내보내는
순간 모듈이 가려져 `from . import install` 이 함수를 집어 온다.
"""

from __future__ import annotations

import ctypes
import os
import shutil
import stat
import subprocess
import sys
import tempfile

from chunjiin import __version__ as VERSION

APP_NAME = "Chunjiin"
DISPLAY_NAME = "천지인 한글 입력기"
PUBLISHER = "SHKWON"

# "설정 > 앱" 목록에 나오는 등록 자리다. 사용자 영역(HKCU)이라 관리자 권한이 필요 없다.
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin"

# 리눅스 프로그램 목록 항목이다.
DESKTOP_ENTRY = """[Desktop Entry]
Type=Application
Name=Chunjiin Hangul Keyboard
Name[ko]=천지인 한글 입력기
Comment=12-key Chunjiin Hangul input
Comment[ko]=12키 천지인 자판 한글 입력기
Exec={exe}
Icon={icon}
Terminal=false
Categories=Utility;
StartupWMClass=chunjiin
"""

# macOS 앱 묶음 정보다.
INFO_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key><string>{name}</string>
\t<key>CFBundleDisplayName</key><string>{name}</string>
\t<key>CFBundleIdentifier</key><string>com.knix008.chunjiin</string>
\t<key>CFBundleVersion</key><string>{version}</string>
\t<key>CFBundleShortVersionString</key><string>{version}</string>
\t<key>CFBundleExecutable</key><string>{exe}</string>
\t<key>CFBundleIconFile</key><string>chunjiin.png</string>
\t<key>CFBundlePackageType</key><string>APPL</string>
\t<key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
"""


class InstallError(Exception):
    """설치나 제거가 실패했을 때다. 메시지는 그대로 사람에게 보여 준다."""


# ---------------------------------------------------------------------
# 자리
# ---------------------------------------------------------------------


def exe_name():
    """품고 있는 실행 파일의 이름이다."""
    return "chunjiin.exe" if sys.platform == "win32" else "chunjiin"


def home():
    return os.environ.get("HOME") or os.environ.get("USERPROFILE") or os.path.expanduser("~") or "."


def default_target():
    """설치 폴더의 기본값이다."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or home()
        return os.path.join(base, "Programs", APP_NAME)
    if sys.platform == "darwin":
        return os.path.join(home(), "Applications", APP_NAME + ".app")
    return os.path.join(home(), ".local", "share", APP_NAME)


def installed_exe(target):
    """설치된 실행 파일의 자리다."""
    if sys.platform == "darwin":
        return os.path.join(target, "Contents", "MacOS", exe_name())
    return os.path.join(target, exe_name())


def is_installed(target):
    """그 폴더에 이미 설치되어 있는지 본다."""
    return bool(target) and os.path.isfile(installed_exe(target))


def icon_source():
    """함께 배포하는 아이콘(PNG)의 자리다. 없으면 None 이다."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        p = os.path.join(base, "assets", "chunjiin.png")
    else:
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        p = os.path.join(root, "assets", "chunjiin.png")
    return p if os.path.isfile(p) else None


# ---------------------------------------------------------------------
# 공통 - 품은 앱을 그 자리에 놓는다
# ---------------------------------------------------------------------


def _place(payload, exe):
    """품은 앱(파일 하나 또는 한 폴더 묶음)을 `exe` 자리에 놓는다.

    한 파일이면 그 파일을 `exe` 로 복사한다. 한 폴더 묶음이면 폴더 안의
    것들을 `exe` 의 폴더로 옮기고 실행 파일 이름을 맞춘다.
    """
    dest_dir = os.path.dirname(exe)
    os.makedirs(dest_dir, exist_ok=True)

    if os.path.isdir(payload):
        for name in os.listdir(payload):
            src = os.path.join(payload, name)
            dst = os.path.join(dest_dir, name)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                _write_file(dst, src)
        inner = os.path.join(dest_dir, exe_name())
        if not os.path.isfile(inner):
            raise InstallError(f"묶음 안에 {exe_name()} 이 없습니다: {payload}")
        if os.path.abspath(inner) != os.path.abspath(exe):
            _write_file(exe, inner)
    else:
        _write_file(exe, payload)

    if sys.platform != "win32":
        os.chmod(exe, os.stat(exe).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _write_file(dst, src):
    """파일을 복사한다. Windows 는 돌고 있는 실행 파일을 덮어쓰지 못하므로 옆으로 밀어 두고 쓴다."""
    try:
        shutil.copy2(src, dst)
        return
    except OSError:
        if not os.path.exists(dst):
            raise InstallError(f"실행 파일을 쓰지 못했습니다: {dst}") from None
    old = dst + ".old"
    try:
        if os.path.exists(old):
            os.remove(old)
        os.replace(dst, old)
        shutil.copy2(src, dst)
    except OSError as e:
        raise InstallError(f"실행 파일을 쓰지 못했습니다(프로그램이 실행 중일 수 있습니다): {e}") from e
    try:
        os.remove(old)
    except OSError:
        pass  # 아직 돌고 있으면 남는다. 다음 설치가 치운다.


def uninstaller_name():
    return "uninstall.exe" if sys.platform == "win32" else "uninstall"


def self_path():
    """실행 파일로 묶여 돌고 있으면 그 자리, 소스로 돌면 None 이다."""
    return os.path.abspath(sys.executable) if getattr(sys, "frozen", False) else None


def running_inside(target):
    """이 프로그램이 `target` 안에서 돌고 있는지 본다(설치 폴더의 제거기)."""
    me = self_path()
    if not me or not target:
        return False
    return os.path.normcase(me).startswith(os.path.normcase(os.path.abspath(target)) + os.sep)


def own_install_dir():
    """이 프로그램이 설치 폴더 안의 제거기로 돌고 있으면 그 폴더, 아니면 None 이다.

    `설정 > 앱 > 제거` 는 설치 폴더의 uninstall.exe 를 그냥 띄운다. 그때 설치
    창을 보여 주면 헷갈리므로, 자기가 어디서 도는지 보고 제거 쪽으로 연다.
    """
    me = self_path()
    # 이름이 uninstall(.exe) 일 때만이다. 저장소 루트처럼 chunjiin.exe 와
    # chunjiin-setup.exe 가 나란히 있는 폴더를 설치 폴더로 잘못 보면, 제거가
    # 그 폴더를 통째로 지운다.
    if not me or os.path.basename(me).lower() != uninstaller_name():
        return None
    here = os.path.dirname(me)
    if sys.platform == "darwin":
        # Chunjiin.app/Contents/MacOS/uninstall -> Chunjiin.app
        app = os.path.dirname(os.path.dirname(here))
        return app if is_installed(app) else None
    return here if is_installed(here) else None


def _copy_self(target):
    """설치 프로그램 자신을 제거기로 복사해 둔다. 소스로 돌 때는 하지 않는다."""
    me = self_path()
    if not me:
        return None
    dst = os.path.join(target, uninstaller_name())
    if os.path.normcase(me) == os.path.normcase(dst):
        return dst  # 제거기 자신이 다시 설치하는 경우다. 자기를 자기에 덮어쓸 수 없다.
    try:
        _write_file(dst, me)
        return dst
    except (OSError, InstallError):
        return None


def wipe(target):
    """설치 폴더 안의 것을 모두 지운다. 다시 설치하기 전에 깨끗이 비울 때 쓴다.

    이 프로그램이 그 폴더 안에서 돌고 있으면 자기 자신만 남긴다. 그 파일은
    설치가 끝나면 제거기로 그대로 쓰인다.
    """
    if not os.path.isdir(target):
        return
    me = self_path()
    for name in os.listdir(target):
        p = os.path.join(target, name)
        if me and os.path.normcase(p) == os.path.normcase(me):
            continue
        try:
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.rmtree(p)
            else:
                os.remove(p)
        except OSError as e:
            raise InstallError(f"기존 파일을 지우지 못했습니다(프로그램이 실행 중일 수 있습니다): {e}") from e


# ---------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------


def _shortcut_path():
    appdata = os.environ.get("APPDATA") or home()
    return os.path.join(appdata, r"Microsoft\Windows\Start Menu\Programs", DISPLAY_NAME + ".lnk")


def _ps_quote(s):
    """PowerShell 작은따옴표 문자열이다. 작은따옴표는 두 번 적어 막는다."""
    return "'" + s.replace("'", "''") + "'"


def _run(args):
    out = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    if out.returncode != 0:
        raise InstallError((out.stderr or out.stdout or "").strip() or f"{args[0]} 이 실패했습니다")
    return out


def _make_shortcut(link, exe, work_dir):
    """.lnk 파일을 만든다. COM 대신 Windows 에 늘 있는 PowerShell 의 WScript.Shell 로 한다."""
    os.makedirs(os.path.dirname(link), exist_ok=True)
    script = (
        f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut({_ps_quote(link)});"
        f"$s.TargetPath = {_ps_quote(exe)};"
        f"$s.WorkingDirectory = {_ps_quote(work_dir)};"
        f"$s.IconLocation = {_ps_quote(exe)};"
        f"$s.Description = {_ps_quote(DISPLAY_NAME)};"
        "$s.Save()"
    )
    _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script])


def _reg_add(name, value, kind="REG_SZ"):
    _run(["reg", "add", "HKCU\\" + UNINSTALL_KEY, "/v", name, "/t", kind, "/d", value, "/f"])


def _write_uninstall_entry(target, exe, uninstaller):
    """"설정 > 앱" 목록에 나오도록 등록 정보를 쓴다. 레지스트리 꾸러미 대신 reg.exe 를 쓴다."""
    for name, value in (
        ("DisplayName", DISPLAY_NAME),
        ("DisplayVersion", VERSION),
        ("Publisher", PUBLISHER),
        ("DisplayIcon", exe),
        ("InstallLocation", target),
        ("UninstallString", f'"{uninstaller}" --uninstall --target "{target}"' if uninstaller else exe),
    ):
        _reg_add(name, value)
    try:
        _reg_add("NoModify", "1", "REG_DWORD")
    except InstallError:
        pass


def _registered_location():
    """등록 정보에 적힌 설치 폴더다. 등록이 없거나 읽지 못하면 None 이다."""
    try:
        out = subprocess.run(
            ["reg", "query", "HKCU\\" + UNINSTALL_KEY, "/v", "InstallLocation"],
            capture_output=True, text=True, encoding="mbcs", errors="replace", check=False,
        )
    except OSError:
        return None
    if out.returncode != 0:
        return None
    for line in out.stdout.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[0] == "InstallLocation":
            return parts[2].strip()
    return None


def _short_path(path):
    """8.3 짧은 이름이다. 못 얻으면 원래 경로를 그대로 돌려준다.

    사용자 이름이 한글이면 설치 경로에도 한글이 들어간다. 배치 파일은
    유니코드가 아니라 시스템 코드페이지로 읽히므로, 될 수 있으면 아스키인
    짧은 이름으로 바꿔 적는다.
    """
    if sys.platform != "win32" or not path:
        return path
    try:
        fn = ctypes.windll.kernel32.GetShortPathNameW
        buf = ctypes.create_unicode_buffer(1024)
        n = fn(path, buf, len(buf))
        if 0 < n < len(buf):
            return buf.value
    except (AttributeError, OSError):
        pass
    return path


def _install_windows(target, payload):
    try:
        os.makedirs(target, exist_ok=True)
    except OSError as e:
        raise InstallError(f"폴더를 만들지 못했습니다: {e}") from e

    exe = installed_exe(target)
    _place(payload, exe)
    uninstaller = _copy_self(target)

    try:
        _make_shortcut(_shortcut_path(), exe, target)
    except InstallError as e:
        raise InstallError(f"바로 가기를 만들지 못했습니다: {e}") from e
    try:
        _write_uninstall_entry(target, exe, uninstaller)
    except InstallError as e:
        raise InstallError(f"등록 정보를 쓰지 못했습니다: {e}") from e


def _uninstall_windows(target):
    # 시작 메뉴와 "설정 > 앱" 등록은 사용자마다 하나뿐이다. 다른 폴더에 설치한
    # 것을 가리키고 있으면 건드리지 않는다.
    loc = _registered_location()
    mine = loc is None or os.path.normcase(os.path.abspath(loc)) == os.path.normcase(target)
    if mine:
        try:
            os.remove(_shortcut_path())
        except OSError:
            pass
        subprocess.run(["reg", "delete", "HKCU\\" + UNINSTALL_KEY, "/f"], capture_output=True, check=False)

    # 제거기 자신이 그 폴더에서 돌고 있으면 지금 지울 수 없다. 이 프로그램이
    # 끝나기를 기다렸다 지우는 배치 파일을 띄우고 물러난다.
    #
    # 기다리는 데 timeout 을 쓰면 안 된다. 그 명령은 콘솔에서 키를 읽으려
    # 하므로 창 없이 띄운 프로세스에서는 곧바로 실패한다. 콘솔이 없어도 도는
    # ping 으로 시간을 끈다. 명령을 cmd /C "..." 한 줄로 넘기지도 않는다.
    # 경로의 따옴표가 /C 를 감싼 따옴표와 겹쳐 엉뚱하게 끊어 읽는다.
    #
    # 돌고 있는 실행 파일은 지워지지 않는다. 그래서 정해진 시간을 기다리는
    # 대신, 제거기 파일이 지워질 때까지(= 프로그램이 끝날 때까지) 되풀이한다.
    if running_inside(target):
        short = _short_path(target)
        me = _short_path(self_path())
        bat = os.path.join(tempfile.gettempdir(), "chunjiin-uninstall.bat")
        lines = [
            "@echo off",
            "set n=0",
            ":wait",
            "ping -n 2 127.0.0.1 >nul",
            f'del /f /q "{me}" >nul 2>&1',
            f'if not exist "{me}" goto gone',
            "set /a n+=1",
            "if %n% lss 300 goto wait",
            ":gone",
            f'rd /s /q "{short}"',
            'del "%~f0"',
        ]
        with open(bat, "w", encoding="ascii", errors="replace", newline="\r\n") as f:
            f.write("\n".join(lines) + "\n")
        subprocess.Popen(
            ["cmd", "/C", bat],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
            close_fds=True,
        )
        return True

    try:
        shutil.rmtree(target)
    except OSError as e:
        raise InstallError(f"폴더를 지우지 못했습니다: {e}") from e
    return False


# ---------------------------------------------------------------------
# Linux
# ---------------------------------------------------------------------


def _install_linux(target, payload):
    try:
        os.makedirs(target, exist_ok=True)
    except OSError as e:
        raise InstallError(f"폴더를 만들지 못했습니다: {e}") from e

    exe = installed_exe(target)
    _place(payload, exe)
    _copy_self(target)
    h = home()

    # PATH 에 잡히도록 ~/.local/bin 에 심볼릭 링크를 건다.
    bin_dir = os.path.join(h, ".local", "bin")
    try:
        os.makedirs(bin_dir, exist_ok=True)
        link = os.path.join(bin_dir, exe_name())
        if os.path.lexists(link):
            os.remove(link)
        os.symlink(exe, link)
    except OSError:
        pass

    icon_dir = os.path.join(h, ".local", "share", "icons", "hicolor", "256x256", "apps")
    icon = os.path.join(icon_dir, "chunjiin.png")
    src = icon_source()
    try:
        os.makedirs(icon_dir, exist_ok=True)
        if src:
            shutil.copy2(src, icon)
    except OSError:
        pass

    app_dir = os.path.join(h, ".local", "share", "applications")
    try:
        os.makedirs(app_dir, exist_ok=True)
        with open(os.path.join(app_dir, "chunjiin.desktop"), "w", encoding="utf-8") as f:
            f.write(DESKTOP_ENTRY.format(exe=exe, icon=icon))
    except OSError as e:
        raise InstallError(f"프로그램 목록 항목을 쓰지 못했습니다: {e}") from e


def _uninstall_linux(target):
    try:
        shutil.rmtree(target)
    except OSError as e:
        raise InstallError(f"폴더를 지우지 못했습니다: {e}") from e
    h = home()
    for p in (
        os.path.join(h, ".local", "bin", exe_name()),
        os.path.join(h, ".local", "share", "applications", "chunjiin.desktop"),
        os.path.join(h, ".local", "share", "icons", "hicolor", "256x256", "apps", "chunjiin.png"),
    ):
        try:
            os.remove(p)
        except OSError:
            pass
    return False


# ---------------------------------------------------------------------
# macOS
# ---------------------------------------------------------------------


def _install_macos(target, payload):
    macos = os.path.join(target, "Contents", "MacOS")
    res = os.path.join(target, "Contents", "Resources")
    try:
        os.makedirs(macos, exist_ok=True)
        os.makedirs(res, exist_ok=True)
    except OSError as e:
        raise InstallError(f"폴더를 만들지 못했습니다: {e}") from e

    exe = installed_exe(target)
    _place(payload, exe)
    src = icon_source()
    if src:
        try:
            shutil.copy2(src, os.path.join(res, "chunjiin.png"))
        except OSError:
            pass
    with open(os.path.join(target, "Contents", "Info.plist"), "w", encoding="utf-8") as f:
        f.write(INFO_PLIST.format(name=APP_NAME, version=VERSION, exe=exe_name()))


def _uninstall_macos(target):
    try:
        shutil.rmtree(target)
    except OSError as e:
        raise InstallError(f"폴더를 지우지 못했습니다: {e}") from e
    return False


# ---------------------------------------------------------------------
# 들어오는 문
# ---------------------------------------------------------------------


def install(target, payload, clean=False):
    """`payload`(품은 앱)를 `target` 에 설치한다. 실패하면 InstallError 다.

    `clean` 이면 그 폴더에 있던 것을 모두 지우고 새로 놓는다. 아니면 같은
    이름의 파일만 덮어쓴다.
    """
    if not target:
        raise InstallError("설치 폴더를 정해 주세요.")
    if not payload or not os.path.exists(payload):
        raise InstallError("품고 있는 실행 파일이 없습니다.")
    target = os.path.abspath(target)
    if clean:
        wipe(target)
    if sys.platform == "win32":
        _install_windows(target, payload)
    elif sys.platform == "darwin":
        _install_macos(target, payload)
    else:
        _install_linux(target, payload)


def uninstall(target):
    """`target` 에 설치한 것을 지운다. 실패하면 InstallError 다.

    참을 돌려주면 폴더 지우기가 미뤄진 것이다. 제거기 자신이 그 폴더에서
    돌고 있어서, 이 프로그램이 끝난 뒤에 지워진다.
    """
    if not target or not os.path.isdir(target):
        raise InstallError("설치된 폴더가 아닙니다.")
    target = os.path.abspath(target)
    if sys.platform == "win32":
        return _uninstall_windows(target)
    if sys.platform == "darwin":
        return _uninstall_macos(target)
    return _uninstall_linux(target)


__all__ = [
    "APP_NAME",
    "DESKTOP_ENTRY",
    "DISPLAY_NAME",
    "INFO_PLIST",
    "UNINSTALL_KEY",
    "VERSION",
    "InstallError",
    "default_target",
    "exe_name",
    "home",
    "install",
    "installed_exe",
    "is_installed",
    "own_install_dir",
    "running_inside",
    "uninstall",
    "wipe",
]
