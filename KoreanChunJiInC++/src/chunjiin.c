#include <stddef.h>
#include <wchar.h>
#include <stdint.h>
#include "../include/chunjiin.h"
#include "../include/input.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

char* wchar_to_utf8(const wchar_t *wstr, size_t max_len) {
    if (wstr == NULL) {
        return "";
    }

    static char buffer[MAX_TEXT_LEN * 4];  // UTF-8 can use up to 4 bytes per character
    char *ptr = buffer;

    for (size_t i = 0; i < max_len && wstr[i] != 0; i++) {
        uint32_t uc = (uint32_t)wstr[i];

        if (uc < 0x80) {
            *ptr++ = (char)uc;
        } else if (uc < 0x800) {
            *ptr++ = (char)(0xC0 | (uc >> 6));
            *ptr++ = (char)(0x80 | (uc & 0x3F));
        } else if (uc < 0x10000) {
            *ptr++ = (char)(0xE0 | (uc >> 12));
            *ptr++ = (char)(0x80 | ((uc >> 6) & 0x3F));
            *ptr++ = (char)(0x80 | (uc & 0x3F));
        } else {
            *ptr++ = (char)(0xF0 | (uc >> 18));
            *ptr++ = (char)(0x80 | ((uc >> 12) & 0x3F));
            *ptr++ = (char)(0x80 | ((uc >> 6) & 0x3F));
            *ptr++ = (char)(0x80 | (uc & 0x3F));
        }
    }
    *ptr = '\0';
    return buffer;
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void chunjiin_init(ChunjiinState *state) {
    hangul_init(&state->hangul);
    state->now_mode = MODE_HANGUL;
    init_engnum(state);
    memset(state->text_buffer, 0, sizeof(state->text_buffer));
    state->cursor_pos = 0;
    CLAMP_CURSOR(state);
}

void hangul_init(HangulState *hangul) {
    memset(hangul->chosung, 0, sizeof(hangul->chosung));
    memset(hangul->jungsung, 0, sizeof(hangul->jungsung));
    memset(hangul->jongsung, 0, sizeof(hangul->jongsung));
    memset(hangul->jongsung2, 0, sizeof(hangul->jongsung2));
    hangul->step = 0;
    hangul->flag_writing = false;
    hangul->flag_dotused = false;
    hangul->flag_doubled = false;
    hangul->flag_addcursor = false;
    hangul->flag_space = false;
}

void init_engnum(ChunjiinState *state) {
    memset(state->engnum, 0, sizeof(state->engnum));
    state->flag_initengnum = false;
    state->flag_engdelete = false;
}

// ============================================================================
// INPUT PROCESSING FUNCTIONS
// ============================================================================

void chunjiin_process_input(ChunjiinState *state, int input) {
    if (input < 0 || input > 11) return;

    if (state->now_mode == MODE_HANGUL) {
        hangul_make(state, input);
        write_hangul(state);
    } else if (state->now_mode == MODE_ENGLISH || state->now_mode == MODE_UPPER_ENGLISH) {
        eng_make(state, input);
        write_engnum(state);
    } else if (state->now_mode == MODE_NUMBER) {
        num_make(state, input);
        write_engnum(state);
    } else { // MODE_SPECIAL
        special_make(state, input);
        write_engnum(state);
    }
}

// ============================================================================
// TEXT OPERATIONS
// ============================================================================

void delete_char(ChunjiinState *state) {
    if (state->cursor_pos <= 0) return;

    int i;
    for (i = state->cursor_pos - 1; i < MAX_TEXT_LEN - 1; i++) {
        state->text_buffer[i] = state->text_buffer[i + 1];
    }
    state->cursor_pos--;
    CLAMP_CURSOR(state);
}

// ============================================================================
// UNICODE & HANGUL PROCESSING
// ============================================================================

int get_unicode(HangulState *hangul, const wchar_t *real_jong) {
    // Compatibility Jamo arrays for standalone display
    static const int compat_cho[] = {
        0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142,
        0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314A, 0x314B,
        0x314C, 0x314D, 0x314E
    };
    static const int compat_jung[] = {
        0x314F, 0x3150, 0x3151, 0x3152, 0x3153, 0x3154, 0x3155, 0x3156,
        0x3157, 0x3158, 0x3159, 0x315A, 0x315B, 0x315C, 0x315D, 0x315E,
        0x315F, 0x3160, 0x3161, 0x3162, 0x3163
    };
    static const int compat_jong[] = {
        0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139,
        0x313A, 0x313B, 0x313C, 0x313D, 0x313E, 0x313F, 0x3140, 0x3141, 0x3142,
        0x3144, 0x3145, 0x3146, 0x3147, 0x3148, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E
    };
    
    int cho, jung, jong;

    // 초성이 없고 중성도 없거나 점만 있으면
    if (wcslen(hangul->chosung) == 0) {
        if (wcslen(hangul->jungsung) == 0 ||
            wcscmp(hangul->jungsung, L"·") == 0 ||
            wcscmp(hangul->jungsung, L"‥") == 0) {
            return 0;
        }
    }

    // 초성 처리
    if (wcscmp(hangul->chosung, L"ㄱ") == 0) cho = 0;
    else if (wcscmp(hangul->chosung, L"ㄲ") == 0) cho = 1;
    else if (wcscmp(hangul->chosung, L"ㄴ") == 0) cho = 2;
    else if (wcscmp(hangul->chosung, L"ㄷ") == 0) cho = 3;
    else if (wcscmp(hangul->chosung, L"ㄸ") == 0) cho = 4;
    else if (wcscmp(hangul->chosung, L"ㄹ") == 0) cho = 5;
    else if (wcscmp(hangul->chosung, L"ㅁ") == 0) cho = 6;
    else if (wcscmp(hangul->chosung, L"ㅂ") == 0) cho = 7;
    else if (wcscmp(hangul->chosung, L"ㅃ") == 0) cho = 8;
    else if (wcscmp(hangul->chosung, L"ㅅ") == 0) cho = 9;
    else if (wcscmp(hangul->chosung, L"ㅆ") == 0) cho = 10;
    else if (wcscmp(hangul->chosung, L"ㅇ") == 0) cho = 11;
    else if (wcscmp(hangul->chosung, L"ㅈ") == 0) cho = 12;
    else if (wcscmp(hangul->chosung, L"ㅉ") == 0) cho = 13;
    else if (wcscmp(hangul->chosung, L"ㅊ") == 0) cho = 14;
    else if (wcscmp(hangul->chosung, L"ㅋ") == 0) cho = 15;
    else if (wcscmp(hangul->chosung, L"ㅌ") == 0) cho = 16;
    else if (wcscmp(hangul->chosung, L"ㅍ") == 0) cho = 17;
    else cho = 18; // ㅎ

    if (wcslen(hangul->jungsung) == 0 && wcslen(hangul->jongsung) == 0) {
        // Return compatibility Jamo for standalone display
        return compat_cho[cho];
    }
    if (wcscmp(hangul->jungsung, L"·") == 0 || wcscmp(hangul->jungsung, L"‥") == 0) {
        // Return compatibility Jamo for standalone display
        return compat_cho[cho];
    }

    // 중성 처리
    if (wcscmp(hangul->jungsung, L"ㅏ") == 0) jung = 0;
    else if (wcscmp(hangul->jungsung, L"ㅐ") == 0) jung = 1;
    else if (wcscmp(hangul->jungsung, L"ㅑ") == 0) jung = 2;
    else if (wcscmp(hangul->jungsung, L"ㅒ") == 0) jung = 3;
    else if (wcscmp(hangul->jungsung, L"ㅓ") == 0) jung = 4;
    else if (wcscmp(hangul->jungsung, L"ㅔ") == 0) jung = 5;
    else if (wcscmp(hangul->jungsung, L"ㅕ") == 0) jung = 6;
    else if (wcscmp(hangul->jungsung, L"ㅖ") == 0) jung = 7;
    else if (wcscmp(hangul->jungsung, L"ㅗ") == 0) jung = 8;
    else if (wcscmp(hangul->jungsung, L"ㅘ") == 0) jung = 9;
    else if (wcscmp(hangul->jungsung, L"ㅙ") == 0) jung = 10;
    else if (wcscmp(hangul->jungsung, L"ㅚ") == 0) jung = 11;
    else if (wcscmp(hangul->jungsung, L"ㅛ") == 0) jung = 12;
    else if (wcscmp(hangul->jungsung, L"ㅜ") == 0) jung = 13;
    else if (wcscmp(hangul->jungsung, L"ㅝ") == 0) jung = 14;
    else if (wcscmp(hangul->jungsung, L"ㅞ") == 0) jung = 15;
    else if (wcscmp(hangul->jungsung, L"ㅟ") == 0) jung = 16;
    else if (wcscmp(hangul->jungsung, L"ㅠ") == 0) jung = 17;
    else if (wcscmp(hangul->jungsung, L"ㅡ") == 0) jung = 18;
    else if (wcscmp(hangul->jungsung, L"ㅢ") == 0) jung = 19;
    else jung = 20; // ㅣ

    if (wcslen(hangul->chosung) == 0 && wcslen(hangul->jongsung) == 0) {
        // Return compatibility Jamo for standalone vowel display
        return compat_jung[jung];
    }

    // 종성 처리
    if (wcslen(real_jong) == 0) jong = 0;
    else if (wcscmp(real_jong, L"ㄱ") == 0) jong = 1;
    else if (wcscmp(real_jong, L"ㄲ") == 0) jong = 2;
    else if (wcscmp(real_jong, L"ㄳ") == 0) jong = 3;
    else if (wcscmp(real_jong, L"ㄴ") == 0) jong = 4;
    else if (wcscmp(real_jong, L"ㄵ") == 0) jong = 5;
    else if (wcscmp(real_jong, L"ㄶ") == 0) jong = 6;
    else if (wcscmp(real_jong, L"ㄷ") == 0) jong = 7;
    else if (wcscmp(real_jong, L"ㄹ") == 0) jong = 8;
    else if (wcscmp(real_jong, L"ㄺ") == 0) jong = 9;
    else if (wcscmp(real_jong, L"ㄻ") == 0) jong = 10;
    else if (wcscmp(real_jong, L"ㄼ") == 0) jong = 11;
    else if (wcscmp(real_jong, L"ㄽ") == 0) jong = 12;
    else if (wcscmp(real_jong, L"ㄾ") == 0) jong = 13;
    else if (wcscmp(real_jong, L"ㄿ") == 0) jong = 14;
    else if (wcscmp(real_jong, L"ㅀ") == 0) jong = 15;
    else if (wcscmp(real_jong, L"ㅁ") == 0) jong = 16;
    else if (wcscmp(real_jong, L"ㅂ") == 0) jong = 17;
    else if (wcscmp(real_jong, L"ㅄ") == 0) jong = 18;
    else if (wcscmp(real_jong, L"ㅅ") == 0) jong = 19;
    else if (wcscmp(real_jong, L"ㅆ") == 0) jong = 20;
    else if (wcscmp(real_jong, L"ㅇ") == 0) jong = 21;
    else if (wcscmp(real_jong, L"ㅈ") == 0) jong = 22;
    else if (wcscmp(real_jong, L"ㅊ") == 0) jong = 23;
    else if (wcscmp(real_jong, L"ㅋ") == 0) jong = 24;
    else if (wcscmp(real_jong, L"ㅌ") == 0) jong = 25;
    else if (wcscmp(real_jong, L"ㅍ") == 0) jong = 26;
    else jong = 27; // ㅎ

    if (wcslen(hangul->chosung) == 0 && wcslen(hangul->jungsung) == 0) {
        // Return compatibility Jamo for standalone final consonant display
        return compat_jong[jong];
    }

    return 44032 + cho * 588 + jung * 28 + jong;
}

void check_double(const wchar_t *jong, const wchar_t *jong2, wchar_t *result) {
    result[0] = 0;

    if (wcscmp(jong, L"ㄱ") == 0) {
        if (wcscmp(jong2, L"ㅅ") == 0) wcscpy(result, L"ㄳ");
    } else if (wcscmp(jong, L"ㄴ") == 0) {
        if (wcscmp(jong2, L"ㅈ") == 0) wcscpy(result, L"ㄵ");
        else if (wcscmp(jong2, L"ㅎ") == 0) wcscpy(result, L"ㄶ");
    } else if (wcscmp(jong, L"ㄹ") == 0) {
        if (wcscmp(jong2, L"ㄱ") == 0) wcscpy(result, L"ㄺ");
        else if (wcscmp(jong2, L"ㅁ") == 0) wcscpy(result, L"ㄻ");
        else if (wcscmp(jong2, L"ㅂ") == 0) wcscpy(result, L"ㄼ");
        else if (wcscmp(jong2, L"ㅅ") == 0) wcscpy(result, L"ㄽ");
        else if (wcscmp(jong2, L"ㅌ") == 0) wcscpy(result, L"ㄾ");
        else if (wcscmp(jong2, L"ㅍ") == 0) wcscpy(result, L"ㄿ");
        else if (wcscmp(jong2, L"ㅎ") == 0) wcscpy(result, L"ㅀ");
    } else if (wcscmp(jong, L"ㅂ") == 0) {
        if (wcscmp(jong2, L"ㅅ") == 0) wcscpy(result, L"ㅄ");
    }
}
