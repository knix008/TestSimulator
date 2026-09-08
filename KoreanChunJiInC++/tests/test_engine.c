/*
 * test_engine.c - 천지인 오토마타 회귀 시험
 *
 * GUI 없이 엔진만 돌려서 키 시퀀스와 결과 문자열을 비교한다.
 *
 *   test_engine            항목마다 PASS/FAIL 을 찍고 마지막에 요약
 *   test_engine -q         실패한 항목과 요약만
 *   test_engine -h         도움말
 *
 * 키 시퀀스 문법
 *   0~9   키 0~9            a  키 10 (ㅇㅁ)      b  키 11 (? !)
 *   _     스페이스          <  백스페이스        |  연타 순환 끊기
 *   !     조합 확정         ~  전체 지우기       /  줄바꿈
 *   [ ]   커서 왼쪽/오른쪽  {  맨 앞으로         }  맨 뒤로
 *   H E U N S              모드: 한글/영소/영대/숫자/기호
 *   M     모드 순환
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#ifdef _WIN32
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#endif

#include "chunjiin.h"
#include "input.h"

/* ------------------------------------------------------------------ */
/* 하네스                                                              */
/* ------------------------------------------------------------------ */

#define MAX_SECTIONS 48

typedef struct {
    const char *name;
    int pass;
    int fail;
} SectionStat;

static int g_pass, g_fail;
static int g_quiet;                       /* -q 면 통과 항목은 찍지 않는다 */
static SectionStat g_sections[MAX_SECTIONS];
static int g_section_count;
static SectionStat *g_cur;

/* ------------------------------------------------------------------ */
/* 색                                                                  */
/* ------------------------------------------------------------------ */

#define ANSI_RESET   "\033[0m"
#define ANSI_GREEN   "\033[32m"
#define ANSI_RED     "\033[31m"
#define ANSI_BGREEN  "\033[1;32m"
#define ANSI_BRED    "\033[1;31m"
#define ANSI_CYAN    "\033[36m"
#define ANSI_DIM     "\033[90m"

static int g_color;

static const char *col(const char *code)
{
    return g_color ? code : "";
}

/*
 * 콘솔이 ANSI 색을 받아 줄 때만 켠다.
 * 파일로 리다이렉트하면 GetConsoleMode 가 실패하므로 저절로 꺼진다.
 */
static void init_color(int want)
{
    g_color = 0;
    if (!want) return;
    if (want == 2) { g_color = 1; return; }      /* --color 는 무조건 켠다 */
    if (getenv("NO_COLOR") != NULL) return;

#ifdef _WIN32
    {
        HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
        DWORD mode = 0;

        if (h == NULL || h == INVALID_HANDLE_VALUE) return;
        if (!GetConsoleMode(h, &mode)) return;
        if (!SetConsoleMode(h, mode | 0x0004 /* VIRTUAL_TERMINAL_PROCESSING */)) {
            return;
        }
    }
#endif
    g_color = 1;
}

/* UTF-8 문자열의 대략적인 출력 폭 (한글/기호는 2칸) */
static int disp_width(const char *s)
{
    int w = 0;
    const unsigned char *p = (const unsigned char *)s;

    while (*p) {
        if (*p < 0x80)      { w += 1; p += 1; }
        else if (*p < 0xE0) { w += 1; p += 2; }
        else if (*p < 0xF0) { w += 2; p += 3; }
        else                { w += 2; p += 4; }
    }
    return w;
}

static void print_padded(const char *s, int width)
{
    int w = disp_width(s);
    fputs(s, stdout);
    while (w++ < width) fputc(' ', stdout);
}

static void section(const char *name)
{
    if (g_section_count >= MAX_SECTIONS) return;

    g_cur = &g_sections[g_section_count++];
    g_cur->name = name;
    g_cur->pass = 0;
    g_cur->fail = 0;
    if (!g_quiet) printf("\n%s[%s]%s\n", col(ANSI_CYAN), name, col(ANSI_RESET));
}

/* 항목 하나의 결과를 찍는다. ok 면 통과. */
static void report(const char *name, const char *seq,
                   const char *got, const char *want, int ok)
{
    if (ok) {
        g_pass++;
        if (g_cur) g_cur->pass++;
        if (g_quiet) return;
        printf("  %s[PASS]%s ", col(ANSI_GREEN), col(ANSI_RESET));
        print_padded(name, 18);
        print_padded(seq, 24);
        printf("-> %s\n", got);
        return;
    }

    g_fail++;
    if (g_cur) g_cur->fail++;
    if (g_quiet) {
        printf("%s[%s]%s\n", col(ANSI_CYAN),
               g_cur ? g_cur->name : "", col(ANSI_RESET));
    }
    printf("  %s[FAIL]%s ", col(ANSI_BRED), col(ANSI_RESET));
    print_padded(name, 18);
    print_padded(seq, 24);
    fputs("-> ", stdout);
    print_padded(got, 16);
    printf("%s기대: %s%s\n", col(ANSI_RED), want, col(ANSI_RESET));
}

/* 구역별 집계와 전체 결과 */
static void print_summary(void)
{
    static const char *const LINE =
        "========================================================";
    static const char *const THIN =
        "--------------------------------------------------------";
    int total = g_pass + g_fail;
    int i;

    printf("\n%s%s%s\n", col(ANSI_CYAN), LINE, col(ANSI_RESET));
    printf(" 시험 요약\n");
    printf("%s%s%s\n", col(ANSI_DIM), THIN, col(ANSI_RESET));

    for (i = 0; i < g_section_count; i++) {
        const SectionStat *s = &g_sections[i];
        int n = s->pass + s->fail;

        printf("  ");
        print_padded(s->name, 26);
        printf("%4d/%-4d  %s%s%s\n", s->pass, n,
               col(s->fail ? ANSI_RED : ANSI_GREEN),
               s->fail ? "FAIL" : "PASS",
               col(ANSI_RESET));
    }

    printf("%s%s%s\n", col(ANSI_DIM), THIN, col(ANSI_RESET));
    printf("  전체 시험 항목   %4d 개   (구역 %d 개)\n", total, g_section_count);
    printf("  통과             %s%4d 개%s   (%d%%)\n",
           col(ANSI_GREEN), g_pass, col(ANSI_RESET),
           total ? (g_pass * 100 / total) : 100);
    printf("  실패             %s%4d 개%s\n",
           col(g_fail ? ANSI_RED : ANSI_DIM), g_fail, col(ANSI_RESET));
    printf("%s%s%s\n", col(ANSI_DIM), THIN, col(ANSI_RESET));

    if (g_fail == 0) {
        printf("  결과   %s PASS %s   %d개 항목 모두 통과\n",
               col(ANSI_BGREEN), col(ANSI_RESET), total);
    } else {
        printf("  결과   %s FAIL %s   %d개 중 %d개 실패\n",
               col(ANSI_BRED), col(ANSI_RESET), total, g_fail);
    }
    printf("%s%s%s\n", col(ANSI_CYAN), LINE, col(ANSI_RESET));
}

