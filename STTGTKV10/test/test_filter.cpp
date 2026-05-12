/*
 * test_filter.cpp – unit test for the is_valid_korean_text filter
 *
 * Compile & run:
 *   g++ -std=c++17 test_filter.cpp -o test_filter && ./test_filter
 */

#include <cstdio>
#include <cstring>
#include <cctype>
#include <vector>
#include <string>

/* ── Copy of the production filter from stt_core.cpp ─────────────────── */

static bool has_hangul(const char *text) {
    for (const unsigned char *p = (const unsigned char *)text; *p; p++) {
        if (*p == 0xEA || *p == 0xEB || *p == 0xEC) return true;
        if (*p == 0xED && p[1] >= 0x80 && p[1] < 0xA0) return true;
    }
    return false;
}

static bool is_valid_korean_text(const char *text) {
    if (!text || text[0] == '\0') return false;
    if (text[0] == '[' || text[0] == '(') return false;

    bool has_content = false;
    for (const char *p = text; *p; p++) {
        if ((unsigned char)*p > 0x20) { has_content = true; break; }
    }
    if (!has_content) return false;

    if (has_hangul(text)) return true;
    for (const char *p = text; *p; p++) {
        if (isalnum((unsigned char)*p)) return true;
    }
    return false;
}

/* ── Test runner ─────────────────────────────────────────────────────── */

struct Case {
    const char *label;
    const char *text;      /* nullptr means use raw bytes */
    bool        expected;
};

int main() {
    /* Note: string literals are UTF-8 in GCC/Clang */
    static const Case CASES[] = {
        /* ── REJECT: silence / metadata markers ── */
        { "[음악]",             "[음악]",             false },
        { "[BLANK]",            "[BLANK]",            false },
        { "[blank]",            "[blank]",            false },
        { "[무음]",             "[무음]",             false },
        { "[박수]",             "[박수]",             false },
        { "[잡음]",             "[잡음]",             false },
        { "(박수)",             "(박수)",             false },
        { "(noise)",            "(noise)",            false },
        { "(music)",            "(music)",            false },
        /* ── REJECT: silence dots / ellipsis ── */
        { "...",                "...",                false },
        { "…..",                "…..",               false },
        { "…",        "\xe2\x80\xa6",                false }, /* U+2026 */
        /* ── REJECT: music notes ── */
        { "♪",         "\xe2\x99\xaa",              false }, /* U+266A */
        { "♫",         "\xe2\x99\xab",              false }, /* U+266B */
        { "♩",         "\xe2\x99\xa9",              false }, /* U+2669 */
        { "♬",         "\xe2\x99\xac",              false }, /* U+266C */
        /* ── REJECT: CJK/other lone punctuation ── */
        { "。",        "\xe3\x80\x82",              false }, /* CJK period */
        { "・",        "\xe3\x83\xbb",              false }, /* middle dot */
        /* ── REJECT: whitespace / empty ── */
        { "(empty)",           "",                   false },
        { "(spaces)",          "   ",                false },
        { "(tab)",             "\t",                 false },
        /* ── PASS: valid Korean ── */
        { "출근합니다.",        "출근합니다.",        true  },
        { "퇴근합니다.",        "퇴근합니다.",        true  },
        { "경비를 해제합니다.", "경비를 해제합니다.", true  },
        { "경비 설정입니다.",   "경비 설정입니다.",   true  },
        { "안녕하세요.",        "안녕하세요.",        true  },
        /* ── PASS: short single syllable ── */
        { "출",                 "출",                 true  },
        { "예",                 "예",                 true  },
        { "네",                 "네",                 true  },
        /* ── PASS: mixed Korean/number ── */
        { "3번 출구",           "3번 출구",           true  },
        { "1층 로비",           "1층 로비",           true  },
        /* ── PASS: mixed Korean/English ── */
        { "OK 확인",            "OK 확인",            true  },
        { "STT 시작",           "STT 시작",           true  },
        /* ── PASS: numbers alone (legitimate in context) ── */
        { "123",                "123",                true  },
        { "2024",               "2024",               true  },
    };

    int pass = 0, fail = 0;
    printf("\n");
    printf("  %-28s  %-8s  %-8s  %s\n", "입력", "기대", "결과", "판정");
    printf("  %s\n", std::string(65, '-').c_str());

    for (const auto &c : CASES) {
        bool got = is_valid_korean_text(c.text);
        bool ok  = (got == c.expected);
        if (ok) pass++; else fail++;

        const char *exp_s = c.expected ? "PASS" : "REJECT";
        const char *got_s = got        ? "PASS" : "REJECT";
        const char *mark  = ok         ? "✓"    : "✗ FAIL";

        printf("  %-28s  %-8s  %-8s  %s\n", c.label, exp_s, got_s, mark);
    }

    printf("  %s\n", std::string(65, '-').c_str());
    printf("  결과: %d 통과 / %d 실패 (전체 %d)\n\n",
           pass, fail, pass + fail);
    return (fail == 0) ? 0 : 1;
}
