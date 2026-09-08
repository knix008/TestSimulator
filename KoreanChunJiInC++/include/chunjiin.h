/*
 * chunjiin.h - 천지인(千地人) 한글 입력 엔진 공용 자료구조
 *
 * chunjiin.c 가 "../include/chunjiin.h" 로 참조하는 헤더이다.
 * chunjiin.c 는 수정하지 않는다는 전제로, 그 파일이 사용하는 모든
 * 타입/매크로/함수 원형을 여기에 정의한다.
 */
#ifndef CHUNJIIN_H
#define CHUNJIIN_H

#include <stdbool.h>
#include <stddef.h>
#include <wchar.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 편집 버퍼에 담을 수 있는 최대 문자 수(널 포함) */
#define MAX_TEXT_LEN    4096
/* 낱자 하나를 담는 문자열 버퍼 크기 */
#define MAX_JAMO_LEN    4
/* 영문/숫자/기호 조합 중인 문자열 버퍼 크기 */
#define MAX_ENGNUM_LEN  8
/* 키패드 키 개수 (0 ~ 11) */
#define KEY_COUNT       12

/* 입력 모드 */
typedef enum {
    MODE_HANGUL = 0,      /* 한글 (천지인) */
    MODE_ENGLISH,         /* 영문 소문자 */
    MODE_UPPER_ENGLISH,   /* 영문 대문자 */
    MODE_NUMBER,          /* 숫자 */
    MODE_SPECIAL,         /* 기호 */
    MODE_COUNT
} InputMode;

/* 조합 중인 낱자가 마지막으로 들어간 자리 (획추가/쌍자음 키의 대상 결정용) */
typedef enum {
    SLOT_NONE = 0,
    SLOT_CHOSUNG,
    SLOT_JUNGSUNG,
    SLOT_JONGSUNG,
    SLOT_JONGSUNG2
} JamoSlot;

/*
 * 조합 중인 한 음절의 상태.
 * jungsung 에는 완성 모음뿐 아니라 중간 상태인 L"·"(아래아 1개),
 * L"‥"(아래아 2개) 도 들어간다. get_unicode() 가 이 두 값을
 * "아직 모음이 아님"으로 취급한다.
 */
typedef struct {
    wchar_t chosung[MAX_JAMO_LEN];
    wchar_t jungsung[MAX_JAMO_LEN];
    wchar_t jongsung[MAX_JAMO_LEN];
    wchar_t jongsung2[MAX_JAMO_LEN];   /* 겹받침의 두 번째 자음 */

    int  step;              /* JamoSlot: 마지막으로 채워진 자리 */
    bool flag_writing;      /* true 면 text_buffer[cursor_pos-1] 이 조합 중인 글자 */
    bool flag_dotused;      /* 아래아(·)로 시작한 모음인지 */
    bool flag_doubled;      /* 현재 자음이 쌍자음으로 바뀐 상태인지 */
    bool flag_addcursor;    /* 직전 입력에서 음절이 확정되었는지 */
    bool flag_space;        /* 직전 입력이 공백이었는지 */
} HangulState;

/* 입력기 전체 상태 */
typedef struct {
    HangulState hangul;

    InputMode now_mode;

    wchar_t engnum[MAX_ENGNUM_LEN];  /* 영문/숫자/기호 모드에서 조합 중인 문자 */
    bool    flag_initengnum;         /* engnum 이 화면에 반영되어 있는지 */
    bool    flag_engdelete;          /* 다음 입력이 덮어쓰기(멀티탭 연타)인지 */

    wchar_t text_buffer[MAX_TEXT_LEN];
    int     cursor_pos;              /* 삽입 위치. 조합 중이면 조합 글자는 cursor_pos-1 */

    /* 아래는 chunjiin.c 가 쓰지 않는 확장 필드 */
    int last_key;                    /* 직전에 눌린 키 인덱스, 없으면 -1 */
    int tap_count;                   /* 같은 키 연타 위치 */
    int compose_len;                 /* 조합 중인 글자가 차지하는 칸 수 (0~2) */

    /*
     * 겹받침 되돌려 붙이기용.
     * 받침 뒤에 온 자음이 겹받침을 이루지 못해 새 음절로 떨어져 나갔을 때,
     * 바로 앞 음절을 기억해 둔다. 그 자음을 연타해서 겹받침이 되는 자음으로
     * 바뀌면 앞 음절로 도로 합친다. (만 + ㅅ -> 만ㅅ -> 많)
     */
    HangulState prev_syllable;
    bool        prev_mergeable;
} ChunjiinState;

/* 커서를 유효 범위로 보정 */
#define CLAMP_CURSOR(state)                                        \
    do {                                                           \
        if ((state)->cursor_pos < 0) (state)->cursor_pos = 0;      \
        if ((state)->cursor_pos > MAX_TEXT_LEN - 1)                \
            (state)->cursor_pos = MAX_TEXT_LEN - 1;                \
    } while (0)

/* ---- chunjiin.c 에 구현되어 있는 함수들 ---- */
char *wchar_to_utf8(const wchar_t *wstr, size_t max_len);
void  chunjiin_init(ChunjiinState *state);
void  hangul_init(HangulState *hangul);
void  init_engnum(ChunjiinState *state);
void  chunjiin_process_input(ChunjiinState *state, int input);
void  delete_char(ChunjiinState *state);
int   get_unicode(HangulState *hangul, const wchar_t *real_jong);
void  check_double(const wchar_t *jong, const wchar_t *jong2, wchar_t *result);

#ifdef __cplusplus
}
#endif

#endif /* CHUNJIIN_H */
