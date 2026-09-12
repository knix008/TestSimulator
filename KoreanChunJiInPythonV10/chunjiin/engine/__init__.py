"""천지인(千地人) 한글 조합 엔진.

KoreanChunJiInC++ 의 src/chunjiin.c(원본, 수정 금지) 와 src/input.c
(오토마타) 를 순수 파이썬으로 옮긴 것이다. 표준 라이브러리 말고는 아무것도
쓰지 않고 운영체제를 가리지 않으므로 데스크톱 앱(PySide6)과 웹 서버가 같은
코드를 쓴다.

    chunjiin.py   원본 chunjiin.c  - 유니코드 조합, 겹받침     StateBase
    input.py      원본 input.c     - 오토마타, 편집 API        StateInput
    labels.py     라벨 · 모드 이름 · 상태줄                    State

원본이 세 파일로 나뉘어 있으므로 클래스도 그 차례로 상속해 잇는다.
쓰는 쪽은 맨 끝의 `State` 하나만 보면 된다.

    >>> from chunjiin.engine import State
    >>> s = State()
    >>> for k in (3, 0, 1):      # ㄱ  ㅣ  ·
    ...     s.key(k)
    >>> s.commit()
    >>> s.text()
    '가'
"""

from chunjiin.engine.chunjiin import (
    KEY_COUNT,
    MAX_TEXT_LEN,
    MODE_COUNT,
    HangulState,
    InputMode,
    JamoSlot,
    check_double,
    get_unicode,
)
from chunjiin.engine.labels import MODE_NAMES, KeyRole, State

__all__ = [
    "KEY_COUNT",
    "MAX_TEXT_LEN",
    "MODE_COUNT",
    "MODE_NAMES",
    "HangulState",
    "InputMode",
    "JamoSlot",
    "KeyRole",
    "State",
    "check_double",
    "get_unicode",
]
