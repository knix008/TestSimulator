"""한국어 명령어 인식 학습 프로그램을 실행한다."""

from __future__ import annotations

import sys


def main() -> None:
    if sys.version_info < (3, 10):
        print("Python 3.10 or newer is required.")
        sys.exit(1)
    try:
        from gui.app import run
    except ImportError as exc:
        print("필요한 패키지가 없습니다.")
        print("run.bat 을 실행하거나, Python 3.12 또는 3.13에서 다음을 실행하세요.")
        print("python -m pip install -r requirements.txt")
        print(exc)
        sys.exit(1)
    run()


if __name__ == "__main__":
    main()