static char *to_utf8(const wchar_t *w, char *out, size_t out_len)
{
    strncpy(out, wchar_to_utf8(w, wcslen(w)), out_len - 1);
    out[out_len - 1] = 0;
    return out;
}

/* ------------------------------------------------------------------ */
/* 키 시퀀스 실행                                                      */
/* ------------------------------------------------------------------ */

static void run_keys(ChunjiinState *st, const char *seq)
{
    const char *p;

    for (p = seq; *p; p++) {
        switch (*p) {
            case 'a': chunjiin_process_input(st, 10); break;
            case 'b': chunjiin_process_input(st, 11); break;
            case '_': chunjiin_space(st);             break;
            case '<': chunjiin_backspace(st);         break;
            case '|': chunjiin_break_multitap(st);    break;
            case '!': chunjiin_commit(st);            break;
            case '~': chunjiin_clear(st);             break;
            case '/': chunjiin_insert_char(st, L'\n'); break;
            case '[': chunjiin_move_cursor(st, -1);   break;
            case ']': chunjiin_move_cursor(st, 1);    break;
            case '{': chunjiin_set_cursor(st, 0);     break;
            case '}': chunjiin_set_cursor(st, (int)wcslen(st->text_buffer)); break;
            case 'H': chunjiin_set_mode(st, MODE_HANGUL);        break;
            case 'E': chunjiin_set_mode(st, MODE_ENGLISH);       break;
            case 'U': chunjiin_set_mode(st, MODE_UPPER_ENGLISH); break;
            case 'N': chunjiin_set_mode(st, MODE_NUMBER);        break;
            case 'S': chunjiin_set_mode(st, MODE_SPECIAL);       break;
            case 'M': chunjiin_cycle_mode(st);        break;
            default:
                if (*p >= '0' && *p <= '9') chunjiin_process_input(st, *p - '0');
                break;
        }
    }
}

/* 시퀀스를 돌리고 조합을 확정한 뒤 버퍼를 비교한다. */
static void expect(const char *name, const char *seq, const wchar_t *want)
{
    ChunjiinState st;
    char got8[512], want8[512];

    chunjiin_reset(&st);
    run_keys(&st, seq);
    chunjiin_commit(&st);

    to_utf8(st.text_buffer, got8, sizeof(got8));
    to_utf8(want, want8, sizeof(want8));
    report(name, seq, got8, want8, strcmp(got8, want8) == 0);
}

/* 확정하지 않고, 조합 중인 모습 그대로 비교한다. */
static void expect_live(const char *name, const char *seq, const wchar_t *want)
{
    ChunjiinState st;
    char got8[512], want8[512];

    chunjiin_reset(&st);
    run_keys(&st, seq);

    to_utf8(st.text_buffer, got8, sizeof(got8));
    to_utf8(want, want8, sizeof(want8));
    report(name, seq, got8, want8, strcmp(got8, want8) == 0);
}

/* 커서 위치까지 확인한다. */
static void expect_cursor(const char *name, const char *seq,
                          const wchar_t *want, int want_cursor)
{
    ChunjiinState st;
    char got8[512], want8[512], gotd[560], wantd[560];

    chunjiin_reset(&st);
    run_keys(&st, seq);

    to_utf8(st.text_buffer, got8, sizeof(got8));
    to_utf8(want, want8, sizeof(want8));
    sprintf(gotd,  "%s @%d", got8,  st.cursor_pos);
    sprintf(wantd, "%s @%d", want8, want_cursor);
    report(name, seq, gotd, wantd, strcmp(gotd, wantd) == 0);
}

/* 상태 표시줄에 나오는 조합 문자열을 확인한다. */
static void expect_comp(const char *name, const char *seq, const wchar_t *want)
{
    ChunjiinState st;
    wchar_t comp[64];
    char got8[256], want8[256];

    chunjiin_reset(&st);
    run_keys(&st, seq);
    chunjiin_composition_text(&st, comp, 64);

    to_utf8(comp, got8, sizeof(got8));
    to_utf8(want, want8, sizeof(want8));
    report(name, seq, got8, want8, strcmp(got8, want8) == 0);
}

/* 모드 이름을 확인한다. */
static void expect_mode(const char *name, const char *seq, const wchar_t *want)
{
    ChunjiinState st;
    char got8[128], want8[128];

    chunjiin_reset(&st);
    run_keys(&st, seq);

    to_utf8(chunjiin_mode_name(&st), got8, sizeof(got8));
    to_utf8(want, want8, sizeof(want8));
    report(name, seq, got8, want8, strcmp(got8, want8) == 0);
}

/*
 * 버튼에 적힌 글자와 실제로 들어가는 글자가 맞는지 확인한다.
 * 키를 한 번 눌렀을 때 나오는 문자는 라벨의 첫 글자여야 한다.
 * (영문 배열을 바꿨을 때 라벨만 그대로 남는 실수를 막는다)
 */
static void check_labels(InputMode mode, const char *mode_seq, const char *name)
{
    int key;

    for (key = 0; key < KEY_COUNT; key++) {
        ChunjiinState st;
        const wchar_t *label;
        wchar_t want[2];
        char got8[64], want8[64], caption[64];

        chunjiin_reset(&st);
        run_keys(&st, mode_seq);
        label = chunjiin_key_label(&st, key);
        chunjiin_process_input(&st, key);
        chunjiin_commit(&st);

        want[0] = label[0];
        want[1] = 0;

        to_utf8(st.text_buffer, got8, sizeof(got8));
        to_utf8(want, want8, sizeof(want8));
        sprintf(caption, "%s 키%d", name, key);
        report(caption, mode_seq, got8, want8, strcmp(got8, want8) == 0);
    }
    (void)mode;
}

/* ------------------------------------------------------------------ */
/* 표로 도는 시험들                                                    */
/* ------------------------------------------------------------------ */

/*
 * 모음 전이표 전수 확인.
 * 어떤 모음 상태에서 ㅣ / · / ㅡ 를 눌렀을 때 나와야 하는 결과를
 * 오토마타와 따로 적어 두고 비교한다. 이어질 수 없는 조합이면
 * 앞 글자를 확정하고 새 모음이 시작되므로 두 글자가 된다.
 */
typedef struct {
    const char    *name;
    const char    *seq;      /* 그 모음까지 가는 키 */
    const wchar_t *by_i;     /* + ㅣ */
    const wchar_t *by_dot;   /* + · */
    const wchar_t *by_eu;    /* + ㅡ */
} VowelStep;

