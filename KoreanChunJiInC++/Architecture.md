# 설계 문서

## 출발점

이 저장소에는 원래 `chunjiin.c` 한 개만 있었습니다.
그 파일은 다음 다섯 가지를 구현하고 있고, **수정하지 않는 것이 제약**입니다.

| 함수 | 하는 일 |
|---|---|
| `get_unicode()` | 초성 · 중성 · 종성 문자열을 한글 음절 코드포인트로 |
| `check_double()` | 두 자음이 겹받침을 이루는지 (`ㄱ`+`ㅅ` → `ㄳ`) |
| `wchar_to_utf8()` | 와이드 문자열을 UTF-8 로 |
| `delete_char()` | 텍스트 버퍼에서 커서 앞 한 칸 삭제 |
| `chunjiin_init()`, `hangul_init()`, `init_engnum()` | 상태 초기화 |
| `chunjiin_process_input()` | 모드에 따라 `*_make()` + `write_*()` 호출 |

그런데 이 파일이 `#include` 하는 `../include/chunjiin.h`, `../include/input.h` 와,
`chunjiin_process_input()` 이 부르는 여섯 함수는 없었습니다.
그래서 **없는 쪽을 원본에 맞춰 채워 넣는 것**이 이 프로젝트의 실제 작업이었습니다.

```
chunjiin_process_input()   <- chunjiin.c (원본)
  ├─ hangul_make()   ─┐
  ├─ write_hangul()   │
  ├─ eng_make()       ├─ src/input.c (새로 구현)
  ├─ num_make()       │
  ├─ special_make()   │
  └─ write_engnum()  ─┘
```

## 계층

```
┌──────────────────────────────────────────────┐
│ src/main.c        Win32 GUI                  │
│   버튼 · 메뉴 · 키보드 → 편집 API 호출        │
│   엔진 버퍼를 EDIT 컨트롤에 그대로 반영       │
├──────────────────────────────────────────────┤
│ src/input.c       오토마타 + 편집 API         │
│   모음 전이표, 자음 순환, 연음, 백스페이스     │
│   chunjiin_space/backspace/commit/...        │
├──────────────────────────────────────────────┤
│ src/chunjiin.c    원본 (수정 금지)            │
│   get_unicode / check_double / delete_char    │
└──────────────────────────────────────────────┘
```

`include/chunjiin.h` 는 원본이 쓰는 자료구조와 매크로를,
`include/input.h` 는 오토마타와 GUI 편집 API 를 선언합니다.

## 상태

```c
typedef struct {
    wchar_t chosung[4], jungsung[4], jongsung[4], jongsung2[4];
    int  step;              /* 마지막으로 채운 자리 (JamoSlot) */
    bool flag_writing;      /* 지금 조합 중인 글자가 화면에 있는가 */
    ...
} HangulState;

typedef struct {
    HangulState hangul;
    InputMode   now_mode;
    wchar_t     engnum[8];
    wchar_t     text_buffer[MAX_TEXT_LEN];
    int         cursor_pos;
    int         last_key, tap_count;   /* 멀티탭 */
    int         compose_len;           /* 조합 글자가 차지한 칸 수 */
    HangulState prev_syllable;         /* 겹받침 되돌려 붙이기용 */
    bool        prev_mergeable;
} ChunjiinState;
```

아래 다섯은 원본이 쓰지 않는 확장 필드입니다.
원본의 `hangul_init()` 은 `HangulState` 만 지우므로 `input.c` 쪽에서 직접 관리하고,
새 상태는 항상 `chunjiin_reset()` 으로 시작합니다.

### 조합 중인 글자를 화면에 두는 방법

`text_buffer` 는 널로 끝나는 와이드 문자열이고 `cursor_pos` 는 삽입 위치입니다.
조합 중인 글자는 **`cursor_pos` 바로 앞의 `compose_len` 칸**에 놓입니다.

```
text_buffer : 안 녕 하 세 요 ㄱ ·
                                  ^ cursor_pos
                            └──┬──┘
                          compose_len = 2
```

