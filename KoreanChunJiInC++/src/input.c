/*
 * input.c - 천지인 입력 오토마타 구현
 *
 * chunjiin.c(수정 금지)가 호출하는 hangul_make / write_hangul /
 * eng_make / num_make / special_make / write_engnum 을 구현하고,
 * GUI 가 쓰는 편집 API 를 함께 제공한다.
 *
 * 키 배열 (인덱스 0~11, 3열 4행)
 *
 *      ㅣ     ·      ㅡ        0  1  2
 *      ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
 *      ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
 *      . ,    ㅇㅁ   ? !       9  10 11
 *
 * 자음 키는 연타하면 순환한다(ㄱ→ㅋ→ㄲ→ㄱ...).
 * 거센소리·된소리가 모두 순환에 들어 있으므로 획추가/쌍자음 키는 두지 않고,
 * 그 자리에 문장부호 키를 둔다.
 */
#include <string.h>
#include <wchar.h>
#include <stdio.h>

#include "chunjiin.h"
#include "input.h"

/* ------------------------------------------------------------------ */
/* 키 정의                                                             */
/* ------------------------------------------------------------------ */
#define KEY_I       0   /* ㅣ */
#define KEY_DOT     1   /* 아래아 */
#define KEY_EU      2   /* ㅡ */
#define KEY_PUNCT1  9   /* . , */
#define KEY_PUNCT2 11   /* ? ! */

/* 자음 키의 순환 목록. 자음 키가 아니면 첫 항목이 NULL. */
static const wchar_t *const CONS_CYCLE[KEY_COUNT][4] = {
    { NULL, NULL, NULL, NULL },                 /* 0  ㅣ */
    { NULL, NULL, NULL, NULL },                 /* 1  아래아 */
    { NULL, NULL, NULL, NULL },                 /* 2  ㅡ */
    { L"ㄱ", L"ㅋ", L"ㄲ", NULL },              /* 3  */
    { L"ㄴ", L"ㄹ", NULL,  NULL },              /* 4  */
    { L"ㄷ", L"ㅌ", L"ㄸ", NULL },              /* 5  */
    { L"ㅂ", L"ㅍ", L"ㅃ", NULL },              /* 6  */
    { L"ㅅ", L"ㅎ", L"ㅆ", NULL },              /* 7  */
    { L"ㅈ", L"ㅊ", L"ㅉ", NULL },              /* 8  */
    { NULL, NULL, NULL, NULL },                 /* 9  . , */
    { L"ㅇ", L"ㅁ", NULL,  NULL },              /* 10 */
    { NULL, NULL, NULL, NULL }                  /* 11 ? ! */
};

/*
 * 모음 전이표.
 * from 상태에서 ㅣ / 아래아 / ㅡ 키를 눌렀을 때의 다음 상태.
 * NULL 이면 그 조합은 없으므로 현재 음절을 확정하고 새 음절을 시작한다.
 * prev 는 백스페이스로 한 단계 되돌릴 때의 상태.
 */
typedef struct {
    const wchar_t *from;
    const wchar_t *by_i;
    const wchar_t *by_dot;
    const wchar_t *by_eu;
    const wchar_t *prev;
} VowelRule;