static const VowelStep VOWEL_STEPS[] = {
    { "빈칸", "",       L"ㅣ",   L"·",    L"ㅡ"   },
    { "·",   "1",      L"ㅓ",   L"‥",    L"ㅗ"   },
    { "‥",   "11",     L"ㅕ",   L"·",    L"ㅛ"   },
    { "ㅣ",  "0",      L"ㅣㅣ", L"ㅏ",   L"ㅣㅡ" },
    { "ㅡ",  "2",      L"ㅢ",   L"ㅜ",   L"ㅡㅡ" },
    { "ㅏ",  "01",     L"ㅐ",   L"ㅑ",   L"ㅏㅡ" },
    { "ㅑ",  "011",    L"ㅒ",   L"ㅏ",   L"ㅑㅡ" },
    { "ㅓ",  "10",     L"ㅔ",   L"ㅕ",   L"ㅓㅡ" },
    { "ㅕ",  "110",    L"ㅖ",   L"ㅓ",   L"ㅕㅡ" },
    { "ㅗ",  "12",     L"ㅚ",   L"ㅛ",   L"ㅗㅡ" },
    { "ㅛ",  "112",    L"ㅛㅣ", L"ㅗ",   L"ㅛㅡ" },
    { "ㅜ",  "21",     L"ㅟ",   L"ㅠ",   L"ㅜㅡ" },
    { "ㅠ",  "211",    L"ㅝ",   L"ㅜ",   L"ㅠㅡ" },
    { "ㅚ",  "120",    L"ㅚㅣ", L"ㅘ",   L"ㅚㅡ" },
    { "ㅘ",  "1201",   L"ㅙ",   L"ㅘ·",  L"ㅘㅡ" },
    { "ㅝ",  "2110",   L"ㅞ",   L"ㅝ·",  L"ㅝㅡ" },
    { "ㅐ",  "010",    L"ㅐㅣ", L"ㅐ·",  L"ㅐㅡ" },
    { "ㅒ",  "0110",   L"ㅒㅣ", L"ㅒ·",  L"ㅒㅡ" },
    { "ㅔ",  "100",    L"ㅔㅣ", L"ㅔ·",  L"ㅔㅡ" },
    { "ㅖ",  "1100",   L"ㅖㅣ", L"ㅖ·",  L"ㅖㅡ" },
    { "ㅙ",  "12010",  L"ㅙㅣ", L"ㅙ·",  L"ㅙㅡ" },
    { "ㅞ",  "21100",  L"ㅞㅣ", L"ㅞ·",  L"ㅞㅡ" },
    { "ㅟ",  "210",    L"ㅟㅣ", L"ㅟ·",  L"ㅟㅡ" },
    { "ㅢ",  "20",     L"ㅢㅣ", L"ㅢ·",  L"ㅢㅡ" }
};
#define VOWEL_STEP_COUNT ((int)(sizeof(VOWEL_STEPS) / sizeof(VOWEL_STEPS[0])))

static void test_vowel_table(void)
{
    static const char  KEYS[3]  = { '0', '1', '2' };
    static const char *MARKS[3] = { "+ㅣ", "+·", "+ㅡ" };
    int i, k;

    section("모음 전이표 전수");
    for (i = 0; i < VOWEL_STEP_COUNT; i++) {
        const VowelStep *v = &VOWEL_STEPS[i];
        const wchar_t *want[3];
        char seq[32], name[64];

        want[0] = v->by_i;
        want[1] = v->by_dot;
        want[2] = v->by_eu;

        for (k = 0; k < 3; k++) {
            sprintf(seq, "%s%c", v->seq, KEYS[k]);
            sprintf(name, "%s%s", v->name, MARKS[k]);
            expect(name, seq, want[k]);
        }
    }
}

/* 모음마다 백스페이스 한 번이 어디로 돌아가는지 */
static void test_vowel_backspace(void)
{
    static const struct {
        const char    *name;
        const char    *seq;
        const wchar_t *want;
    } BACK[] = {
        { "ㅣ<", "0<",      L""   }, { "ㅡ<", "2<",      L""   },
        { "·<",  "1<",      L""   }, { "‥<",  "11<",     L"·"  },
        { "ㅏ<", "01<",     L"ㅣ" }, { "ㅑ<", "011<",    L"ㅏ" },
        { "ㅐ<", "010<",    L"ㅏ" }, { "ㅒ<", "0110<",   L"ㅑ" },
        { "ㅓ<", "10<",     L"·"  }, { "ㅕ<", "110<",    L"ㅓ" },
        { "ㅔ<", "100<",    L"ㅓ" }, { "ㅖ<", "1100<",   L"ㅕ" },
        { "ㅗ<", "12<",     L"·"  }, { "ㅛ<", "112<",    L"ㅗ" },
        { "ㅚ<", "120<",    L"ㅗ" }, { "ㅘ<", "1201<",   L"ㅚ" },
        { "ㅙ<", "12010<",  L"ㅘ" }, { "ㅜ<", "21<",     L"ㅡ" },
        { "ㅠ<", "211<",    L"ㅜ" }, { "ㅟ<", "210<",    L"ㅜ" },
        { "ㅝ<", "2110<",   L"ㅠ" }, { "ㅞ<", "21100<",  L"ㅝ" },
        { "ㅢ<", "20<",     L"ㅡ" }
    };
    int i, n = (int)(sizeof(BACK) / sizeof(BACK[0]));

    section("모음 백스페이스");
    for (i = 0; i < n; i++) expect(BACK[i].name, BACK[i].seq, BACK[i].want);
}

/* 초성 ㄱ 에 모음 21개를 붙여 본다. get_unicode 의 중성 자리 계산 확인. */
static void test_syllable_matrix(void)
{
    static const struct {
        const char    *name;
        const char    *seq;
        const wchar_t *want;
    } CELLS[] = {
        { "가", "301",     L"가" }, { "개", "3010",    L"개" },
        { "갸", "3011",    L"갸" }, { "걔", "30110",   L"걔" },
        { "거", "310",     L"거" }, { "게", "3100",    L"게" },
        { "겨", "3110",    L"겨" }, { "계", "31100",   L"계" },
        { "고", "312",     L"고" }, { "과", "31201",   L"과" },
        { "괘", "312010",  L"괘" }, { "괴", "3120",    L"괴" },
        { "교", "3112",    L"교" }, { "구", "321",     L"구" },
        { "궈", "32110",   L"궈" }, { "궤", "321100",  L"궤" },
        { "귀", "3210",    L"귀" }, { "규", "3211",    L"규" },
        { "그", "32",      L"그" }, { "긔", "320",     L"긔" },
        { "기", "30",      L"기" }
    };
    int i, n = (int)(sizeof(CELLS) / sizeof(CELLS[0]));

    section("ㄱ + 모음 21자");
    for (i = 0; i < n; i++) expect(CELLS[i].name, CELLS[i].seq, CELLS[i].want);
}

/* 받침 16개가 모두 다음 글자로 넘어가는지 */
static void test_linking_all(void)
{
    static const struct {
        const char    *name;
        const char    *seq;
        const wchar_t *want;
    } LINK[] = {
        { "각+ㅏ", "301301",      L"가가" }, { "갂+ㅏ", "30133301",   L"가까" },
        { "간+ㅏ", "301401",      L"가나" }, { "갇+ㅏ", "301501",     L"가다" },
        { "갈+ㅏ", "3014401",     L"가라" }, { "감+ㅏ", "301aa01",    L"가마" },
        { "갑+ㅏ", "301601",      L"가바" }, { "갓+ㅏ", "301701",     L"가사" },
        { "갔+ㅏ", "30177701",    L"가싸" }, { "강+ㅏ", "301a01",     L"가아" },
        { "갖+ㅏ", "301801",      L"가자" }, { "갗+ㅏ", "3018801",    L"가차" },
        { "갘+ㅏ", "3013301",     L"가카" }, { "같+ㅏ", "3015501",    L"가타" },
        { "갚+ㅏ", "3016601",     L"가파" }, { "갛+ㅏ", "3017701",    L"가하" }
    };
    int i, n = (int)(sizeof(LINK) / sizeof(LINK[0]));

    section("홑받침 연음 전수");
    for (i = 0; i < n; i++) expect(LINK[i].name, LINK[i].seq, LINK[i].want);
}

