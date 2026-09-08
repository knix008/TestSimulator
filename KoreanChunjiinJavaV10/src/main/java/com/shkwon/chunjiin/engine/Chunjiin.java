/*
 * Chunjiin.java - 천지인(千地人) 한글 입력 엔진 핵심
 *
 * KoreanChunJiInC++/src/chunjiin.c 와 include/chunjiin.h 를 그대로 옮긴 것이다.
 * 유니코드 음절 조합, 겹받침 판정, 상태 자료구조가 여기에 있다.
 *
 * C 의 wchar_t 버퍼는 자바 문자열(UTF-16 코드 단위)로 바꿨다.
 * 한글 음절·호환 자모는 모두 BMP 안에 있으므로 한 글자가 코드 단위 하나다.
 * 따라서 커서 위치 계산이 원본과 똑같이 맞아떨어진다.
 *
 * 이 클래스는 화면도 파일도 모른다. 그래서 GUI 없이 시험할 수 있고,
 * 창을 띄우는 쪽과 완전히 같은 조합 코드를 쓴다.
 */
package com.shkwon.chunjiin.engine;

import java.util.Arrays;
import java.util.List;

public final class Chunjiin {

    private Chunjiin() {
    }

    /* 편집 버퍼에 담을 수 있는 최대 문자 수(널 자리 포함) */
    public static final int MAX_TEXT_LEN = 4096;
    /* 키패드 키 개수 (0 ~ 11) */
    public static final int KEY_COUNT = 12;

    /* ------------------------------------------------------------------ */
    /* 상태 자료구조                                                       */
    /* ------------------------------------------------------------------ */

    /* init_engnum() */
    public static void initEngnum(ChunjiinState state) {
        state.engnum = "";
        state.flagInitengnum = false;
        state.flagEngdelete = false;
    }

    /* 커서를 유효 범위로 보정 (CLAMP_CURSOR 매크로) */
    public static void clampCursor(ChunjiinState state) {
        if (state.cursorPos < 0) state.cursorPos = 0;
        if (state.cursorPos > MAX_TEXT_LEN - 1) state.cursorPos = MAX_TEXT_LEN - 1;
    }

    /* chunjiin_init() */
    public static void init(ChunjiinState state) {
        state.hangul.init();
        state.nowMode = Mode.HANGUL;
        initEngnum(state);
        state.text.setLength(0);
        state.cursorPos = 0;
        clampCursor(state);
    }

    /* ------------------------------------------------------------------ */
    /* 도우미                                                              */
    /* ------------------------------------------------------------------ */

    /*
     * wchar_to_utf8() 의 대응물.
     * 자바 문자열은 이미 유니코드이므로 길이 제한만 그대로 흉내 낸다.
     */
    public static String wcharToUtf8(String str, int maxLen) {
        if (str == null) return "";
        if (maxLen <= 0) return "";
        return str.length() <= maxLen ? str : str.substring(0, maxLen);
    }

    /* delete_char() - 커서 앞 한 칸을 지운다. */
    public static void deleteChar(ChunjiinState state) {
        if (state.cursorPos <= 0) return;
        state.text.deleteCharAt(state.cursorPos - 1);
        state.cursorPos--;
        clampCursor(state);
    }

    /* ------------------------------------------------------------------ */
    /* 유니코드 조합                                                       */
    /* ------------------------------------------------------------------ */

    /* 낱자 홀로 보일 때 쓰는 호환 자모 */
    private static final int[] COMPAT_CHO = {
        0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142,
        0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b,
        0x314c, 0x314d, 0x314e,
    };
    private static final int[] COMPAT_JUNG = {
        0x314f, 0x3150, 0x3151, 0x3152, 0x3153, 0x3154, 0x3155, 0x3156,
        0x3157, 0x3158, 0x3159, 0x315a, 0x315b, 0x315c, 0x315d, 0x315e,
        0x315f, 0x3160, 0x3161, 0x3162, 0x3163,
    };
    private static final int[] COMPAT_JONG = {
        0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139,
        0x313a, 0x313b, 0x313c, 0x313d, 0x313e, 0x313f, 0x3140, 0x3141, 0x3142,
        0x3144, 0x3145, 0x3146, 0x3147, 0x3148, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e,
    };

