"""ensure_deps.py - 없는 패키지를 찾아서 pip 으로 넣는다.

    python scripts/ensure_deps.py desktop          PySide6
    python scripts/ensure_deps.py desktop build    PySide6 · PyInstaller
    python scripts/ensure_deps.py --check build    넣지 않고 있는지만 본다

build.ps1 · test.ps1 · package.ps1 과 .bat · .sh 짝이 모두 이 파일을
부른다. 아홉 스크립트에 각각 "있나 보고 없으면 pip" 을 적어 두면 셋이
금세 어긋나므로 한 자리에 둔다.

이름은 pyproject.toml 의 optional-dependencies 와 같다. 거기 적힌 것을
바꾸면 아래 EXTRAS 도 같이 고친다. (tomllib 은 3.11 부터라 3.10 을 위해
표를 여기 되풀이한다.)

돌려주는 값: 다 있으면 0, pip 이 실패하면 1, --check 에서 빠진 것이 있으면 1.
"""

from __future__ import annotations

import importlib
import subprocess
import sys

# 이름 -> [(임포트할 모듈, pip 에 넘길 스펙)]
EXTRAS = {
    "desktop": [("PySide6", "PySide6>=6.5")],
    "build": [("PyInstaller", "pyinstaller>=6.0")],
}


def missing(extras):
    """빠진 것만 (모듈, 스펙) 으로 돌려준다. 임포트가 되면 있는 것으로 본다."""
    out = []
    for extra in extras:
        for module, spec in EXTRAS[extra]:
            try:
                importlib.import_module(module)
            except ImportError:
                out.append((module, spec))
    return out


def pip(*args):
    cmd = [sys.executable, "-m", "pip", "--disable-pip-version-check", *args]
    return subprocess.run(cmd).returncode


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    check_only = "--check" in argv
    extras = [a for a in argv if not a.startswith("-")]
    unknown = [e for e in extras if e not in EXTRAS]
    if unknown or not extras:
        print(f"쓰는 법: ensure_deps.py [--check] {{{' | '.join(EXTRAS)}}}...", file=sys.stderr)
        return 2

    need = missing(extras)
    if not need:
        return 0

    names = ", ".join(m for m, _ in need)
    if check_only:
        print(f"없는 패키지: {names}", file=sys.stderr)
        # >= 가 셸에서 리다이렉트로 읽히지 않게 따옴표로 싼다.
        print(f"   {sys.executable} -m pip install " + " ".join(f'"{s}"' for _, s in need), file=sys.stderr)
        return 1

    print(f"-- 없는 패키지를 넣는다: {names}")
    # pip 자체가 없는 파이썬도 있다(리눅스 배포판 최소 설치). 먼저 갖춘다.
    try:
        importlib.import_module("pip")
    except ImportError:
        subprocess.run([sys.executable, "-m", "ensurepip", "--upgrade"])

    if pip("install", *(s for _, s in need)) != 0:
        print("pip 이 실패했습니다. 망이 막혔거나 쓰기 권한이 없는지 보세요.", file=sys.stderr)
        return 1

    # 넣었는데도 임포트가 안 되면 다른 파이썬에 들어간 것이다. 여기서 잡는다.
    still = missing(extras)
    if still:
        print(f"넣었지만 여전히 못 찾습니다: {', '.join(m for m, _ in still)}", file=sys.stderr)
        print(f"   파이썬: {sys.executable}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