/* 겹받침은 둘째 자음만 넘어간다 */
static void test_linking_double(void)
{
    static const struct {
        const char    *name;
        const char    *seq;
        const wchar_t *want;
    } LINK[] = {
        { "갃+ㅏ", "3013701",     L"각사" }, { "갅+ㅏ", "3014801",     L"간자" },
        { "갆+ㅏ", "30147701",    L"간하" }, { "갉+ㅏ", "30144301",    L"갈가" },
        { "갊+ㅏ", "30144aa01",   L"갈마" }, { "갋+ㅏ", "30144601",    L"갈바" },
        { "갌+ㅏ", "30144701",    L"갈사" }, { "갍+ㅏ", "301445501",   L"갈타" },
        { "갎+ㅏ", "301446601",   L"갈파" }, { "갏+ㅏ", "301447701",   L"갈하" },
        { "값+ㅏ", "3016701",     L"갑사" }
    };
    int i, n = (int)(sizeof(LINK) / sizeof(LINK[0]));

    section("겹받침 연음 전수");
    for (i = 0; i < n; i++) expect(LINK[i].name, LINK[i].seq, LINK[i].want);
}

/* 겹받침에서 백스페이스 한 번이면 홑받침으로 돌아온다 */
static void test_double_backspace(void)
{
    static const struct {
        const char    *name;
        const char    *seq;
        const wchar_t *want;
    } BACK[] = {
        { "갃<", "30137<",    L"각" }, { "갅<", "30148<",    L"간" },
        { "갆<", "301477<",   L"간" }, { "갉<", "301443<",   L"갈" },
        { "갊<", "30144aa<",  L"갈" }, { "갋<", "301446<",   L"갈" },
        { "갌<", "301447<",   L"갈" }, { "갍<", "3014455<",  L"갈" },
        { "갎<", "3014466<",  L"갈" }, { "갏<", "3014477<",  L"갈" },
        { "값<", "30167<",    L"갑" }
    };
    int i, n = (int)(sizeof(BACK) / sizeof(BACK[0]));

    section("겹받침 백스페이스");
    for (i = 0; i < n; i++) expect(BACK[i].name, BACK[i].seq, BACK[i].want);
}

/* ------------------------------------------------------------------ */
/* 원본 chunjiin.c 함수 직접 확인                                      */
/* ------------------------------------------------------------------ */

static void test_check_double(void)
{
    static const struct {
        const wchar_t *a, *b, *want;
    } PAIRS[] = {
        { L"ㄱ", L"ㅅ", L"ㄳ" }, { L"ㄴ", L"ㅈ", L"ㄵ" }, { L"ㄴ", L"ㅎ", L"ㄶ" },
        { L"ㄹ", L"ㄱ", L"ㄺ" }, { L"ㄹ", L"ㅁ", L"ㄻ" }, { L"ㄹ", L"ㅂ", L"ㄼ" },
        { L"ㄹ", L"ㅅ", L"ㄽ" }, { L"ㄹ", L"ㅌ", L"ㄾ" }, { L"ㄹ", L"ㅍ", L"ㄿ" },
        { L"ㄹ", L"ㅎ", L"ㅀ" }, { L"ㅂ", L"ㅅ", L"ㅄ" },
        { L"ㄱ", L"ㄱ", L""   }, { L"ㄴ", L"ㅅ", L""   }, { L"ㄹ", L"ㄴ", L""   },
        { L"ㅁ", L"ㅅ", L""   }, { L"ㅅ", L"ㅅ", L""   }, { L"ㅇ", L"ㄱ", L""   }
    };
    int i, n = (int)(sizeof(PAIRS) / sizeof(PAIRS[0]));

    section("check_double 원본");
    for (i = 0; i < n; i++) {
        wchar_t got[MAX_JAMO_LEN];
        char got8[32], want8[32], name[64], seq[64];

        check_double(PAIRS[i].a, PAIRS[i].b, got);
        to_utf8(got, got8, sizeof(got8));
        to_utf8(PAIRS[i].want, want8, sizeof(want8));
        to_utf8(PAIRS[i].a, name, sizeof(name));
        to_utf8(PAIRS[i].b, seq, sizeof(seq));
        strcat(name, " + ");
        strcat(name, seq);
        report(name, want8[0] ? "겹받침" : "안 붙음",
               got8[0] ? got8 : "(없음)",
               want8[0] ? want8 : "(없음)",
               strcmp(got8, want8) == 0);
    }
}

static void test_wchar_to_utf8(void)
{
    static const struct {
        const char    *name;
        const wchar_t *src;
        size_t         max_len;
        const char    *want;
    } CASES[] = {
        { "빈 문자열", L"",        0,  ""        },
        { "ASCII",     L"A",       8,  "A"       },
        { "한 글자",   L"가",      8,  "가"      },
        { "여러 글자", L"가나다",  8,  "가나다"  },
        { "길이 제한", L"가나다",  2,  "가나"    },
        { "섞임",      L"a가1!",   8,  "a가1!"   },
        { "낱자",      L"ㄱㅏ",    8,  "ㄱㅏ"    }
    };
    int i, n = (int)(sizeof(CASES) / sizeof(CASES[0]));

    section("wchar_to_utf8 원본");
    for (i = 0; i < n; i++) {
        char got8[64];

        strncpy(got8, wchar_to_utf8(CASES[i].src, CASES[i].max_len), sizeof(got8) - 1);
        got8[sizeof(got8) - 1] = 0;
        report(CASES[i].name, "직접 호출",
               got8[0] ? got8 : "(빈칸)",
               CASES[i].want[0] ? CASES[i].want : "(빈칸)",
               strcmp(got8, CASES[i].want) == 0);
    }
}

