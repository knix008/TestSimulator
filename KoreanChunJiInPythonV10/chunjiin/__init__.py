"""천지인(千地人) 한글 입력기.

    chunjiin.engine   조합 엔진 (순수 파이썬, 표준 라이브러리만)
    chunjiin.ui       데스크톱 창 (PySide6)
    chunjiin.web      웹 판 서버 (http.server)
    chunjiin.setup    설치 프로그램
    chunjiin.testkit  시험 도우미

쓰는 쪽은 보통 엔진만 필요하다.

    >>> from chunjiin.engine import State
    >>> s = State()
    >>> for k in (3, 0, 1):      # ㄱ  ㅣ  ·
    ...     s.key(k)
    >>> s.commit()
    >>> s.text()
    '가'
"""

__version__ = "1.0"
