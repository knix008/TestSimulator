"""pyinstaller_build.py - PyInstaller 를 부르는 자리 한 곳.

    python scripts/pyinstaller_build.py --targets app serve setup

`.spec` 파일을 저장소에 두지 않고 여기서 인자를 만들어 넘긴다.
`.spec` 은 손으로 고칠 자리가 많아 셋(앱 · 서버 · 설치 프로그램)이
어긋나기 쉬운데, 여기 한 군데서 만들면 세 개가 늘 같은 규칙을 따른다.

품는 것

    assets/   아이콘 · 내장 글꼴      앱 · 설치 프로그램
    web/      웹 판 화면              서버
    payload/  묶어 둔 앱              설치 프로그램

`--targets setup` 은 먼저 만든 `dist/chunjiin` 을 자기 안에 품는다.
그래서 앱을 먼저 만들어야 한다. `main()` 이 그 차례를 지킨다.

## 한 폴더냐 한 파일이냐

**기본은 셋 다 한 파일이다.** 저장소 루트에 놓인 실행 파일 하나만 있으면
그대로 돌아야 하기 때문이다(다른 판들과 같은 관례다). 한 폴더 묶음은
실행 파일만 떼어 놓으면 딸린 파일이 없어 돌지 않는다.

한 파일 묶음은 뜰 때마다 자기를 임시 폴더에 풀어 놓으므로 처음 뜰 때
몇 초 걸린다. 날마다 쓰면서 그것이 거슬리면 `--onedir` 로 만들어
`dist/chunjiin/` 을 폴더째 쓰면 된다. 그때는 루트에 복사하지 않고
어디에 만들어졌는지만 알려 준다.

`--copy-root` 는 **설치 프로그램 하나만** 루트에 놓는다. 앱과 서버는
dist/ 에 남는다. 루트에는 나눠 줄 파일 하나만 있으면 되고, 앱은 설치
프로그램 안에 품겨 있기 때문이다. (리눅스·맥의 앱 이름 `chunjiin` 이
소스 패키지 폴더와 같아 루트에 둘 수 없다는 사정도 있다.)
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 무엇을 만들 수 있는가.
# (이름, 들어가는 자리, 창을 띄우는가, 한 파일로 묶는가)
TARGETS = {
    "app": ("chunjiin", "chunjiin/__main__.py", True, True),
    "serve": ("chunjiin-serve", "chunjiin/web/__main__.py", False, True),
    "setup": ("chunjiin-setup", "chunjiin/setup/__main__.py", True, True),
}

# 만드는 차례다. setup 은 앞의 것을 품으므로 언제나 마지막이다.
ORDER = ("app", "serve", "setup")


def sep():
    """PyInstaller 의 `--add-data` 가 쓰는 구분자다. 운영체제마다 다르다."""
    return ";" if sys.platform == "win32" else ":"


def icon_arg():
    """실행 파일에 박을 아이콘이다. 운영체제마다 형식이 다르다."""
    if sys.platform == "win32":
        path = os.path.join(ROOT, "assets", "chunjiin.ico")
    else:
        path = os.path.join(ROOT, "assets", "chunjiin.png")
    return ["--icon", path] if os.path.exists(path) else []


def data_args(name):
    """그 프로그램이 품어야 할 자산이다."""
    out = []
    assets = os.path.join(ROOT, "assets")
    web = os.path.join(ROOT, "web")

    if name in ("app", "setup") and os.path.isdir(assets):
        out += ["--add-data", f"{assets}{sep()}assets"]
    if name == "serve" and os.path.isdir(web):
        out += ["--add-data", f"{web}{sep()}web"]
    if name == "setup":
        # 설치 프로그램은 앱을 통째로 품는다.
        payload = os.path.join(ROOT, "dist", "chunjiin")
        if os.path.isdir(payload):
            out += ["--add-data", f"{payload}{sep()}payload"]
        elif os.path.isfile(payload) or os.path.isfile(payload + ".exe"):
            one = payload if os.path.isfile(payload) else payload + ".exe"
            out += ["--add-data", f"{one}{sep()}payload"]
    return out


def artifact(name, onefile):
    """만들어진 것의 자리다. 없으면 None 이다.

    한 파일이면 실행 파일 하나, 한 폴더면 그 폴더를 돌려준다.
    """
    exe = TARGETS[name][0]
    dist = os.path.join(ROOT, "dist")
    if onefile:
        for path in (os.path.join(dist, exe), os.path.join(dist, exe + ".exe")):
            if os.path.isfile(path):
                return path
        return None
    folder = os.path.join(dist, exe)
    return folder if os.path.isdir(folder) else None


def build(name, onefile, clean):
    exe, entry, windowed, _ = TARGETS[name]

    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--name",
        exe,
        "--distpath",
        os.path.join(ROOT, "dist"),
        "--workpath",
        os.path.join(ROOT, "build"),
        "--specpath",
        os.path.join(ROOT, "build"),
        "--onefile" if onefile else "--onedir",
    ]
    if clean:
        args.append("--clean")
    # 서버는 콘솔에 주소를 찍어야 하므로 창을 감추지 않는다.
    args.append("--windowed" if windowed and sys.platform != "linux" else "--console")
    args += icon_arg()
    args += data_args(name)

    if name == "serve":
        # 서버는 Qt 가 필요 없다. 넣으면 묶음이 몇십 MB 씩 커진다.
        for mod in ("PySide6", "shiboken6"):
            args += ["--exclude-module", mod]

    args.append(os.path.join(ROOT, entry))

    print(f"-- {exe}")
    subprocess.run(args, check=True, cwd=ROOT)


def main(argv=None):
    ap = argparse.ArgumentParser(description="PyInstaller 로 실행 파일을 만든다.")
    ap.add_argument(
        "--targets",
        nargs="+",
        default=["app"],
        choices=sorted(TARGETS),
        help="무엇을 만들까 (기본 app)",
    )
    ap.add_argument(
        "--onefile", action="store_true", help="모두 한 파일로 묶는다 (기본)"
    )
    ap.add_argument(
        "--onedir",
        action="store_true",
        help="모두 한 폴더로 묶는다 (빨리 뜨지만 폴더째 옮겨야 돈다)",
    )
    ap.add_argument("--clean", action="store_true", help="중간 파일부터 지우고 만든다")
    ap.add_argument(
        "--copy-root",
        action="store_true",
        help="설치 프로그램(한 파일)을 저장소 루트에도 놓는다",
    )
    args = ap.parse_args(argv)

    try:
        import PyInstaller  # noqa: F401  (있는지만 본다)
    except ImportError:
        print(
            "PyInstaller 가 없습니다. 아래를 먼저 하세요.\n"
            f"   {sys.executable} -m pip install pyinstaller",
            file=sys.stderr,
        )
        return 1

    order = [t for t in ORDER if t in args.targets]
    made = []
    for name in order:
        if args.onefile:
            onefile = True
        elif args.onedir:
            onefile = False
        else:
            onefile = TARGETS[name][3]
        build(name, onefile, args.clean)
        made.append((name, onefile, artifact(name, onefile)))

    print("== 만든 것")
    stuck = []
    for name, onefile, path in made:
        if path is None:
            print(f"   {TARGETS[name][0]:<44} (찾지 못했다)")
            continue

        # 설치 프로그램만, 그것도 한 파일로 만든 것만 루트에 놓는다. 한 폴더
        # 묶음은 실행 파일만 떼어 놓으면 딸린 파일이 없어 돌지 않는다.
        if args.copy_root and onefile and name == "setup":
            dest = os.path.join(ROOT, os.path.basename(path))
            if os.path.abspath(dest) != os.path.abspath(path):
                try:
                    _replace(path, dest)
                except OSError as e:
                    stuck.append((os.path.basename(dest), e))
                    print(f"   {os.path.basename(dest):<44} (루트에 놓지 못했다)")
                    continue
            print(f"   {os.path.basename(dest):<44} {_size(dest)}")
            continue

        shown = os.path.relpath(path, ROOT)
        if not onefile:
            shown = os.path.join(shown, "") + "  (폴더째 옮겨야 돕니다)"
        print(f"   {shown:<44} {_size(path)}")

    if stuck:
        print()
        print("루트에 놓지 못한 것이 있습니다. 그 프로그램이 돌고 있지 않은지 보세요.",
              file=sys.stderr)
        for name, e in stuck:
            print(f"   {name}: {e}", file=sys.stderr)
        print("   dist/ 안에는 새로 만들어져 있습니다.", file=sys.stderr)
        return 1
    return 0


def _replace(src, dest):
    """만든 것을 `dest` 자리에 놓는다. 이미 있으면 갈아 끼운다.

    Windows 는 **돌고 있는 실행 파일을 덮어쓰지 못한다.** 앱을 켜 놓은 채로
    다시 빌드하면 여기서 걸린다. 그때는 옆으로 밀어 두고 새로 쓴다. 밀어
    두는 것마저 안 되면(정말 그 자리에서 돌고 있으면) 그대로 알린다.
    """
    try:
        shutil.copy2(src, dest)
        return
    except OSError:
        if not os.path.exists(dest):
            raise

    old = dest + ".old"
    try:
        os.remove(old)
    except OSError:
        pass
    # 이름만 바꾸는 것은 돌고 있는 파일에도 먹힌다.
    os.replace(dest, old)
    shutil.copy2(src, dest)
    try:
        os.remove(old)
    except OSError:
        # 아직 돌고 있으면 남는다. 다음 빌드가 치운다.
        pass


def _size(path):
    """한 파일이면 그 크기, 한 폴더면 폴더 전체 크기를 잰다."""
    if os.path.isdir(path):
        total = sum(
            os.path.getsize(os.path.join(r, f))
            for r, _, files in os.walk(path)
            for f in files
        )
    else:
        total = os.path.getsize(path)
    for unit in ("B", "KB", "MB", "GB"):
        if total < 1024 or unit == "GB":
            return f"{total:.0f} {unit}"
        total /= 1024
    return ""


if __name__ == "__main__":
    # PyInstaller 가 chunjiin 을 찾을 수 있게 저장소 루트를 앞에 둔다.
    sys.path.insert(0, ROOT)
    shutil.rmtree(os.path.join(ROOT, "build"), ignore_errors=True)
    raise SystemExit(main())