static void test_get_unicode(void)
{
    struct { const char *name; const wchar_t *cho, *jung, *jong; int want; } CASES[] = {
        { "빈 상태",     L"",   L"",   L"", 0      },
        { "초성만 ㄱ",   L"ㄱ", L"",   L"", 0x3131 },
        { "초성만 ㅎ",   L"ㅎ", L"",   L"", 0x314E },
        { "중성만 ㅏ",   L"",   L"ㅏ", L"", 0x314F },
        { "중성만 ㅣ",   L"",   L"ㅣ", L"", 0x3163 },
        { "아래아 중간", L"ㄱ", L"·",  L"", 0x3131 },
        { "가",          L"ㄱ", L"ㅏ", L"",   0xAC00 },
        { "간",          L"ㄱ", L"ㅏ", L"ㄴ", 0xAC04 },
        { "힣",          L"ㅎ", L"ㅣ", L"ㅎ", 0xD7A3 }
    };
    int i, n = (int)(sizeof(CASES) / sizeof(CASES[0]));

    section("get_unicode 원본");
    for (i = 0; i < n; i++) {
        HangulState h;
        char got8[32], want8[32];
        int code;

        hangul_init(&h);
        wcscpy(h.chosung,  CASES[i].cho);
        wcscpy(h.jungsung, CASES[i].jung);
        wcscpy(h.jongsung, CASES[i].jong);
        code = get_unicode(&h, CASES[i].jong);

        sprintf(got8,  "U+%04X", code);
        sprintf(want8, "U+%04X", CASES[i].want);
        report(CASES[i].name, "직접 호출", got8, want8, code == CASES[i].want);
    }
}

/* ------------------------------------------------------------------ */
/* 시험 항목                                                           */
/* ------------------------------------------------------------------ */

static void test_vowels(void)
{
    section("모음 21자");
    expect("ㅏ", "01",     L"ㅏ");
    expect("ㅐ", "010",    L"ㅐ");
    expect("ㅑ", "011",    L"ㅑ");
    expect("ㅒ", "0110",   L"ㅒ");
    expect("ㅓ", "10",     L"ㅓ");
    expect("ㅔ", "100",    L"ㅔ");
    expect("ㅕ", "110",    L"ㅕ");
    expect("ㅖ", "1100",   L"ㅖ");
    expect("ㅗ", "12",     L"ㅗ");
    expect("ㅘ", "1201",   L"ㅘ");
    expect("ㅙ", "12010",  L"ㅙ");
    expect("ㅚ", "120",    L"ㅚ");
    expect("ㅛ", "112",    L"ㅛ");
    expect("ㅜ", "21",     L"ㅜ");
    expect("ㅝ", "2110",   L"ㅝ");
    expect("ㅞ", "21100",  L"ㅞ");
    expect("ㅟ", "210",    L"ㅟ");
    expect("ㅠ", "211",    L"ㅠ");
    expect("ㅡ", "2",      L"ㅡ");
    expect("ㅢ", "20",     L"ㅢ");
    expect("ㅣ", "0",      L"ㅣ");
}

static void test_vowel_cycles(void)
{
    section("모음 순환·경계");
    expect("ㅏㅑㅏ",   "0111",   L"ㅏ");     /* ㅣ·· 다음 · 는 되돌아온다 */
    expect("ㅓㅕㅓ",   "1101",   L"ㅓ");     /* ㅕ 다음 · 는 ㅓ 로 되돌아온다 */
    expect("ㅗㅛㅗ",   "1211",   L"ㅗ");     /* ㅗ ㅛ ㅗ */
    expect("ㅜㅠㅜ",   "2111",   L"ㅜ");
    expect("ㅛ뒤ㅡ",   "1122",   L"ㅛㅡ");   /* ㅛ 뒤 ㅡ 는 새 글자 */
    expect("ㅣㅣ",     "00",     L"ㅣㅣ");   /* ㅣ 뒤 ㅣ 는 새 글자 */
    expect("ㅡㅡ",     "22",     L"ㅡㅡ");
    expect("ㅐ뒤ㅣ",   "0100",   L"ㅐㅣ");
    expect("ㅢ뒤ㅣ",   "200",    L"ㅢㅣ");
    expect_live("아래아만", "1",   L"·");
    expect_live("아래아둘", "11",  L"‥");
    expect_live("아래아셋", "111", L"·");    /* · ‥ 다음은 다시 · */
    expect("매달린점",  "1",      L"·");     /* 확정해도 그대로 둔다 */
    expect("매달린점2", "31",     L"ㄱ·");
}

static void test_chosung(void)
{
    section("초성 19자");
    expect("가", "301",    L"가");
    expect("까", "33301",  L"까");
    expect("나", "401",    L"나");
    expect("다", "501",    L"다");
    expect("따", "55501",  L"따");
    expect("라", "4401",   L"라");
    expect("마", "aa01",   L"마");
    expect("바", "601",    L"바");
    expect("빠", "66601",  L"빠");
    expect("사", "701",    L"사");
    expect("싸", "77701",  L"싸");
    expect("아", "a01",    L"아");
    expect("자", "801",    L"자");
    expect("짜", "88801",  L"짜");
    expect("차", "8801",   L"차");
    expect("카", "3301",   L"카");
    expect("타", "5501",   L"타");
    expect("파", "6601",   L"파");
    expect("하", "7701",   L"하");
}

static void test_jongsung(void)
{
    section("홑받침 16자");
    expect("각", "3013",    L"각");
    expect("갂", "301333",  L"갂");
    expect("간", "3014",    L"간");
    expect("갇", "3015",    L"갇");
    expect("갈", "30144",   L"갈");
    expect("감", "301aa",   L"감");
    expect("갑", "3016",    L"갑");
    expect("갓", "3017",    L"갓");
    expect("갔", "301777",  L"갔");
    expect("강", "301a",    L"강");
    expect("갖", "3018",    L"갖");
    expect("갗", "30188",   L"갗");
    expect("갘", "30133",   L"갘");
    expect("같", "30155",   L"같");
    expect("갚", "30166",   L"갚");
    expect("갛", "30177",   L"갛");
}

static void test_double_jongsung(void)
{
    section("겹받침 11자");
    expect("ㄳ 갃", "30137",    L"갃");
    expect("ㄵ 갅", "30148",    L"갅");
    expect("ㄶ 갆", "301477",   L"갆");
    expect("ㄺ 갉", "301443",   L"갉");
    expect("ㄻ 갊", "30144aa",  L"갊");
    expect("ㄼ 갋", "301446",   L"갋");
    expect("ㄽ 갌", "301447",   L"갌");
    expect("ㄾ 갍", "3014455",  L"갍");
    expect("ㄿ 갎", "3014466",  L"갎");
    expect("ㅀ 갏", "3014477",  L"갏");
    expect("ㅄ 값", "30167",    L"값");
}

static void test_consonant_cycle(void)
{
    section("자음 순환");
    expect("ㄱㅋㄲ", "3|33|333",   L"ㄱㅋㄲ");
    expect("ㄴㄹ",   "4|44",       L"ㄴㄹ");
    expect("ㄷㅌㄸ", "5|55|555",   L"ㄷㅌㄸ");
    expect("ㅂㅍㅃ", "6|66|666",   L"ㅂㅍㅃ");
    expect("ㅅㅎㅆ", "7|77|777",   L"ㅅㅎㅆ");
    expect("ㅈㅊㅉ", "8|88|888",   L"ㅈㅊㅉ");
    expect("ㅇㅁ",   "a|aa",       L"ㅇㅁ");
    expect("한바퀴", "3333",       L"ㄱ");
    expect("두바퀴", "444",        L"ㄴ");
    expect("끊긴순환", "3|3",      L"ㄱㄱ");
}

