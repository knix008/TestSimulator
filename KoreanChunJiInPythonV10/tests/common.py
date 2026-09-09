"""시험이 함께 쓰는 키 시퀀스 실행기.

Rust 판 `crates/engine/tests/common/mod.rs` 와 같다.
"""

from __future__ import annotations

import os
import sys

# 저장소 루트를 import 경로에 넣는다. 설치하지 않고도 시험이 돌게 하려는 것이다.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chunjiin.engine import InputMode, State  # noqa: E402

_MODES = {
    "H": InputMode.HANGUL,
    "E": InputMode.ENGLISH,
    "U": InputMode.UPPER_ENGLISH,
    "N": InputMode.NUMBER,
    "S": InputMode.SPECIAL,
}


def run_keys(s, seq):
    """키 시퀀스 문자열을 그대로 실행한다.

        0~9   키 0~9            a  키 10 (ㅇㅁ)      b  키 11 (? !)
        _     스페이스          <  백스페이스        |  연타 순환 끊기
        !     조합 확정         ~  전체 지우기       /  줄바꿈
        [ ]   커서 왼쪽/오른쪽  {  맨 앞으로         }  맨 뒤로
        H E U N S              모드: 한글/영소/영대/숫자/기호
        M     모드 순환

    그 밖의 문자(공백 등)는 무시하므로 긴 시퀀스를 띄어 읽기 좋게 적어도 된다.
    """
    for c in seq:
        if c == "a":
            s.key(10)
        elif c == "b":
            s.key(11)
        elif c == "_":
            s.space()
        elif c == "<":
            s.backspace()
        elif c == "|":
            s.break_multitap()
        elif c == "!":
            s.commit()
        elif c == "~":
            s.clear()
        elif c == "/":
            s.insert_char("\n")
        elif c == "[":
            s.move_cursor(-1)
        elif c == "]":
            s.move_cursor(1)
        elif c == "{":
            s.set_cursor(0)
        elif c == "}":
            s.set_cursor(len(s))
        elif c in _MODES:
            s.set_mode(_MODES[c])
        elif c == "M":
            s.cycle_mode()
        elif "0" <= c <= "9":
            s.key(ord(c) - ord("0"))


__all__ = ["State", "run_keys"]