`write_hangul()` 은 매번 그 칸들을 지우고 새로 그립니다.

```c
void write_hangul(ChunjiinState *state)
{
    n = compose_display(&state->hangul, shown);   /* 최대 2칸 */
    while (state->compose_len > 0) { delete_char(state); state->compose_len--; }
    for (i = 0; i < n; i++) { text_insert(state, shown[i]); state->compose_len++; }
    state->hangul.flag_writing = (state->compose_len > 0);
}
```

음절이 확정되면 `hangul_init()` 으로 `flag_writing` 을 내리고 `compose_len` 을 0 으로
만듭니다. 그러면 이미 찍힌 칸이 그대로 확정 글자가 되고, 다음 글자는 새 칸에 들어갑니다.
따로 "확정 버퍼"와 "조합 버퍼"를 나눌 필요가 없습니다.

### 겹받침 되돌려 붙이기

받침 뒤에 온 자음이 겹받침을 이루지 못하면 새 음절로 떨어져 나갑니다.
그런데 자음 키는 순환하므로, **한 번 더 누르면 겹받침이 되는 자음이 나올 수 있습니다.**

```
만 + ㅅㅎ 키   ->  만ㅅ      (ㄴ+ㅅ 은 겹받침이 아니다)
     ㅅㅎ 키   ->  많        (ㄴ+ㅎ 은 ㄶ 이므로 도로 합친다)
```

이걸 위해 `ChunjiinState` 가 직전 음절을 `prev_syllable` 에 들고 있습니다.
`try_merge_jong()` 이 순환 후보 중에 앞 음절의 받침과 합쳐지는 것을 찾으면,
`compose_len` 을 하나 늘려 **앞 칸까지 조합 영역으로 끌어들인 뒤**
합쳐진 상태를 다시 그립니다. 두 칸이 한 칸이 됩니다.

이 장치가 없으면 `ㄶ ㄻ ㄾ ㅀ` 이 들어간 글자(`많 삶 핥 옳`)를 아예 입력할 수 없습니다.
순환 첫 자리(`ㅅ ㅇ ㄷ`)가 겹받침을 못 이루기 때문입니다.

`prev_mergeable` 은 모음 · 문장부호 · 확정 · 백스페이스 · 커서 이동이 오면
바로 꺼집니다. 직전 키를 한 번 더 누른 경우에만 살아 있습니다.

### 아래아 중간 상태

`get_unicode()` 는 중성이 `·` 나 `‥` 이면 0 을 돌려줍니다(아직 모음이 아니므로).
그대로 두면 아래아를 누르는 동안 화면에 아무것도 안 보입니다.
그래서 `compose_display()` 가 그 경우만 따로 처리합니다.

```
초성 없음 + ·   →  "·"        (1칸)
초성 ㄱ  + ·    →  "ㄱ·"      (2칸)
초성 ㄱ  + ‥    →  "ㄱ‥"      (2칸)
```

초성만 있을 때의 호환 자모(`ㄱ`)를 얻으려고 중성을 잠깐 비운 뒤
`get_unicode()` 를 부르고 되돌립니다. 원본을 고치지 않고 원하는 값을 얻는 방법입니다.

모음이 덜 만들어진 아래아는 확정될 때도 지우지 않고 그대로 둡니다.
사용자가 `·` 를 넣으려던 것인지 모음을 만들다 만 것인지 알 수 없으므로,
엔진이 임의로 판단하지 않습니다.

### 원본의 함정 하나

`get_unicode()` 는 초성이 비어 있으면 `cho` 를 `18`(=`ㅎ`)로 떨어뜨립니다.
그래서 **초성이 없는 상태에서는 종성을 채우면 안 됩니다.**
오토마타는 모음만 있는 상태에서 자음을 받으면 앞 글자를 확정하고
새 음절의 초성으로 넣습니다(`ㅏ` + `ㄱ` → `ㅏㄱ` 두 글자).

## 오토마타

### 모음