static void test_jongsung_limits(void)
{
    section("받침 제한");
    expect("ㄸ받침불가", "301555",  L"갇");   /* ㄸ 는 건너뛴다 */
    expect("ㅃ받침불가", "301666",  L"갑");
    expect("ㅉ받침불가", "301888",  L"갖");
    expect("받침순환",   "30177",   L"갛");
    expect("초성없이",   "013",     L"ㅏㄱ"); /* 모음만 뒤 자음은 새 글자 */
    expect("초성없이2",  "13",      L"·ㄱ");  /* 매달린 아래아도 그대로 남는다 */
    expect("자음셋",     "3|4|5",   L"ㄱㄴㄷ");
}

static void test_linking(void)
{
    section("연음");
    expect("가나",     "301401",     L"가나");
    expect("악아",     "a013a01",    L"악아");
    expect("갑사",     "3016701",    L"갑사");   /* 겹받침에서 둘째만 넘어간다 */
    expect("없다",     "a1067|501",  L"없다");
    expect("발음",     "60144a2aa",  L"발음");
    expect("연음뒤받침", "3014014",   L"가난");
}

static void test_backspace(void)
{
    section("백스페이스");
    expect("가->기",   "301<",      L"기");
    expect("기->ㄱ",   "301<<",     L"ㄱ");
    expect("ㄱ->없음", "301<<<",    L"");
    expect("값->갑",   "30167<",    L"갑");
    expect("갑->가",   "30167<<",   L"가");
    expect("간->가",   "3014<",     L"가");
    expect_live("아래아", "311<",    L"ㄱ·");   /* ‥ -> · */
    expect("아래아0",  "1<",        L"");
    expect("확정뒤",   "301_<",     L"가");
    expect("두글자",   "301401<",   L"가니");   /* 조합 중인 ㅏ 만 되돌린다 */
    expect("빈버퍼",   "<<<",       L"");
    expect("ㅘ되돌림", "1201<",     L"ㅚ");
    expect("ㅙ되돌림", "12010<",    L"ㅘ");
}

static void test_dot_display(void)
{
    section("아래아 표시");
    expect_live("점1",     "1",     L"·");
    expect_live("점2",     "11",    L"‥");
    expect_live("ㄱ점1",   "31",    L"ㄱ·");
    expect_live("ㄱ점2",   "311",   L"ㄱ‥");
    expect_live("ㅇ점1",   "a1",    L"ㅇ·");
    expect_live("점뒤모음", "311<0", L"거");
    expect_live("점에서완성", "312", L"고");
    expect("점뒤자음",     "314",   L"ㄱ·ㄴ");
}

static void test_punctuation(void)
{
    section("문장부호 키");
    expect("마침표",   "9",       L".");
    expect("쉼표",     "99",      L",");
    expect("순환복귀", "999",     L".");
    expect("두마침표", "9|9",     L"..");
    expect("물음표",   "b",       L"?");
    expect("느낌표",   "bb",      L"!");
    expect("두물음표", "b|b",     L"??");
    expect("가.",      "3019",    L"가.");
    expect("가?",      "301b",    L"가?");
    expect("섞기",     "9|b",     L".?");
    expect("부호뒤한글", "9|301", L".가");
}

static void test_editing(void)
{
    section("편집·커서");
    expect("띄어쓰기",   "301_401",     L"가 나");
    expect("줄바꿈",     "301/401",     L"가\n나");
    expect("전체지우기", "301401~",     L"");
    expect("지운뒤입력", "301~401",     L"나");
    expect_cursor("커서끝",   "301401",      L"가나",   2);
    expect_cursor("커서왼쪽", "301401[",     L"가나",   1);
    expect_cursor("커서맨앞", "301401{",     L"가나",   0);
    expect_cursor("커서맨뒤", "301401{}",    L"가나",   2);
    expect_cursor("커서한계", "301[[[[",     L"가",     0);
    expect("중간삽입",   "301401[701",  L"가사나");
    expect("맨앞삽입",   "301401{701",  L"사가나");
    expect("확정반복",   "301!!!",      L"가");
}

static void test_modes(void)
{
    section("모드 전환");
    expect_mode("기본",     "",      L"한글");
    expect_mode("영소",     "E",     L"영문 abc");
    expect_mode("영대",     "U",     L"영문 ABC");
    expect_mode("숫자",     "N",     L"숫자 123");
    expect_mode("기호",     "S",     L"기호 !@#");
    expect_mode("순환1",    "M",     L"영문 abc");
    expect_mode("순환5",    "MMMMM", L"한글");
    expect("모드전환확정", "301M",   L"가");
}

/* 알파벳 26자를 소문자 · 대문자로 모두 눌러 본다 */
static void test_english_alphabet(void)
{
    /* 키 0~8 에 세 글자씩. i 번째 키를 (j+1) 번 누르면 그 키의 j 번째 글자. */
    static const char *const SETS[9] = {
        "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz"
    };
    int key, i, upper;

    section("영문 26자 전수");
    for (upper = 0; upper < 2; upper++) {
        for (key = 0; key < 9; key++) {
            int n = (int)strlen(SETS[key]);

            for (i = 0; i < n; i++) {
                char seq[24], name[32];
                wchar_t want[2];
                int t;

                seq[0] = upper ? 'U' : 'E';
                for (t = 0; t <= i; t++) seq[1 + t] = (char)('0' + key);
                seq[1 + i + 1] = 0;

                want[0] = (wchar_t)(upper ? SETS[key][i] - 32 : SETS[key][i]);
                want[1] = 0;
                sprintf(name, "%c", (char)want[0]);
                expect(name, seq, want);
            }
        }
    }
}

static void test_english(void)
{
    section("영문 입력");
    expect("a",         "E0",       L"a");
    expect("b",         "E00",      L"b");
    expect("c",         "E000",     L"c");
    expect("순환복귀",  "E0000",    L"a");
    expect("adg",       "E012",     L"adg");
    expect("ab",        "E0|00",    L"ab");
    expect("pqr",       "E5|55|555", L"pqr");
    expect("stu",       "E6|66|666", L"stu");
    expect("vwx",       "E7|77|777", L"vwx");
    expect("yz",        "E8|88",    L"yz");
    expect("두글자키",  "E888",     L"y");     /* yz 는 두 개라 세 번이면 되돌아온다 */
    expect("hello",     "E22|11|333|333|444", L"hello");
    expect("world",     "E77|444|555|333|1",  L"world");
    expect("대문자A",   "U0",       L"A");
    expect("대문자ABC", "U0|00|000", L"ABC");
    expect("대문자Z",   "U88",      L"Z");
    expect("한영섞기",  "301E0",    L"가a");
}