    /*
     * 조합용 자모 순서표.
     * 원본은 if-else 사슬이라 목록에 없는 값이 마지막 항목으로 떨어진다.
     * indexOf 가 -1 이면 그 마지막 번호를 돌려주어 동작을 똑같이 맞춘다.
     */
    private static final List<String> CHO_ORDER = Arrays.asList(
        "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
        "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ");              /* 없으면 18 = ㅎ */
    private static final List<String> JUNG_ORDER = Arrays.asList(
        "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
        "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ");   /* 없으면 20 = ㅣ */
    private static final List<String> JONG_ORDER = Arrays.asList(
        "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ",
        "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ",
        "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ");                          /* 없으면 27 = ㅎ */

    /* 아직 모음이 되지 못한 아래아 중간 상태인가 */
    public static boolean isDotState(String jung) {
        return "·".equals(jung) || "‥".equals(jung);
    }

    /*
     * get_unicode() - 조합 상태를 화면에 그릴 코드 포인트 하나로 만든다.
     * 아직 글자가 되지 못했으면 0 을 돌려준다.
     */
    public static int getUnicode(HangulState hangul, String realJong) {
        String jong0 = realJong == null ? "" : realJong;

        /* 초성이 없고 중성도 없거나 점만 있으면 */
        if (hangul.chosung.isEmpty()) {
            if (hangul.jungsung.isEmpty() || isDotState(hangul.jungsung)) return 0;
        }

        /* 초성 처리 */
        int cho = CHO_ORDER.indexOf(hangul.chosung);
        if (cho < 0) cho = 18;   /* ㅎ */

        if (hangul.jungsung.isEmpty() && hangul.jongsung.isEmpty()) {
            return COMPAT_CHO[cho];
        }
        if (isDotState(hangul.jungsung)) {
            return COMPAT_CHO[cho];
        }

        /* 중성 처리 */
        int jung = JUNG_ORDER.indexOf(hangul.jungsung);
        if (jung < 0) jung = 20;  /* ㅣ */

        if (hangul.chosung.isEmpty() && hangul.jongsung.isEmpty()) {
            return COMPAT_JUNG[jung];
        }

        /* 종성 처리 */
        int jong;
        if (jong0.isEmpty()) {
            jong = 0;
        } else {
            int i = JONG_ORDER.indexOf(jong0);
            jong = i < 0 ? 27 : i + 1;   /* 0 번은 "받침 없음" 자리 */
        }

        if (hangul.chosung.isEmpty() && hangul.jungsung.isEmpty()) {
            return COMPAT_JONG[jong];
        }

        return 44032 + cho * 588 + jung * 28 + jong;
    }

    /*
     * check_double() - 두 자음이 겹받침을 이루면 그 겹받침을, 아니면 "" 를 돌려준다.
     */
    public static String checkDouble(String jong, String jong2) {
        if ("ㄱ".equals(jong)) {
            if ("ㅅ".equals(jong2)) return "ㄳ";
        } else if ("ㄴ".equals(jong)) {
            if ("ㅈ".equals(jong2)) return "ㄵ";
            if ("ㅎ".equals(jong2)) return "ㄶ";
        } else if ("ㄹ".equals(jong)) {
            if ("ㄱ".equals(jong2)) return "ㄺ";
            if ("ㅁ".equals(jong2)) return "ㄻ";
            if ("ㅂ".equals(jong2)) return "ㄼ";
            if ("ㅅ".equals(jong2)) return "ㄽ";
            if ("ㅌ".equals(jong2)) return "ㄾ";
            if ("ㅍ".equals(jong2)) return "ㄿ";
            if ("ㅎ".equals(jong2)) return "ㅀ";
        } else if ("ㅂ".equals(jong)) {
            if ("ㅅ".equals(jong2)) return "ㅄ";
        }
        return "";
    }
}