`VOWEL_RULES` 는 (현재 중성, 누른 키) → 다음 중성 전이표입니다.
`NULL` 이면 그 조합은 없으므로 앞 글자를 확정하고 새 음절을 시작합니다.
`prev` 열은 백스페이스로 한 단계 되돌릴 때 씁니다.

```c
/* from     ㅣ       ·        ㅡ       prev  */
{ L"",     L"ㅣ",   L"·",    L"ㅡ",   L""    },
{ L"·",    L"ㅓ",   L"‥",    L"ㅗ",   L""    },
{ L"ㅗ",   L"ㅚ",   L"ㅛ",   NULL,    L"·"   },
{ L"ㅚ",   NULL,    L"ㅘ",   NULL,    L"ㅗ"  },
```

`ㅝ` 는 `ㅠ` + `ㅣ` 로 들어옵니다. `ㅠㅣ` 라는 모음이 없기 때문에
그 자리를 `ㅝ` 로 쓰는 것이 천지인의 규칙입니다.

### 자음

`CONS_CYCLE` 은 키마다 순환 목록을 갖습니다(`ㄱ ㅋ ㄲ`).
같은 키가 연달아 오면 순환하고, 그렇지 않으면 자리(초성 → 종성 → 겹받침)를 채웁니다.

순환 대상이 종성이면 `is_valid_jong()` 으로 걸러서 `ㄸ ㅃ ㅉ` 이 받침에 들어가지
않게 하고, 겹받침 자리면 `check_double()`(원본)로 실제로 합쳐지는지 확인합니다.

### 연음

받침이 있는 상태에서 모음 키가 오면, 마지막 자음을 떼어 새 음절의 초성으로 옮깁니다.

```
간(ㄱ ㅏ ㄴ) + ㅏ
  → 받침 ㄴ 을 떼고 "가" 확정
  → 새 음절 초성 ㄴ + 모음 ㅏ = "나"
```

겹받침이면 두 번째 자음만 넘어갑니다(`값` + 모음 → `갑` + `사...`).

### 연타 순환을 끊는 시점

`안녕` 처럼 같은 키가 연달아 필요할 때를 위해 `chunjiin_break_multitap()` 이
`last_key` 를 지웁니다. GUI 는 두 곳에서 부릅니다.

- 키 입력 뒤 0.8초 타이머(`TIMER_MULTITAP`)
- 커서 이동 · 확정 계열 동작 (`▶`, `←`, `Esc`, 스페이스 등은 `chunjiin_commit()` 이 겸함)

## GUI

- 편집 영역은 읽기 전용 `EDIT` 컨트롤입니다. 직접 타이핑하지 못하게 막고,
  서브클래스한 `EditProc` 에서 `WM_KEYDOWN` / `WM_CHAR` 를 가로채 엔진으로 보냅니다.
- `refresh_ui()` 가 엔진 버퍼를 통째로 `SetWindowTextW` 로 밀어 넣고
  `EM_SETSEL` 로 커서를 맞춥니다. 엔진의 `\n` 은 `\r\n` 으로 바꾸면서
  커서 위치도 같이 옮깁니다(`engine_to_display` / `display_to_engine`).
- 버튼은 전부 `BS_OWNERDRAW` 입니다. `WM_DRAWITEM` 에서 `RoundRect` 로 그리고,
  버튼마다 서브클래스를 걸어 `WM_MOUSEMOVE` / `WM_MOUSELEAVE` 로 호버 상태를
  `GWLP_USERDATA` 에 담습니다.
- 키 역할(모음 / 자음 / 문장부호 / 기능 / 모드)에 따라 색을 달리합니다.
  한글 모드가 아니면 12키를 모두 같은 색으로 그립니다.

### 테마

색은 모두 `THEMES[]` 표에서 가져옵니다. 창 배경 · 카드 · 테두리 · 글자 · 흐린 글자와,
버튼 역할(자음 / 모음 / 문장부호 / 기능 / 모드 / 툴바)마다 다섯 가지 색
(기본 · 호버 · 눌림 · 테두리 · 글자)을 갖습니다.