static void test_english_symbols(void)
{
    section("영문 기호 3키");
    expect("마침표",     "E9",        L".");
    expect("쉼표",       "E99",       L",");
    expect("물음표",     "E999",      L"?");
    expect("순환복귀",   "E9999",     L".");
    expect("느낌표",     "Ea",        L"!");
    expect("작은따옴표", "Eaa",       L"'");
    expect("큰따옴표",   "Eaaa",      L"\"");
    expect("하이픈",     "Eb",        L"-");
    expect("콜론",       "Ebb",       L":");
    expect("앳",         "Ebbb",      L"@");
    expect("기호 첫자",  "E9|a|b",    L".!-");
    expect("대문자기호", "Ua|Ub",     L"!-");  /* 기호는 대문자 모드에서도 같다 */
    expect("문장",       "E6|66 E9",  L"st.");
}

static void test_number_special(void)
{
    section("숫자·기호 입력");
    expect("1",        "N0",           L"1");
    expect("123",      "N012",         L"123");
    expect("숫자전체", "N0123456789ab", L"123456789*0#");
    expect("숫자연타", "N00",          L"11");
    expect("기호 첫자", "S0123456789ab", L".?'-+/([{<@※");
    expect("기호 연타",  "S00",           L",");
    expect("기호 세번",  "S000",          L":");
    expect("기호 순환",  "S0000",         L".");
    expect("기호 둘",    "S0|0",          L"..");
    expect("괄호",      "S6|66",         L"()");
    expect("역슬래시",  "S55",           L"\\");
    expect("원화",      "Sa|aa|aaa",     L"@$₩");
    expect("특수기호",  "Sb|bb|bbb",     L"※…・");
    expect("한글뒤숫자", "301N0",      L"가1");
}

static void test_labels(void)
{
    section("라벨-입력 일치");
    check_labels(MODE_HANGUL,        "H", "한글");
    check_labels(MODE_ENGLISH,       "E", "영소");
    check_labels(MODE_UPPER_ENGLISH, "U", "영대");
    check_labels(MODE_NUMBER,        "N", "숫자");
    check_labels(MODE_SPECIAL,       "S", "기호");
}

static void test_composition_text(void)
{
    section("조합 상태 표시");
    expect_comp("빈상태",   "",       L"");
    expect_comp("초성만",   "3",      L"ㄱ + - + -");
    expect_comp("초중성",   "301",    L"ㄱ + ㅏ + -");
    expect_comp("받침",     "3014",   L"ㄱ + ㅏ + ㄴ");
    expect_comp("겹받침",   "30167",  L"ㄱ + ㅏ + ㅂㅅ");
    expect_comp("아래아",   "31",     L"ㄱ + · + -");
    expect_comp("중성만",   "01",     L"- + ㅏ + -");
    expect_comp("확정후",   "301!",   L"");
    expect_comp("영문",     "E0",     L"a");
}

static void test_edge_cases(void)
{
    section("경계·예외");
    {
        ChunjiinState st;
        int i, ok;
        char got8[64];

        /* 범위 밖 키는 무시된다 */
        chunjiin_reset(&st);
        chunjiin_process_input(&st, -1);
        chunjiin_process_input(&st, 12);
        chunjiin_process_input(&st, 99);
        to_utf8(st.text_buffer, got8, sizeof(got8));
        report("범위밖 키", "-1,12,99", got8, "", st.text_buffer[0] == 0);

        /* 버퍼가 가득 차도 넘치지 않는다 */
        chunjiin_reset(&st);
        for (i = 0; i < MAX_TEXT_LEN + 100; i++) {
            chunjiin_insert_char(&st, L'x');
        }
        ok = ((int)wcslen(st.text_buffer) == MAX_TEXT_LEN - 1) &&
             (st.cursor_pos <= MAX_TEXT_LEN - 1);
        sprintf(got8, "len=%d cur=%d", (int)wcslen(st.text_buffer), st.cursor_pos);
        report("버퍼 한계", "x * 4195", got8, "len=4095 cur<=4095", ok);

        /* 빈 상태에서 확정/백스페이스/커서이동을 해도 멀쩡하다 */
        chunjiin_reset(&st);
        chunjiin_commit(&st);
        chunjiin_backspace(&st);
        chunjiin_move_cursor(&st, -5);
        chunjiin_move_cursor(&st, 5);
        chunjiin_commit(&st);
        to_utf8(st.text_buffer, got8, sizeof(got8));
        report("빈 상태 조작", "commit/bs/move", got8, "",
               st.text_buffer[0] == 0 && st.cursor_pos == 0);

        /* reset 은 확장 필드까지 지운다 */
        chunjiin_reset(&st);
        run_keys(&st, "301477");
        chunjiin_reset(&st);
        ok = (st.text_buffer[0] == 0) && (st.cursor_pos == 0) &&
             (st.compose_len == 0) && (st.last_key == -1) &&
             (st.prev_mergeable == false);
        sprintf(got8, "%s", ok ? "clean" : "dirty");
        report("chunjiin_reset", "301477 + reset", got8, "clean", ok);
    }
}

/* 겹받침 되돌려 붙이기가 언제 살아 있고 언제 꺼지는지 */
static void test_merge_rules(void)
{
    section("겹받침 병합 규칙");
    expect("만+ㅅ+ㅅ=많",   "aa01477",     L"많");
    expect("병합뒤 백스",   "aa01477<",    L"만");
    expect("병합뒤 연음",   "aa0147701",   L"만하");
    expect("연타끊기면 안됨", "aa0147|7",  L"만ㅅㅅ");
    expect("모음오면 해제", "aa014701",    L"만사");
    expect("부호오면 해제", "aa01479",     L"만ㅅ.");
    expect("백스뒤 해제",   "aa0147<7",    L"만ㅅ");
    expect("커서옮기면 해제", "aa0147{7",  L"ㅅ만ㅅ");
    expect("겹받침엔 안붙음", "30167|7",  L"값ㅅ");   /* 이미 겹받침이면 새 글자 */
    expect("겹받침뒤 순환", "3016777",     L"값ㅎ");   /* 새로 난 ㅅ 이 순환한다 */
    expect("삶",           "70144aa",     L"삶");
    expect("옳",           "a124477",     L"옳");
    expect("핥",           "77014455",    L"핥");     /* ㄷ 이 ㅌ 으로 바뀌며 병합 */
    expect("핥+한번더",    "770144555",   L"핥ㄷ");   /* 더 누르면 새 글자 */
}

/* 편집 중 커서를 옮겨 가며 쓰는 경우 */
static void test_editing_more(void)
{
    section("편집 심화");
    expect("중간 백스",     "301401[<",     L"나");
    expect("맨앞 백스",     "301401{<",     L"가나");
    expect("조합중 커서이동", "301[01",     L"ㅏ가");
    expect("줄바꿈 둘",     "301//401",     L"가\n\n나");
    expect("공백 둘",       "301__401",     L"가  나");
    expect("맨뒤로 복귀",   "301401{701}301", L"사가나가");
    expect("커서앞뒤",      "301401[]301",  L"가나가");
    expect("지운뒤 커서",   "301401~701",   L"사");
    expect_cursor("조합중 커서", "301",     L"가",     1);
    expect_cursor("겹받침 커서", "30167",   L"값",     1);
    expect_cursor("아래아 커서", "31",      L"ㄱ·",    2);
    expect_cursor("공백 커서",   "301_",    L"가 ",    2);
    expect_cursor("줄바꿈 커서", "301/",    L"가\n",   2);
}