static const VowelRule VOWEL_RULES[] = {
    /* from     ㅣ       아래아   ㅡ       prev  */
    { L"",     L"ㅣ",   L"·",    L"ㅡ",   L""    },
    { L"·",    L"ㅓ",   L"‥",    L"ㅗ",   L""    },
    { L"‥",    L"ㅕ",   L"·",    L"ㅛ",   L"·"   },
    { L"ㅣ",   NULL,    L"ㅏ",   NULL,    L""    },
    { L"ㅡ",   L"ㅢ",   L"ㅜ",   NULL,    L""    },
    { L"ㅏ",   L"ㅐ",   L"ㅑ",   NULL,    L"ㅣ"  },
    { L"ㅑ",   L"ㅒ",   L"ㅏ",   NULL,    L"ㅏ"  },
    { L"ㅓ",   L"ㅔ",   L"ㅕ",   NULL,    L"·"   },
    { L"ㅕ",   L"ㅖ",   L"ㅓ",   NULL,    L"ㅓ"  },
    { L"ㅗ",   L"ㅚ",   L"ㅛ",   NULL,    L"·"   },
    { L"ㅛ",   NULL,    L"ㅗ",   NULL,    L"ㅗ"  },
    { L"ㅜ",   L"ㅟ",   L"ㅠ",   NULL,    L"ㅡ"  },
    { L"ㅠ",   L"ㅝ",   L"ㅜ",   NULL,    L"ㅜ"  },
    { L"ㅚ",   NULL,    L"ㅘ",   NULL,    L"ㅗ"  },
    { L"ㅘ",   L"ㅙ",   NULL,    NULL,    L"ㅚ"  },
    { L"ㅝ",   L"ㅞ",   NULL,    NULL,    L"ㅠ"  },
    { L"ㅐ",   NULL,    NULL,    NULL,    L"ㅏ"  },
    { L"ㅒ",   NULL,    NULL,    NULL,    L"ㅑ"  },
    { L"ㅔ",   NULL,    NULL,    NULL,    L"ㅓ"  },
    { L"ㅖ",   NULL,    NULL,    NULL,    L"ㅕ"  },
    { L"ㅙ",   NULL,    NULL,    NULL,    L"ㅘ"  },
    { L"ㅞ",   NULL,    NULL,    NULL,    L"ㅝ"  },
    { L"ㅟ",   NULL,    NULL,    NULL,    L"ㅜ"  },
    { L"ㅢ",   NULL,    NULL,    NULL,    L"ㅡ"  }
};
#define VOWEL_RULE_COUNT ((int)(sizeof(VOWEL_RULES) / sizeof(VOWEL_RULES[0])))

/* 받침으로 쓸 수 있는 자음 (ㄸ ㅃ ㅉ 은 불가) */
static const wchar_t *const VALID_JONG[] = {
    L"ㄱ", L"ㄲ", L"ㄴ", L"ㄷ", L"ㄹ", L"ㅁ", L"ㅂ", L"ㅅ",
    L"ㅆ", L"ㅇ", L"ㅈ", L"ㅊ", L"ㅋ", L"ㅌ", L"ㅍ", L"ㅎ"
};
#define VALID_JONG_COUNT ((int)(sizeof(VALID_JONG) / sizeof(VALID_JONG[0])))

/* ------------------------------------------------------------------ */
/* 작은 도우미들                                                       */
/* ------------------------------------------------------------------ */

static bool is_empty(const wchar_t *s) { return s == NULL || s[0] == 0; }

static bool is_dot_state(const wchar_t *jung) {
    return wcscmp(jung, L"·") == 0 || wcscmp(jung, L"‥") == 0;
}

static bool is_valid_jong(const wchar_t *c) {
    int i;
    if (is_empty(c)) return false;
    for (i = 0; i < VALID_JONG_COUNT; i++) {
        if (wcscmp(VALID_JONG[i], c) == 0) return true;
    }
    return false;
}

/* jong + c 가 겹받침을 이루는가 */
static bool can_combine_jong(const wchar_t *jong, const wchar_t *c) {
    wchar_t tmp[MAX_JAMO_LEN];
    check_double(jong, c, tmp);
    return tmp[0] != 0;
}

static const VowelRule *find_vowel_rule(const wchar_t *jung) {
    int i;
    for (i = 0; i < VOWEL_RULE_COUNT; i++) {
        if (wcscmp(VOWEL_RULES[i].from, jung) == 0) return &VOWEL_RULES[i];
    }
    return NULL;
}

/* 모음 전이. 불가능하면 NULL. */
static const wchar_t *vowel_next(const wchar_t *jung, int key) {
    const VowelRule *r = find_vowel_rule(jung);
    if (r == NULL) return NULL;
    if (key == KEY_I)   return r->by_i;
    if (key == KEY_DOT) return r->by_dot;
    if (key == KEY_EU)  return r->by_eu;
    return NULL;
}