`apply_settings()` 가 글꼴과 브러시를 다시 만들고, 제목 표시줄은
`DwmSetWindowAttribute(DWMWA_USE_IMMERSIVE_DARK_MODE)` 로 맞춥니다.

메뉴는 색을 바꿀 방법이 없어서 `MFT_OWNERDRAW` 로 바꾸고 직접 그립니다.
`ownerdraw_menu()` 가 항목 문자열을 따로 보관하고,
`measure_menu_item()` / `draw_menu_item()` 이 크기와 그리기를 맡습니다.
`SetMenuInfo(MIM_BACKGROUND)` 로 메뉴 바깥 여백도 테마 색으로 칠합니다.

편집 영역의 스크롤바도 마찬가지입니다. 네이티브 스크롤바는 색을 바꿀 수 없어서
`WS_VSCROLL` 을 떼고 `ChunjiinScroll` 창을 옆에 두어 직접 그립니다.
`EM_GETLINECOUNT` 와 `EM_GETFIRSTVISIBLELINE` 로 손잡이 위치를 계산하고,
드래그하면 `EM_LINESCROLL` 로 편집 영역을 움직입니다. 필요 없으면 숨깁니다.

### 설정

`Settings` 구조체를 `HKCU\Software\Chunjiin` 에 DWORD 로 저장합니다.
설정 창은 고르는 즉시 `apply_settings()` 를 불러 미리 보여 주고,
`취소` 하면 열기 전에 떠 둔 사본으로 되돌립니다.

### 배치

5행 구조입니다. 위 4행은 3열 균등, 마지막 행은 기능 버튼 6개를 비율로 나눕니다.

```c
static const int FN_WEIGHT[6] = { 7, 4, 10, 4, 4, 6 };   /* 합 35 */
```

`x` 좌표를 누적 비율로 계산해서 반올림 오차가 쌓이지 않게 합니다.

## 설치 프로그램

`installer/setup.c` 는 `chunjiin.exe` 를 `RCDATA` 리소스로 품고 있다가
설치 폴더에 풉니다. 자기 자신을 `uninstall.exe` 로 복사해 두고,
`IShellLinkW` 로 바로 가기를, `HKCU\...\Uninstall\` 에 등록 정보를 만듭니다.

제거할 때는 실행 중인 자기 자신을 지울 수 없으므로,
잠깐 기다렸다가 파일과 폴더를 지우는 `cmd.exe` 를 띄우고 종료합니다.

## 테스트

`tests/test_engine.c` 는 GUI 없이 오토마타만 돌립니다.
키 시퀀스 문자열 → 기대 문자열 비교이고, 34개 구역 585개 항목입니다.
`test.bat` (또는 `test.sh`)로 실행하며 실패가 있으면 종료 코드 1 을 냅니다.

비교 축이 다섯 가지입니다.

| 함수 | 확인하는 것 |
|---|---|
| `expect` | 확정 후 텍스트 버퍼 |
| `expect_live` | 확정하지 않은, 조합 중인 화면 |
| `expect_cursor` | 버퍼 + 커서 위치 |
| `expect_comp` | 상태줄 조합 표시 |
| `expect_mode` | 모드 이름 |
| `check_labels` | 버튼 라벨의 첫 글자 == 실제 입력되는 글자 |

모음 전이표 · 받침 · 연음 · 겹받침처럼 표로 정리되는 것은
기대값을 시험 쪽에 따로 적어 두고 전수로 돌립니다.
`chunjiin.c` 의 `get_unicode()` `check_double()` `wchar_to_utf8()` 도
직접 불러서 확인합니다.

`check_labels` 는 다섯 모드 × 12키를 전수 확인합니다.
키 배열(`ENG_MAP` 등)을 바꾸고 라벨 배열(`LABEL_LOWER` 등)을 안 고치면
바로 걸립니다. 실제로 이 실수가 한 번 났기 때문에 넣은 장치입니다.

자세한 문법과 구역별 범위는 [Build.md](Build.md) 에 있습니다.