/* 모드를 오가며 이어 쓰는 경우 */
static void test_modes_more(void)
{
    section("모드 전환 심화");
    expect("영문뒤 한글",   "E00H301",   L"b가");
    expect("숫자뒤 한글",   "N012H301",  L"123가");
    expect("한글뒤 기호",   "301S0",     L"가.");
    expect("영소->영대",    "E0U0",      L"aA");
    expect("영대->영소",    "U0E0",      L"Aa");
    expect("영문 백스",     "E00<",      L"");
    expect("기호 백스",     "S00<",      L"");
    expect("숫자 백스",     "N012<",     L"12");
    expect("모드순환 입력", "MMMMM301",  L"가");
    expect("조합중 모드변경", "3M0",     L"ㄱa");   /* ㄱ 이 확정되고 영문 a */
    expect("영문중 공백",   "E0_0",      L"a a");
    expect("영문 줄바꿈",   "E0/0",      L"a\na");
}

/* 표시용 API 의 경계 */
static void test_display_api(void)
{
    section("표시 API 경계");
    {
        ChunjiinState st;
        wchar_t buf[8];
        char got8[64];
        const wchar_t *label;
        int ok, i;

        /* 범위 밖 키 라벨은 빈 문자열 */
        chunjiin_reset(&st);
        label = chunjiin_key_label(&st, -1);
        report("라벨 -1", "직접 호출", label[0] ? "값 있음" : "(빈칸)", "(빈칸)",
               label[0] == 0);
        label = chunjiin_key_label(&st, KEY_COUNT);
        report("라벨 12", "직접 호출", label[0] ? "값 있음" : "(빈칸)", "(빈칸)",
               label[0] == 0);

        /* 모든 모드의 12키 라벨은 비어 있으면 안 된다 */
        ok = 1;
        for (i = 0; i < MODE_COUNT; i++) {
            int k;
            chunjiin_reset(&st);
            chunjiin_set_mode(&st, (InputMode)i);
            for (k = 0; k < KEY_COUNT; k++) {
                if (chunjiin_key_label(&st, k)[0] == 0) ok = 0;
            }
        }
        report("라벨 빈칸 없음", "5모드 x 12키", ok ? "모두 있음" : "빈 라벨 있음",
               "모두 있음", ok);

        /* 조합 문자열이 짧은 버퍼에서도 넘치지 않는다 */
        chunjiin_reset(&st);
        run_keys(&st, "30167");
        buf[7] = L'#';
        chunjiin_composition_text(&st, buf, 7);
        ok = (buf[6] == 0) && (buf[7] == L'#');
        to_utf8(buf, got8, sizeof(got8));
        report("짧은 버퍼", "out_len=7", ok ? got8 : "넘침", "잘림 + 널종료", ok);

        /* out_len 0 이면 아무것도 쓰지 않는다 */
        buf[0] = L'#';
        chunjiin_composition_text(&st, buf, 0);
        report("버퍼 0", "out_len=0", buf[0] == L'#' ? "그대로" : "덮어씀",
               "그대로", buf[0] == L'#');

        /* NULL 을 줘도 죽지 않는다 */
        chunjiin_composition_text(&st, NULL, 16);
        report("NULL 버퍼", "out=NULL", "무사", "무사", 1);
    }
}

static void test_words(void)
{
    section("낱말·문장");
    expect("안녕",     "a014|4110a",             L"안녕");
    expect("한글",     "77014|32|44",            L"한글");
    expect("하세요",   "77017100|a112",          L"하세요");
    expect("닭",       "501443",                 L"닭");
    expect("꽃",       "3331288",                L"꽃");
    expect("많다",     "aa01477501",             L"많다");
    expect("않다",     "a01477501",              L"않다");
    expect("삶",       "70144aa",                L"삶");
    expect("핥다",     "77014455501",            L"핥다");
    expect("읊다",     "a244 66 66 5 01",        L"읊다");
    expect("옳다",     "a1244 77 5 01",          L"옳다");
    expect("좋아요",   "81277a01a112",           L"좋아요");
    expect("사랑해",   "7014401a77010",          L"사랑해");
    expect("컴퓨터",   "3310aa662115510",        L"컴퓨터");
    expect("띄어쓰기", "55520 a10 7772 30",      L"띄어쓰기");
    expect("맑음",     "aa01443|a2aa",           L"맑음");
    expect("안녕하세요", "a014|4110a77017100|a112", L"안녕하세요");
    expect("우리나라", "a21440 _ 4014401",       L"우리 나라");
    expect("가나다라", "301401 _ 5014401",       L"가나 다라");
    expect("반갑습니다", "6014301672640501",     L"반갑습니다");
    expect("감사합니다", "301aa7017701640501",   L"감사합니다");
    expect("한국어",   "770143213a10",           L"한국어");
    expect("밝다",     "601443501",              L"밝다");
    expect("앉다",     "a0148501",               L"앉다");
    expect("읽다",     "a0443501",               L"읽다");
    expect("읅",       "a2443",                  L"읅");   /* 읽 과 중성만 다르다 */
    expect("훑다",     "77214455501",            L"훑다");
    expect("맑음",     "aa01443|a2aa",           L"맑음");
}

/* ------------------------------------------------------------------ */

int main(int argc, char **argv)
{
    int i;

    int want_color = 1;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-q") == 0) g_quiet = 1;
        else if (strcmp(argv[i], "-v") == 0) g_quiet = 0;
        else if (strcmp(argv[i], "--no-color") == 0) want_color = 0;
        else if (strcmp(argv[i], "--color") == 0) want_color = 2;   /* 강제 */
        else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            printf("사용법: test_engine [-v|-q] [--no-color]\n"
                   "  (없음)      항목마다 PASS/FAIL 을 찍고 마지막에 요약한다\n"
                   "  -v          위와 같다 (명시적으로 자세히)\n"
                   "  -q          실패한 항목과 요약만 찍는다\n"
                   "  --no-color  색을 쓰지 않는다 (NO_COLOR 환경 변수도 같은 효과)\n");
            return 0;
        }
    }
    init_color(want_color);

    printf("천지인 오토마타 회귀 시험\n");

    test_vowels();
    test_vowel_table();
    test_vowel_backspace();
    test_syllable_matrix();
    test_vowel_cycles();
    test_chosung();
    test_jongsung();
    test_double_jongsung();
    test_consonant_cycle();
    test_jongsung_limits();
    test_linking();
    test_linking_all();
    test_linking_double();
    test_backspace();
    test_double_backspace();
    test_dot_display();
    test_punctuation();
    test_merge_rules();
    test_editing();
    test_editing_more();
    test_modes();
    test_modes_more();
    test_english_alphabet();
    test_english();
    test_english_symbols();
    test_number_special();
    test_labels();
    test_composition_text();
    test_display_api();
    test_check_double();
    test_wchar_to_utf8();
    test_get_unicode();
    test_edge_cases();
    test_words();

    print_summary();
    return g_fail == 0 ? 0 : 1;
}