static const wchar_t *vowel_prev(const wchar_t *jung) {
    const VowelRule *r = find_vowel_rule(jung);
    return (r == NULL) ? L"" : r->prev;
}

static int cycle_len(int key) {
    int n = 0;
    while (n < 4 && CONS_CYCLE[key][n] != NULL) n++;
    return n;
}

static bool is_cons_key(int key) {
    return key >= 0 && key < KEY_COUNT && CONS_CYCLE[key][0] != NULL;
}

static bool is_vowel_key(int key) {
    return key == KEY_I || key == KEY_DOT || key == KEY_EU;
}

/* 현재 조합에서 "마지막으로 채워진 자음 자리"의 포인터. 없으면 NULL. */
static wchar_t *cons_slot(HangulState *h) {
    switch (h->step) {
        case SLOT_CHOSUNG:   return h->chosung;
        case SLOT_JONGSUNG:  return h->jongsung;
        case SLOT_JONGSUNG2: return h->jongsung2;
        default:             return NULL;
    }
}

/* ------------------------------------------------------------------ */
/* 텍스트 버퍼 조작                                                    */
/* ------------------------------------------------------------------ */

static void text_insert(ChunjiinState *state, wchar_t ch) {
    int len = (int)wcslen(state->text_buffer);
    int i;

    if (len >= MAX_TEXT_LEN - 1) return;
    if (state->cursor_pos > len) state->cursor_pos = len;
    if (state->cursor_pos < 0)   state->cursor_pos = 0;

    for (i = len; i > state->cursor_pos; i--) {
        state->text_buffer[i] = state->text_buffer[i - 1];
    }
    state->text_buffer[state->cursor_pos] = ch;
    state->text_buffer[len + 1] = 0;
    state->cursor_pos++;
    CLAMP_CURSOR(state);
}

/* ------------------------------------------------------------------ */
/* 화면 출력 - 조합 중인 글자는 cursor_pos-1 자리에서 계속 갱신된다    */
/* ------------------------------------------------------------------ */

/*
 * 조합 중인 상태를 화면에 보여줄 문자열로 만든다. 최대 2칸.
 *
 * 아래아만 찍힌 중간 상태(·, ‥)에서는 get_unicode() 가 0 을 돌려주므로
 * 아무것도 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
 * "ㄱ·", "·", "‥" 처럼 눈에 보이게 만든다.
 */
static int compose_display(HangulState *h, wchar_t *out)
{
    wchar_t real_jong[MAX_JAMO_LEN];
    int n = 0;
    int code;

    if (is_dot_state(h->jungsung)) {
        if (!is_empty(h->chosung)) {
            wchar_t saved[MAX_JAMO_LEN];

            /* 초성 홀로일 때의 호환 자모를 얻기 위해 중성을 잠시 비운다 */
            wcscpy(saved, h->jungsung);
            h->jungsung[0] = 0;
            code = get_unicode(h, L"");
            wcscpy(h->jungsung, saved);
            if (code != 0) out[n++] = (wchar_t)code;
        }
        out[n++] = h->jungsung[0];      /* '·' 또는 '‥' */
        out[n] = 0;
        return n;
    }

    real_jong[0] = 0;
    if (!is_empty(h->jongsung2)) {
        check_double(h->jongsung, h->jongsung2, real_jong);
        if (real_jong[0] == 0) wcscpy(real_jong, h->jongsung);
    } else if (!is_empty(h->jongsung)) {
        wcscpy(real_jong, h->jongsung);
    }

    code = get_unicode(h, real_jong);
    if (code != 0) out[n++] = (wchar_t)code;
    out[n] = 0;
    return n;
}

/*
 * 조합 중인 글자를 화면에 반영한다.
 * 직전에 그려 둔 compose_len 칸을 지우고 새로 그린다.
 */
