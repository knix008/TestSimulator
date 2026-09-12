"""`python -m chunjiin.web` 진입점. PyInstaller 도 이 파일을 chunjiin-serve 로 묶는다.

절대 임포트여야 한다. PyInstaller 가 이 파일을 __main__ 으로 돌리면 딸린
꾸러미가 없어서 상대 임포트가 죽는다.
"""

import sys

from chunjiin.web.server import main

if __name__ == "__main__":
    sys.exit(main())
