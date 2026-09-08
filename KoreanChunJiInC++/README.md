# 천지인 한글 입력기

12키 천지인 자판으로 한글을 조합하는 Windows 데스크톱 프로그램입니다.
원본 조합 코드 `chunjiin.c` 는 **한 줄도 고치지 않고** 그대로 씁니다.

![아이콘](assets/chunjiin.png)

## 무엇인가요

- 화면 위쪽은 편집 영역, 아래쪽은 천지인 12키 + 기능 버튼 한 줄
- 마우스로 키패드를 눌러도 되고, 물리 키보드(숫자열 / 숫자패드)로 쳐도 됩니다
- 한글 / 영문 소문자 / 영문 대문자 / 숫자 / 기호 다섯 가지 입력 모드
- 조합 중인 낱자를 상태줄에 보여 주고, 아래아(`·`, `‥`) 중간 상태도 화면에 표시합니다
- UTF-8 텍스트 파일로 열기 / 저장, 클립보드 복사 / 붙여넣기
- 툴바 · 설정 창 · 테마 4종(라이트 · 다크 · 세피아 · 고대비)
- 관리자 권한 없이 설치되는 설치 프로그램(`chunjiin-setup.exe`) 포함

## 빠르게 써 보기

```bat
build.bat            :: 앱 + 테스트 + 설치 프로그램 빌드
test.bat             :: 엔진 회귀 시험 585항목 실행
chunjiin.exe         :: 실행
```

빌드가 끝나면 저장소 루트에 `chunjiin.exe`(실행 파일)와
`chunjiin-setup.exe`(설치 프로그램)가 놓입니다.

MSYS2 / MinGW-w64 gcc 가 PATH 에 있어야 합니다.
gcc 가 없다면 [Build.md 의 설치 안내](Build.md#msys2--mingw-w64-설치)를 먼저 보세요.

설치해서 쓰려면 빌드 후 저장소 루트에 생기는 `chunjiin-setup.exe` 를 실행하세요.
`%LOCALAPPDATA%\Programs\Chunjiin` 에 설치되고 시작 메뉴에 등록됩니다.

## 자판

```
  ㅣ     ·      ㅡ          키 0  1  2
  ㄱㅋ   ㄴㄹ   ㄷㅌ         키 3  4  5
  ㅂㅍ   ㅅㅎ   ㅈㅊ         키 6  7  8
  . ,    ㅇㅁ   ? !          키 9  10 11
```

`모드`  `◀`  `스페이스`  `▶`  `↵`  `⌫` 가 맨 아랫줄에 있습니다.

사용법은 [UsersGuide.md](UsersGuide.md) 를 보세요.

## 문서

| 문서 | 내용 |
|---|---|
| [UsersGuide.md](UsersGuide.md) | 자판, 모음 조합표, 단축키, 화면 설명 |
| [Build.md](Build.md) | 빌드 · 시험 실행과 작성법 · 설치 프로그램 만들기 |
| [Architecture.md](Architecture.md) | 파일 구성, 오토마타 설계, `chunjiin.c` 와의 경계 |

## 파일 구성

```
KoreanChunJiInC++/
├─ src/
│  ├─ chunjiin.c        원본 (수정 금지) - 유니코드 조합, 겹받침, UTF-8 변환
│  ├─ input.c           천지인 오토마타 + 편집 API
│  ├─ main.c            Win32 GUI
│  ├─ app.rc            아이콘 · 매니페스트 · 버전 정보
│  └─ app.manifest
├─ include/
│  ├─ chunjiin.h        자료구조 · 매크로 (chunjiin.c 가 참조)
│  ├─ input.h           오토마타 · 편집 API 선언
│  └─ resource.h
├─ installer/
│  ├─ setup.c           설치 프로그램 (chunjiin.exe 를 리소스로 품는다)
│  ├─ setup.rc, setup.manifest, setup_res.h
├─ tests/test_engine.c  자소 조합 회귀 시험 (34구역 585항목)
├─ scripts/make_icon.py 아이콘 생성
├─ assets/chunjiin.ico  아이콘 (커밋되어 있으므로 파이썬 없이도 빌드 가능)
├─ chunjiin.exe         실행 파일     (빌드하면 루트로 복사된다)
├─ chunjiin-setup.exe   설치 프로그램 (빌드하면 루트로 복사된다)
├─ build.bat            gcc 빌드
├─ test.bat / test.sh   시험 실행기
└─ CMakeLists.txt       CMake 빌드
```

## 라이선스

별도 명시가 없습니다. 사내/개인 용도로 자유롭게 쓰세요.