void write_hangul(ChunjiinState *state)
{
    wchar_t shown[4];
    int n, i;

    n = compose_display(&state->hangul, shown);

    while (state->compose_len > 0) {
        delete_char(state);
        state->compose_len--;
    }
    for (i = 0; i < n; i++) {
        int before = (int)wcslen(state->text_buffer);
        text_insert(state, shown[i]);
        if ((int)wcslen(state->text_buffer) > before) state->compose_len++;
    }
    state->hangul.flag_writing = (state->compose_len > 0);
}

void write_engnum(ChunjiinState *state) {
    if (state->engnum[0] == 0) return;

    if (state->flag_engdelete && state->cursor_pos > 0) {
        state->text_buffer[state->cursor_pos - 1] = state->engnum[0];
    } else {
        text_insert(state, state->engnum[0]);
    }
    state->flag_engdelete = true;
    state->flag_initengnum = true;
}

/* ------------------------------------------------------------------ */
/* 음절 확정                                                           */
/* ------------------------------------------------------------------ */

/*
 * 현재 조합을 버퍼에 반영하고 새 음절을 시작할 수 있는 상태로 만든다.
 *
 * 아직 모음이 되지 못한 아래아(·, ‥)도 그대로 둔다. 사용자가 그걸 남길
 * 생각이었는지 아닌지 알 수 없으므로 임의로 지우지 않는다.
 */
static void commit_and_start(ChunjiinState *state) {
    write_hangul(state);
    hangul_init(&state->hangul);       /* flag_writing = false -> 다음 글자는 새로 삽입 */
    state->hangul.flag_addcursor = true;
    state->compose_len = 0;            /* 이미 찍힌 칸은 확정 글자가 된다 */
    state->prev_mergeable = false;
    state->last_key = -1;
    state->tap_count = 0;
}

void chunjiin_commit(ChunjiinState *state) {
    if (state->now_mode == MODE_HANGUL) {
        if (state->hangul.flag_writing) write_hangul(state);
        hangul_init(&state->hangul);
        state->compose_len = 0;
    } else {
        init_engnum(state);
    }
    state->prev_mergeable = false;
    state->last_key = -1;
    state->tap_count = 0;
}

/* ------------------------------------------------------------------ */
/* 한글 오토마타                                                       */
/* ------------------------------------------------------------------ */

/*
 * 자음 c 를 새 음절의 초성으로 삼는다.
 * mergeable 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더 눌러
 * 겹받침이 되는 자음이 나오면 try_merge_jong() 이 도로 합친다.
 */
static void start_with_chosung(ChunjiinState *state, const wchar_t *c,
                               int key, bool mergeable)
{
    HangulState previous = state->hangul;

    commit_and_start(state);
    if (mergeable) {
        state->prev_syllable = previous;
        state->prev_mergeable = true;
    }
    wcscpy(state->hangul.chosung, c);
    state->hangul.step = SLOT_CHOSUNG;
    state->last_key = key;
    state->tap_count = 0;
}

/*
 * 떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.
 * 성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는 write_hangul() 이
 * 두 칸을 지우고 합쳐진 한 글자를 그린다.
 */
static bool try_merge_jong(ChunjiinState *state, int key)
{
    HangulState *h = &state->hangul;
    const HangulState *prev = &state->prev_syllable;
    int n = cycle_len(key);
    int i;

    if (h->step != SLOT_CHOSUNG || !is_empty(h->jungsung)) return false;
    if (is_empty(prev->jongsung) || !is_empty(prev->jongsung2)) return false;

    for (i = 1; i <= n; i++) {
        int idx = (state->tap_count + i) % n;
        const wchar_t *cand = CONS_CYCLE[key][idx];

        if (!can_combine_jong(prev->jongsung, cand)) continue;

        state->compose_len++;          /* 앞 칸(확정된 음절)도 다시 그린다 */
        state->hangul = *prev;
        wcscpy(state->hangul.jongsung2, cand);
        state->hangul.step = SLOT_JONGSUNG2;
        state->hangul.flag_writing = true;
        state->tap_count = idx;
        return true;
    }
    return false;
}

