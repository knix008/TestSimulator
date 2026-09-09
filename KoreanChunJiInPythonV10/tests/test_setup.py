"""설치 프로그램 시험.

실제로 설치하지는 않는다. 이 컴퓨터에 파일을 놓고 레지스트리를 쓰는 일은
시험이 함부로 할 것이 아니다. 대신 **자리를 셈하는 쪽과 만들어 내는 글**을
본다. 그것이 어긋나면 설치가 엉뚱한 데 가거나 조용히 실패한다.

실제 설치는 만들어 놓은 설치 파일로 확인한다.

    chunjiin-setup --silent --target <임시 폴더>
    chunjiin-setup --silent --uninstall --target <임시 폴더>
"""

from __future__ import annotations

import os
import sys
import tempfile

from chunjiin import testkit as kit
from chunjiin.setup import installer as inst

GROUP = "설치 프로그램"


def test_install_paths():
    """설치 자리가 운영체제마다 사용자 영역 안에 있는지 본다."""
    tally = kit.Tally()
    section = "설치 자리"

    target = inst.default_target()
    home = os.path.abspath(inst.home())

    tally.add(
        kit.check(
            os.path.isabs(target),
            GROUP,
            section,
            "절대 경로",
            target,
        )
    )

    # 관리자 권한이 필요 없으려면 사용자 영역 안이어야 한다.
    inside = os.path.abspath(target).lower().startswith(home.lower())
    tally.add(
        kit.check(
            inside,
            GROUP,
            section,
            "사용자 영역 안",
            f"{target}  (집: {home})",
        )
    )

    tally.add(
        kit.check(
            inst.APP_NAME in target,
            GROUP,
            section,
            "이름이 들어간다",
            inst.APP_NAME,
        )
    )

    # 설치된 실행 파일의 자리는 운영체제마다 다르다.
    exe = inst.installed_exe(target)
    if sys.platform == "darwin":
        ok = exe.endswith(os.path.join("Contents", "MacOS", "chunjiin"))
    elif sys.platform == "win32":
        ok = exe.endswith("chunjiin.exe")
    else:
        ok = exe.endswith("chunjiin")
    tally.add(kit.check(ok, GROUP, section, "실행 파일 자리", exe))

    # 없는 폴더를 설치되었다고 하면 안 된다.
    with tempfile.TemporaryDirectory() as tmp:
        empty = os.path.join(tmp, "없음")
        tally.add(
            kit.check(
                not inst.is_installed(empty) and not inst.is_installed(""),
                GROUP,
                section,
                "설치 여부 판정",
                "빈 폴더와 빈 문자열은 설치되지 않음",
            )
        )

    tally.assert_clean("설치 자리")


def test_generated_text():
    """설치할 때 만들어 내는 글이 성한지 본다."""
    tally = kit.Tally()
    section = "만들어 내는 글"

    # 리눅스 프로그램 목록 항목.
    desktop = inst.DESKTOP_ENTRY.format(exe="/tmp/chunjiin", icon="/tmp/i.png")
    ok = (
        desktop.startswith("[Desktop Entry]")
        and "Exec=/tmp/chunjiin" in desktop
        and "Name[ko]=천지인 한글 입력기" in desktop
        and "Type=Application" in desktop
    )
    tally.add(kit.check(ok, GROUP, section, ".desktop 항목", f"{len(desktop)}자"))

    # macOS 앱 묶음 정보.
    plist = inst.INFO_PLIST.format(
        name=inst.APP_NAME, version=inst.VERSION, exe="chunjiin"
    )
    ok = (
        plist.startswith("<?xml")
        and "<key>CFBundleExecutable</key><string>chunjiin</string>" in plist
        and f"<string>{inst.VERSION}</string>" in plist
        and plist.rstrip().endswith("</plist>")
    )
    tally.add(kit.check(ok, GROUP, section, "Info.plist", f"{len(plist)}자"))

    # 레지스트리 자리가 사용자 영역(HKCU)이어야 관리자 권한이 필요 없다.
    tally.add(
        kit.check(
            inst.UNINSTALL_KEY.startswith("Software\\Microsoft\\Windows")
            and "Uninstall\\Chunjiin" in inst.UNINSTALL_KEY,
            GROUP,
            section,
            "제거 등록 자리",
            inst.UNINSTALL_KEY,
        )
    )

    tally.assert_clean("만들어 내는 글")


def test_short_path():
    """8.3 짧은 이름 얻기. 못 얻으면 원래 경로를 돌려줘야 한다.

    제거할 때 만드는 배치 파일이 이것을 쓴다. None 이나 빈 문자열을
    돌려주면 엉뚱한 폴더를 지우게 된다.
    """
    tally = kit.Tally()
    section = "짧은 경로"

    with tempfile.TemporaryDirectory() as tmp:
        got = inst._short_path(tmp)
        tally.add(
            kit.check(
                bool(got) and os.path.isdir(got),
                GROUP,
                section,
                "있는 폴더",
                got,
            )
        )

        # 없는 경로도 무엇이든 돌려줘야 한다(빈 문자열이면 안 된다).
        missing = os.path.join(tmp, "없는-폴더")
        got = inst._short_path(missing)
        tally.add(
            kit.check(bool(got), GROUP, section, "없는 경로", got)
        )

    tally.assert_clean("짧은 경로")


def test_payload_lookup():
    """품은 앱을 찾는 쪽이 없는 자리를 있다고 하지 않는지 본다."""
    from chunjiin.setup.main import payload_path

    tally = kit.Tally()
    section = "품은 앱"

    with tempfile.TemporaryDirectory() as tmp:
        missing = os.path.join(tmp, "없음")
        tally.add(
            kit.check(
                payload_path(missing) is None,
                GROUP,
                section,
                "없는 자리",
                "None 을 돌려준다",
            )
        )

        here = os.path.join(tmp, "chunjiin")
        os.makedirs(here)
        tally.add(
            kit.check(
                payload_path(here) == here,
                GROUP,
                section,
                "알려 준 자리",
                here,
            )
        )

    tally.assert_clean("품은 앱")
