"""천지인 한글 입력기의 데스크톱 화면 (PySide6).

Windows · macOS · Linux 에서 같은 코드로 돈다. 조합 규칙은 하나도 여기에
없다. 전부 `chunjiin.engine` 이 맡고, 이 꾸러미는 그것을 비추기만 한다.

    app.py       창 조립 - 메뉴 · 툴바 · 키패드 · 딸린 창
    dialogs.py   사용법 · 정보 · 설정 창
    theme.py     테마 4종
    lang.py      한국어 · 영어 글자표
    help.py      사용법 본문
    widgets.py   직접 그리는 키패드 · 툴바 버튼
    icons.py     선으로 그리는 그림 (순수 계산)
    layout.py    키패드 배치 · 커서 자리 옮기기 (순수 계산)
    textgrid.py  글자를 칸 격자에 세우는 셈 (순수 계산)
    settings.py  설정 저장 (JSON)
    font.py      내장 글꼴 등록

Qt 를 들여오는 것은 app · dialogs · widgets · font 뿐이다. 나머지는
PySide6 없이도 임포트되므로 화면 없는 자리에서도 시험할 수 있다.
"""