/* 같은 자음 키 연타: 현재 자리에서 다음 후보로 순환한다. 성공하면 true. */
static bool cycle_consonant(ChunjiinState *state, int key)
{
    HangulState *h = &state->hangul;
    wchar_t *slot = cons_slot(h);
    int n = cycle_len(key);
    int i;

    if (slot == NULL || is_empty(slot) || n == 0) return false;

    /* 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다 */
    for (i = 1; i <= n; i++) {
        int idx = (state->tap_count + i) % n;
        const wchar_t *cand = CONS_CYCLE[key][idx];

        if (n > 1 && wcscmp(cand, slot) == 0) continue;
        if (h->step == SLOT_JONGSUNG && !is_valid_jong(cand)) continue;
        if (h->step == SLOT_JONGSUNG2 && !can_combine_jong(h->jongsung, cand)) continue;

        wcscpy(slot, cand);
        state->tap_count = idx;
        h->flag_doubled = (idx == 2);   /* 순환 3번째 자리는 항상 된소리 */
        return true;
    }
    return false;
}

static void hangul_consonant(ChunjiinState *state, int key)
{
    HangulState *h = &state->hangul;
    const wchar_t *c = CONS_CYCLE[key][0];
    bool mergeable = state->prev_mergeable;

    state->prev_mergeable = false;

    if (state->last_key == key) {
        if (mergeable && try_merge_jong(state, key)) return;
        if (cycle_consonant(state, key)) return;
    }

    if (is_empty(h->chosung) && is_empty(h->jungsung)) {
        /* 빈 음절 -> 초성 */
        wcscpy(h->chosung, c);
        h->step = SLOT_CHOSUNG;
        state->last_key = key;
        state->tap_count = 0;
        return;
    }

    if (is_empty(h->jungsung) || is_dot_state(h->jungsung)) {
        /* 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절 */
        start_with_chosung(state, c, key, false);
        return;
    }

    if (is_empty(h->chosung)) {
        /* 모음만 있던 상태 -> 앞을 확정하고 새 음절 */
        start_with_chosung(state, c, key, false);
        return;
    }

    if (is_empty(h->jongsung)) {
        if (is_valid_jong(c)) {
            wcscpy(h->jongsung, c);
            h->step = SLOT_JONGSUNG;
            state->last_key = key;
            state->tap_count = 0;
        } else {
            start_with_chosung(state, c, key, false);
        }
        return;
    }

    if (is_empty(h->jongsung2) && can_combine_jong(h->jongsung, c)) {
        wcscpy(h->jongsung2, c);
        h->step = SLOT_JONGSUNG2;
        state->last_key = key;
        state->tap_count = 0;
        return;
    }

    /* 받침 뒤에 붙지 못한 자음 -> 새 음절. 겹받침으로 되돌아올 수 있게 기억해 둔다. */
    start_with_chosung(state, c, key, is_empty(h->jongsung2));
}

static void hangul_vowel(ChunjiinState *state, int key)
{
    HangulState *h = &state->hangul;
    const wchar_t *next;

    state->prev_mergeable = false;

    /* 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다 */
    if (!is_empty(h->jongsung)) {
        wchar_t moved[MAX_JAMO_LEN];

        if (!is_empty(h->jongsung2)) {
            wcscpy(moved, h->jongsung2);
            h->jongsung2[0] = 0;
        } else {
            wcscpy(moved, h->jongsung);
            h->jongsung[0] = 0;
        }

        commit_and_start(state);          /* 받침을 뺀 모습으로 앞 글자 확정 */
        wcscpy(h->chosung, moved);
        h->step = SLOT_CHOSUNG;
    }

    next = vowel_next(h->jungsung, key);
    if (next == NULL) {
        /* 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로 */
        commit_and_start(state);
        next = vowel_next(L"", key);
        if (next == NULL) return;
    }

    wcscpy(h->jungsung, next);
    h->step = SLOT_JUNGSUNG;
    h->flag_dotused = is_dot_state(next);
    state->last_key = key;
    state->tap_count = 0;
}

/* 문장부호 키 (9 = ". ,", 11 = "? !"). 연타하면 순환한다. */
static const wchar_t *const PUNCT_SET[2] = { L".,", L"?!" };

static void hangul_punct(ChunjiinState *state, int key)
{
    const wchar_t *set = PUNCT_SET[key == KEY_PUNCT2];
    int n = (int)wcslen(set);
    int idx;

    state->prev_mergeable = false;

    if (state->last_key == key && !state->hangul.flag_writing &&
        state->cursor_pos > 0) {
        idx = (state->tap_count + 1) % n;
        state->text_buffer[state->cursor_pos - 1] = set[idx];
    } else {
        commit_and_start(state);       /* 조합 중인 글자를 확정하고 */
        idx = 0;
        text_insert(state, set[idx]);  /* 부호를 새로 넣는다 */
    }
    state->last_key = key;
    state->tap_count = idx;
}

void hangul_make(ChunjiinState *state, int input)
{
    if (input < 0 || input >= KEY_COUNT) return;

    state->hangul.flag_space = false;
    state->hangul.flag_addcursor = false;

    if (is_vowel_key(input)) {
        hangul_vowel(state, input);
    } else if (is_cons_key(input)) {
        hangul_consonant(state, input);
    } else if (input == KEY_PUNCT1 || input == KEY_PUNCT2) {
        hangul_punct(state, input);
    }
}

/* ------------------------------------------------------------------ */
/* 영문 / 숫자 / 기호                                                  */
/* ------------------------------------------------------------------ */

/*
 * 영문 배열.
 * 한 키에 세 글자까지만 둔다. 그래서 알파벳 26자가 위 3x3 (0~8번) 을 채우고,
 * 마지막 줄 세 키(9~11)가 자주 쓰는 기호를 맡는다.
 * 나머지 기호는 기호 모드에서 넣는다.
 * 띄어쓰기는 스페이스 버튼과 스페이스바가 따로 있으므로 키패드에 두지 않는다.
 *
 *      abc   def   ghi
 *      jkl   mno   pqr
 *      stu   vwx   yz
 *      .,?   !'"   -:@
 */
static const wchar_t *const ENG_MAP[KEY_COUNT] = {
    L"abc",   L"def",    L"ghi",
    L"jkl",   L"mno",    L"pqr",
    L"stu",   L"vwx",    L"yz",
    L".,?",   L"!'\"",   L"-:@"
};

/* 숫자는 키마다 하나씩. 순환하지 않는다. */
static const wchar_t NUM_MAP[] = L"123456789*0#";

/*
 * 기호 모드. 한 키에 세 개씩, 12키로 36개를 덮는다.
 * 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
 */
static const wchar_t *const SPECIAL_MAP[KEY_COUNT] = {
    L".,:",   L"?!;",   L"'\"`",
    L"-_~",   L"+=*",   L"/\\|",
    L"()&",   L"[]^",   L"{}%",
    L"<>#",   L"@$₩",   L"※…・"
};

/* 휴대전화식 멀티탭. 같은 키를 연달아 누르면 목록을 돈다. */
static void multitap_make(ChunjiinState *state, int input,
                          const wchar_t *set, bool to_upper)
{
    int n = (int)wcslen(set);
    wchar_t c;

    if (n == 0) return;

    if (state->last_key == input && state->flag_engdelete) {
        state->tap_count = (state->tap_count + 1) % n;
    } else {
        state->tap_count = 0;
        state->flag_engdelete = false;   /* 새 문자로 삽입 */
    }

    c = set[state->tap_count];
    if (to_upper && c >= L'a' && c <= L'z') {
        c = (wchar_t)(c - L'a' + L'A');
    }
    state->engnum[0] = c;
    state->engnum[1] = 0;
    state->last_key = input;
}

void eng_make(ChunjiinState *state, int input)
{
    if (input < 0 || input >= KEY_COUNT) return;
    multitap_make(state, input, ENG_MAP[input],
                  state->now_mode == MODE_UPPER_ENGLISH);
}

void special_make(ChunjiinState *state, int input)
{
    if (input < 0 || input >= KEY_COUNT) return;
    multitap_make(state, input, SPECIAL_MAP[input], false);
}

void num_make(ChunjiinState *state, int input)
{
    if (input < 0 || input >= KEY_COUNT) return;
    state->engnum[0] = NUM_MAP[input];
    state->engnum[1] = 0;
    state->flag_engdelete = false;
    state->last_key = -1;
    state->tap_count = 0;
}

/* ------------------------------------------------------------------ */
/* GUI 용 편집 API                                                     */
/* ------------------------------------------------------------------ */

void chunjiin_insert_char(ChunjiinState *state, wchar_t ch)
{
    chunjiin_commit(state);
    text_insert(state, ch);
}

void chunjiin_space(ChunjiinState *state)
{
    chunjiin_insert_char(state, L' ');
    state->hangul.flag_space = true;
}

void chunjiin_backspace(ChunjiinState *state)
{
    HangulState *h = &state->hangul;

    if (state->now_mode == MODE_HANGUL && h->flag_writing) {
        if (!is_empty(h->jongsung2)) {
            h->jongsung2[0] = 0;
            h->step = SLOT_JONGSUNG;
        } else if (!is_empty(h->jongsung)) {
            h->jongsung[0] = 0;
            h->step = is_empty(h->jungsung) ? SLOT_CHOSUNG : SLOT_JUNGSUNG;
        } else if (!is_empty(h->jungsung)) {
            wcscpy(h->jungsung, vowel_prev(h->jungsung));
            h->step = is_empty(h->jungsung)
                        ? (is_empty(h->chosung) ? SLOT_NONE : SLOT_CHOSUNG)
                        : SLOT_JUNGSUNG;
        } else if (!is_empty(h->chosung)) {
            h->chosung[0] = 0;
            h->step = SLOT_NONE;
        }

        write_hangul(state);

        if (is_empty(h->chosung) && is_empty(h->jungsung) && is_empty(h->jongsung)) {
            hangul_init(&state->hangul);
        }
        state->prev_mergeable = false;
        state->last_key = -1;
        state->tap_count = 0;
        return;
    }

    chunjiin_commit(state);
    delete_char(state);
}

void chunjiin_move_cursor(ChunjiinState *state, int delta)
{
    int len;
    chunjiin_commit(state);
    len = (int)wcslen(state->text_buffer);
    state->cursor_pos += delta;
    if (state->cursor_pos < 0) state->cursor_pos = 0;
    if (state->cursor_pos > len) state->cursor_pos = len;
    CLAMP_CURSOR(state);
}

void chunjiin_set_cursor(ChunjiinState *state, int pos)
{
    int len;
    chunjiin_commit(state);
    len = (int)wcslen(state->text_buffer);
    state->cursor_pos = (pos < 0) ? 0 : (pos > len ? len : pos);
    CLAMP_CURSOR(state);
}

void chunjiin_reset(ChunjiinState *state)
{
    chunjiin_init(state);
    state->last_key = -1;
    state->tap_count = 0;
    state->compose_len = 0;
    state->prev_mergeable = false;
    hangul_init(&state->prev_syllable);
}

void chunjiin_clear(ChunjiinState *state)
{
    InputMode mode = state->now_mode;
    chunjiin_reset(state);
    state->now_mode = mode;
}

void chunjiin_set_mode(ChunjiinState *state, InputMode mode)
{
    if (mode < 0 || mode >= MODE_COUNT) return;
    chunjiin_commit(state);
    state->now_mode = mode;
    init_engnum(state);
    state->last_key = -1;
    state->tap_count = 0;
}

void chunjiin_cycle_mode(ChunjiinState *state)
{
    chunjiin_set_mode(state, (InputMode)((state->now_mode + 1) % MODE_COUNT));
}

/*
 * 연타 순환을 끊는다.
 * "안녕"처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은 키는
 * 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는 유지된다.
 */
void chunjiin_break_multitap(ChunjiinState *state)
{
    state->last_key = -1;
    state->tap_count = 0;
    if (state->now_mode != MODE_HANGUL) state->flag_engdelete = false;
}

/* ------------------------------------------------------------------ */
/* 표시용 문자열                                                       */
/* ------------------------------------------------------------------ */

static const wchar_t *const LABEL_HANGUL[KEY_COUNT] = {
    L"ㅣ", L"·", L"ㅡ",
    L"ㄱㅋ", L"ㄴㄹ", L"ㄷㅌ",
    L"ㅂㅍ", L"ㅅㅎ", L"ㅈㅊ",
    L". ,", L"ㅇㅁ", L"? !"
};

/* ENG_MAP 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번 */
static const wchar_t *const LABEL_LOWER[KEY_COUNT] = {
    L"abc",     L"def",      L"ghi",
    L"jkl",     L"mno",      L"pqr",
    L"stu",     L"vwx",      L"yz",
    L". , ?",   L"! ' \"",   L"- : @"
};

static const wchar_t *const LABEL_UPPER[KEY_COUNT] = {
    L"ABC",     L"DEF",      L"GHI",
    L"JKL",     L"MNO",      L"PQR",
    L"STU",     L"VWX",      L"YZ",
    L". , ?",   L"! ' \"",   L"- : @"
};

static const wchar_t *const LABEL_NUMBER[KEY_COUNT] = {
    L"1", L"2", L"3", L"4", L"5", L"6",
    L"7", L"8", L"9", L"*", L"0", L"#"
};

/* SPECIAL_MAP 과 같은 순서 */
static const wchar_t *const LABEL_SPECIAL[KEY_COUNT] = {
    L". , :",   L"? ! ;",   L"' \" `",
    L"- _ ~",   L"+ = *",   L"/ \\ |",
    L"( ) &",   L"[ ] ^",   L"{ } %",
    L"< > #",   L"@ $ ₩",   L"※ … ・"
};

const wchar_t *chunjiin_key_label(const ChunjiinState *state, int key)
{
    if (key < 0 || key >= KEY_COUNT) return L"";
    switch (state->now_mode) {
        case MODE_HANGUL:        return LABEL_HANGUL[key];
        case MODE_ENGLISH:       return LABEL_LOWER[key];
        case MODE_UPPER_ENGLISH: return LABEL_UPPER[key];
        case MODE_NUMBER:        return LABEL_NUMBER[key];
        default:                 return LABEL_SPECIAL[key];
    }
}

const wchar_t *chunjiin_mode_name(const ChunjiinState *state)
{
    switch (state->now_mode) {
        case MODE_HANGUL:        return L"한글";
        case MODE_ENGLISH:       return L"영문 abc";
        case MODE_UPPER_ENGLISH: return L"영문 ABC";
        case MODE_NUMBER:        return L"숫자 123";
        default:                 return L"기호 !@#";
    }
}

void chunjiin_composition_text(const ChunjiinState *state, wchar_t *out, size_t out_len)
{
    const HangulState *h = &state->hangul;
    wchar_t line[64];

    if (out == NULL || out_len == 0) return;
    out[0] = 0;

    if (state->now_mode != MODE_HANGUL) {
        if (state->engnum[0] != 0 && state->flag_engdelete && out_len >= 2) {
            out[0] = state->engnum[0];
            out[1] = 0;
        }
        return;
    }

    if (is_empty(h->chosung) && is_empty(h->jungsung) && is_empty(h->jongsung)) return;

    /* 넉넉한 자리에서 만든 뒤 옮긴다. out 이 짧아도 잘려 나갈 뿐 넘치지 않는다. */
    swprintf(line, sizeof(line) / sizeof(line[0]), L"%ls + %ls + %ls%ls",
             is_empty(h->chosung)   ? L"-" : h->chosung,
             is_empty(h->jungsung)  ? L"-" : h->jungsung,
             is_empty(h->jongsung)  ? L"-" : h->jongsung,
             is_empty(h->jongsung2) ? L""  : h->jongsung2);

    wcsncpy(out, line, out_len - 1);
    out[out_len - 1] = 0;
}
