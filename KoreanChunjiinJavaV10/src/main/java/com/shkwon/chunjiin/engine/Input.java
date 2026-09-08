/*
 * Input.java - 천지인 입력 오토마타
 *
 * KoreanChunJiInC++/src/input.c 를 그대로 옮긴 것이다.
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
package com.shkwon.chunjiin.engine;

import static com.shkwon.chunjiin.engine.Chunjiin.KEY_COUNT;
import static com.shkwon.chunjiin.engine.Chunjiin.MAX_TEXT_LEN;
import static com.shkwon.chunjiin.engine.Chunjiin.checkDouble;
import static com.shkwon.chunjiin.engine.Chunjiin.clampCursor;
import static com.shkwon.chunjiin.engine.Chunjiin.deleteChar;
import static com.shkwon.chunjiin.engine.Chunjiin.getUnicode;
import static com.shkwon.chunjiin.engine.Chunjiin.initEngnum;
import static com.shkwon.chunjiin.engine.Chunjiin.isDotState;

import java.util.Arrays;
import java.util.List;

public final class Input {

    private Input() {
    }

    /* ------------------------------------------------------------------ */
    /* 키 정의                                                             */
    /* ------------------------------------------------------------------ */
    private static final int KEY_I = 0;       /* ㅣ */
    private static final int KEY_DOT = 1;     /* 아래아 */
    private static final int KEY_EU = 2;      /* ㅡ */
    private static final int KEY_PUNCT1 = 9;  /* . , */
    private static final int KEY_PUNCT2 = 11; /* ? ! */

    /* 자음 키의 순환 목록. 자음 키가 아니면 빈 배열. */
    private static final String[][] CONS_CYCLE = {
        {},                          /* 0  ㅣ */
        {},                          /* 1  아래아 */
        {},                          /* 2  ㅡ */
        {"ㄱ", "ㅋ", "ㄲ"},          /* 3  */
        {"ㄴ", "ㄹ"},                /* 4  */
        {"ㄷ", "ㅌ", "ㄸ"},          /* 5  */
        {"ㅂ", "ㅍ", "ㅃ"},          /* 6  */
        {"ㅅ", "ㅎ", "ㅆ"},          /* 7  */
        {"ㅈ", "ㅊ", "ㅉ"},          /* 8  */
        {},                          /* 9  . , */
        {"ㅇ", "ㅁ"},                /* 10 */
        {},                          /* 11 ? ! */
    };

    /*
     * 모음 전이표.
     * from 상태에서 ㅣ / 아래아 / ㅡ 키를 눌렀을 때의 다음 상태.
     * null 이면 그 조합은 없으므로 현재 음절을 확정하고 새 음절을 시작한다.
     * prev 는 백스페이스로 한 단계 되돌릴 때의 상태.
     */
    private static final String[][] VOWEL_RULES = {
        /* from   ㅣ      아래아  ㅡ      prev  */
        {"",     "ㅣ",   "·",    "ㅡ",   ""},
        {"·",    "ㅓ",   "‥",    "ㅗ",   ""},
        {"‥",    "ㅕ",   "·",    "ㅛ",   "·"},
        {"ㅣ",   null,   "ㅏ",   null,   ""},
        {"ㅡ",   "ㅢ",   "ㅜ",   null,   ""},
        {"ㅏ",   "ㅐ",   "ㅑ",   null,   "ㅣ"},
        {"ㅑ",   "ㅒ",   "ㅏ",   null,   "ㅏ"},
        {"ㅓ",   "ㅔ",   "ㅕ",   null,   "·"},
        {"ㅕ",   "ㅖ",   "ㅓ",   null,   "ㅓ"},
        {"ㅗ",   "ㅚ",   "ㅛ",   null,   "·"},
        {"ㅛ",   null,   "ㅗ",   null,   "ㅗ"},
        {"ㅜ",   "ㅟ",   "ㅠ",   null,   "ㅡ"},
        {"ㅠ",   "ㅝ",   "ㅜ",   null,   "ㅜ"},
        {"ㅚ",   null,   "ㅘ",   null,   "ㅗ"},
        {"ㅘ",   "ㅙ",   null,   null,   "ㅚ"},
        {"ㅝ",   "ㅞ",   null,   null,   "ㅠ"},
        {"ㅐ",   null,   null,   null,   "ㅏ"},
        {"ㅒ",   null,   null,   null,   "ㅑ"},
        {"ㅔ",   null,   null,   null,   "ㅓ"},
        {"ㅖ",   null,   null,   null,   "ㅕ"},
        {"ㅙ",   null,   null,   null,   "ㅘ"},
        {"ㅞ",   null,   null,   null,   "ㅝ"},
        {"ㅟ",   null,   null,   null,   "ㅜ"},
        {"ㅢ",   null,   null,   null,   "ㅡ"},
    };

    /* 받침으로 쓸 수 있는 자음 (ㄸ ㅃ ㅉ 은 불가) */
    private static final List<String> VALID_JONG = Arrays.asList(
        "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ",
        "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ");

    /* ------------------------------------------------------------------ */
    /* 작은 도우미들                                                       */
    /* ------------------------------------------------------------------ */

    private static boolean isEmpty(String s) {
        return s == null || s.isEmpty();
    }

    private static boolean isValidJong(String c) {
        return !isEmpty(c) && VALID_JONG.contains(c);
    }

    /* jong + c 가 겹받침을 이루는가 */
    private static boolean canCombineJong(String jong, String c) {
        return !checkDouble(jong, c).isEmpty();
    }

    private static String[] findVowelRule(String jung) {
        for (String[] r : VOWEL_RULES) {
            if (r[0].equals(jung)) return r;
        }
        return null;
    }

    /* 모음 전이. 불가능하면 null. */
    private static String vowelNext(String jung, int key) {
        String[] r = findVowelRule(jung);
        if (r == null) return null;
        if (key == KEY_I) return r[1];
        if (key == KEY_DOT) return r[2];
        if (key == KEY_EU) return r[3];
        return null;
    }

    private static String vowelPrev(String jung) {
        String[] r = findVowelRule(jung);
        return r == null ? "" : r[4];
    }

    private static int cycleLen(int key) {
        return CONS_CYCLE[key].length;
    }

    private static boolean isConsKey(int key) {
        return key >= 0 && key < KEY_COUNT && CONS_CYCLE[key].length > 0;
    }

    private static boolean isVowelKey(int key) {
        return key == KEY_I || key == KEY_DOT || key == KEY_EU;
    }

    /* 현재 조합에서 "마지막으로 채워진 자음 자리". 자음 자리가 아니면 null. */
    private static Slot consSlot(HangulState h) {
        switch (h.step) {
            case CHOSUNG: return Slot.CHOSUNG;
            case JONGSUNG: return Slot.JONGSUNG;
            case JONGSUNG2: return Slot.JONGSUNG2;
            default: return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* 텍스트 버퍼 조작                                                    */
    /* ------------------------------------------------------------------ */

    private static void textInsert(ChunjiinState state, char ch) {
        int len = state.text.length();

        if (len >= MAX_TEXT_LEN - 1) return;
        if (state.cursorPos > len) state.cursorPos = len;
        if (state.cursorPos < 0) state.cursorPos = 0;

        state.text.insert(state.cursorPos, ch);
        state.cursorPos++;
        clampCursor(state);
    }

    /* ------------------------------------------------------------------ */
    /* 화면 출력 - 조합 중인 글자는 cursorPos-1 자리에서 계속 갱신된다     */
    /* ------------------------------------------------------------------ */

    /*
     * 조합 중인 상태를 화면에 보여줄 문자열로 만든다. 최대 2칸.
     *
     * 아래아만 찍힌 중간 상태(·, ‥)에서는 getUnicode() 가 0 을 돌려주므로
     * 아무것도 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
     * "ㄱ·", "·", "‥" 처럼 눈에 보이게 만든다.
     */
    private static String composeDisplay(HangulState h) {
        StringBuilder out = new StringBuilder();

        if (isDotState(h.jungsung)) {
            if (!isEmpty(h.chosung)) {
                /* 초성 홀로일 때의 호환 자모를 얻기 위해 중성을 잠시 비운다 */
                String saved = h.jungsung;
                h.jungsung = "";
                int code = getUnicode(h, "");
                h.jungsung = saved;
                if (code != 0) out.append((char) code);
            }
            out.append(h.jungsung.charAt(0));   /* '·' 또는 '‥' */
            return out.toString();
        }

        String realJong = "";
        if (!isEmpty(h.jongsung2)) {
            realJong = checkDouble(h.jongsung, h.jongsung2);
            if (realJong.isEmpty()) realJong = h.jongsung;
        } else if (!isEmpty(h.jongsung)) {
            realJong = h.jongsung;
        }

        int code = getUnicode(h, realJong);
        if (code != 0) out.append((char) code);
        return out.toString();
    }

    /*
     * 조합 중인 글자를 화면에 반영한다.
     * 직전에 그려 둔 composeLen 칸을 지우고 새로 그린다.
     */
    public static void writeHangul(ChunjiinState state) {
        String shown = composeDisplay(state.hangul);

        while (state.composeLen > 0) {
            deleteChar(state);
            state.composeLen--;
        }
        for (int i = 0; i < shown.length(); i++) {
            int before = state.text.length();
            textInsert(state, shown.charAt(i));
            if (state.text.length() > before) state.composeLen++;
        }
        state.hangul.flagWriting = state.composeLen > 0;
    }

    public static void writeEngnum(ChunjiinState state) {
        if (state.engnum.isEmpty()) return;

        if (state.flagEngdelete && state.cursorPos > 0) {
            state.text.setCharAt(state.cursorPos - 1, state.engnum.charAt(0));
        } else {
            textInsert(state, state.engnum.charAt(0));
        }
        state.flagEngdelete = true;
        state.flagInitengnum = true;
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
    private static void commitAndStart(ChunjiinState state) {
        writeHangul(state);
        state.hangul.init();            /* flagWriting = false -> 다음 글자는 새로 삽입 */
        state.hangul.flagAddcursor = true;
        state.composeLen = 0;           /* 이미 찍힌 칸은 확정 글자가 된다 */
        state.prevMergeable = false;
        state.lastKey = -1;
        state.tapCount = 0;
    }

    public static void commit(ChunjiinState state) {
        if (state.nowMode == Mode.HANGUL) {
            if (state.hangul.flagWriting) writeHangul(state);
            state.hangul.init();
            state.composeLen = 0;
        } else {
            initEngnum(state);
        }
        state.prevMergeable = false;
        state.lastKey = -1;
        state.tapCount = 0;
    }

    /* ------------------------------------------------------------------ */
    /* 한글 오토마타                                                       */
    /* ------------------------------------------------------------------ */

    /*
     * 자음 c 를 새 음절의 초성으로 삼는다.
     * mergeable 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더 눌러
     * 겹받침이 되는 자음이 나오면 tryMergeJong() 이 도로 합친다.
     */
    private static void startWithChosung(ChunjiinState state, String c, int key, boolean mergeable) {
        HangulState previous = state.hangul.copy();

        commitAndStart(state);
        if (mergeable) {
            state.prevSyllable = previous;
            state.prevMergeable = true;
        }
        state.hangul.chosung = c;
        state.hangul.step = Slot.CHOSUNG;
        state.lastKey = key;
        state.tapCount = 0;
    }

    /*
     * 떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.
     * 성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는 writeHangul() 이
     * 두 칸을 지우고 합쳐진 한 글자를 그린다.
     */
    private static boolean tryMergeJong(ChunjiinState state, int key) {
        HangulState h = state.hangul;
        HangulState prev = state.prevSyllable;
        int n = cycleLen(key);

        if (h.step != Slot.CHOSUNG || !isEmpty(h.jungsung)) return false;
        if (isEmpty(prev.jongsung) || !isEmpty(prev.jongsung2)) return false;

        for (int i = 1; i <= n; i++) {
            int idx = (state.tapCount + i) % n;
            String cand = CONS_CYCLE[key][idx];

            if (!canCombineJong(prev.jongsung, cand)) continue;

            state.composeLen++;             /* 앞 칸(확정된 음절)도 다시 그린다 */
            state.hangul.copyFrom(prev);
            state.hangul.jongsung2 = cand;
            state.hangul.step = Slot.JONGSUNG2;
            state.hangul.flagWriting = true;
            state.tapCount = idx;
            return true;
        }
        return false;
    }

    /* 같은 자음 키 연타: 현재 자리에서 다음 후보로 순환한다. 성공하면 true. */
    private static boolean cycleConsonant(ChunjiinState state, int key) {
        HangulState h = state.hangul;
        Slot slot = consSlot(h);
        int n = cycleLen(key);

        if (slot == null || isEmpty(h.consAt(slot)) || n == 0) return false;

        /* 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다 */
        for (int i = 1; i <= n; i++) {
            int idx = (state.tapCount + i) % n;
            String cand = CONS_CYCLE[key][idx];

            if (n > 1 && cand.equals(h.consAt(slot))) continue;
            if (h.step == Slot.JONGSUNG && !isValidJong(cand)) continue;
            if (h.step == Slot.JONGSUNG2 && !canCombineJong(h.jongsung, cand)) continue;

            h.setConsAt(slot, cand);
            state.tapCount = idx;
            h.flagDoubled = idx == 2;       /* 순환 3번째 자리는 항상 된소리 */
            return true;
        }
        return false;
    }

    private static void hangulConsonant(ChunjiinState state, int key) {
        HangulState h = state.hangul;
        String c = CONS_CYCLE[key][0];
        boolean mergeable = state.prevMergeable;

        state.prevMergeable = false;

        if (state.lastKey == key) {
            if (mergeable && tryMergeJong(state, key)) return;
            if (cycleConsonant(state, key)) return;
        }

        if (isEmpty(h.chosung) && isEmpty(h.jungsung)) {
            /* 빈 음절 -> 초성 */
            h.chosung = c;
            h.step = Slot.CHOSUNG;
            state.lastKey = key;
            state.tapCount = 0;
            return;
        }

        if (isEmpty(h.jungsung) || isDotState(h.jungsung)) {
            /* 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절 */
            startWithChosung(state, c, key, false);
            return;
        }

        if (isEmpty(h.chosung)) {
            /* 모음만 있던 상태 -> 앞을 확정하고 새 음절 */
            startWithChosung(state, c, key, false);
            return;
        }

        if (isEmpty(h.jongsung)) {
            if (isValidJong(c)) {
                h.jongsung = c;
                h.step = Slot.JONGSUNG;
                state.lastKey = key;
                state.tapCount = 0;
            } else {
                startWithChosung(state, c, key, false);
            }
            return;
        }

        if (isEmpty(h.jongsung2) && canCombineJong(h.jongsung, c)) {
            h.jongsung2 = c;
            h.step = Slot.JONGSUNG2;
            state.lastKey = key;
            state.tapCount = 0;
            return;
        }

        /* 받침 뒤에 붙지 못한 자음 -> 새 음절. 겹받침으로 되돌아올 수 있게 기억해 둔다. */
        startWithChosung(state, c, key, isEmpty(h.jongsung2));
    }

    private static void hangulVowel(ChunjiinState state, int key) {
        HangulState h = state.hangul;

        state.prevMergeable = false;

        /* 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다 */
        if (!isEmpty(h.jongsung)) {
            String moved;

            if (!isEmpty(h.jongsung2)) {
                moved = h.jongsung2;
                h.jongsung2 = "";
            } else {
                moved = h.jongsung;
                h.jongsung = "";
            }

            commitAndStart(state);          /* 받침을 뺀 모습으로 앞 글자 확정 */
            h = state.hangul;
            h.chosung = moved;
            h.step = Slot.CHOSUNG;
        }

        String next = vowelNext(h.jungsung, key);
        if (next == null) {
            /* 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로 */
            commitAndStart(state);
            h = state.hangul;
            next = vowelNext("", key);
            if (next == null) return;
        }

        h.jungsung = next;
        h.step = Slot.JUNGSUNG;
        h.flagDotused = isDotState(next);
        state.lastKey = key;
        state.tapCount = 0;
    }

    /* 문장부호 키 (9 = ". ,", 11 = "? !"). 연타하면 순환한다. */
    private static final String[] PUNCT_SET = {".,", "?!"};

    private static void hangulPunct(ChunjiinState state, int key) {
        String set = PUNCT_SET[key == KEY_PUNCT2 ? 1 : 0];
        int n = set.length();
        int idx;

        state.prevMergeable = false;

        if (state.lastKey == key && !state.hangul.flagWriting && state.cursorPos > 0) {
            idx = (state.tapCount + 1) % n;
            state.text.setCharAt(state.cursorPos - 1, set.charAt(idx));
        } else {
            commitAndStart(state);              /* 조합 중인 글자를 확정하고 */
            idx = 0;
            textInsert(state, set.charAt(idx)); /* 부호를 새로 넣는다 */
        }
        state.lastKey = key;
        state.tapCount = idx;
    }

    public static void hangulMake(ChunjiinState state, int input) {
        if (input < 0 || input >= KEY_COUNT) return;

        state.hangul.flagSpace = false;
        state.hangul.flagAddcursor = false;

        if (isVowelKey(input)) {
            hangulVowel(state, input);
        } else if (isConsKey(input)) {
            hangulConsonant(state, input);
        } else if (input == KEY_PUNCT1 || input == KEY_PUNCT2) {
            hangulPunct(state, input);
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
    private static final String[] ENG_MAP = {
        "abc", "def", "ghi",
        "jkl", "mno", "pqr",
        "stu", "vwx", "yz",
        ".,?", "!'\"", "-:@",
    };

    /* 숫자는 키마다 하나씩. 순환하지 않는다. */
    private static final String NUM_MAP = "123456789*0#";

    /*
     * 기호 모드. 한 키에 세 개씩, 12키로 36개를 덮는다.
     * 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
     */
    private static final String[] SPECIAL_MAP = {
        ".,:", "?!;", "'\"`",
        "-_~", "+=*", "/\\|",
        "()&", "[]^", "{}%",
        "<>#", "@$₩", "※…・",
    };

    /* 휴대전화식 멀티탭. 같은 키를 연달아 누르면 목록을 돈다. */
    private static void multitapMake(ChunjiinState state, int input, String set, boolean toUpper) {
        int n = set.length();

        if (n == 0) return;

        if (state.lastKey == input && state.flagEngdelete) {
            state.tapCount = (state.tapCount + 1) % n;
        } else {
            state.tapCount = 0;
            state.flagEngdelete = false;   /* 새 문자로 삽입 */
        }

        char c = set.charAt(state.tapCount);
        if (toUpper && c >= 'a' && c <= 'z') c = Character.toUpperCase(c);
        state.engnum = String.valueOf(c);
        state.lastKey = input;
    }

    public static void engMake(ChunjiinState state, int input) {
        if (input < 0 || input >= KEY_COUNT) return;
        multitapMake(state, input, ENG_MAP[input], state.nowMode == Mode.UPPER_ENGLISH);
    }

    public static void specialMake(ChunjiinState state, int input) {
        if (input < 0 || input >= KEY_COUNT) return;
        multitapMake(state, input, SPECIAL_MAP[input], false);
    }

    public static void numMake(ChunjiinState state, int input) {
        if (input < 0 || input >= KEY_COUNT) return;
        state.engnum = String.valueOf(NUM_MAP.charAt(input));
        state.flagEngdelete = false;
        state.lastKey = -1;
        state.tapCount = 0;
    }

    /* ------------------------------------------------------------------ */
    /* 입력 진입점 (chunjiin_process_input)                                */
    /* ------------------------------------------------------------------ */

    public static void processInput(ChunjiinState state, int input) {
        if (input < 0 || input > 11) return;

        if (state.nowMode == Mode.HANGUL) {
            hangulMake(state, input);
            writeHangul(state);
        } else if (state.nowMode == Mode.ENGLISH || state.nowMode == Mode.UPPER_ENGLISH) {
            engMake(state, input);
            writeEngnum(state);
        } else if (state.nowMode == Mode.NUMBER) {
            numMake(state, input);
            writeEngnum(state);
        } else {
            specialMake(state, input);
            writeEngnum(state);
        }
    }

    /* ------------------------------------------------------------------ */
    /* 편집 API                                                            */
    /* ------------------------------------------------------------------ */

    /* 임의의 문자를 커서 위치에 그대로 넣는다(공백, 줄바꿈, 물리 키보드 직접 입력). */
    public static void insertChar(ChunjiinState state, char ch) {
        commit(state);
        textInsert(state, ch);
    }

    /* 공백 입력. 조합을 확정한 뒤 space 를 넣는다. */
    public static void space(ChunjiinState state) {
        insertChar(state, ' ');
        state.hangul.flagSpace = true;
    }

    /* 백스페이스. 조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다. */
    public static void backspace(ChunjiinState state) {
        HangulState h = state.hangul;

        if (state.nowMode == Mode.HANGUL && h.flagWriting) {
            if (!isEmpty(h.jongsung2)) {
                h.jongsung2 = "";
                h.step = Slot.JONGSUNG;
            } else if (!isEmpty(h.jongsung)) {
                h.jongsung = "";
                h.step = isEmpty(h.jungsung) ? Slot.CHOSUNG : Slot.JUNGSUNG;
            } else if (!isEmpty(h.jungsung)) {
                h.jungsung = vowelPrev(h.jungsung);
                h.step = isEmpty(h.jungsung)
                    ? (isEmpty(h.chosung) ? Slot.NONE : Slot.CHOSUNG)
                    : Slot.JUNGSUNG;
            } else if (!isEmpty(h.chosung)) {
                h.chosung = "";
                h.step = Slot.NONE;
            }

            writeHangul(state);

            if (isEmpty(h.chosung) && isEmpty(h.jungsung) && isEmpty(h.jongsung)) {
                state.hangul.init();
            }
            state.prevMergeable = false;
            state.lastKey = -1;
            state.tapCount = 0;
            return;
        }

        commit(state);
        deleteChar(state);
    }

    /* 커서 이동 (delta 만큼). 조합은 확정된다. */
    public static void moveCursor(ChunjiinState state, int delta) {
        commit(state);
        int len = state.text.length();
        state.cursorPos += delta;
        if (state.cursorPos < 0) state.cursorPos = 0;
        if (state.cursorPos > len) state.cursorPos = len;
        clampCursor(state);
    }

    /* 커서를 절대 위치로 옮긴다. 조합은 확정된다. */
    public static void setCursor(ChunjiinState state, int pos) {
        commit(state);
        int len = state.text.length();
        state.cursorPos = pos < 0 ? 0 : (Math.min(pos, len));
        clampCursor(state);
    }

    /* Chunjiin.init() 에 더해 확장 필드까지 초기화한다. 새 상태는 항상 이걸로 시작. */
    public static void reset(ChunjiinState state) {
        Chunjiin.init(state);
        state.lastKey = -1;
        state.tapCount = 0;
        state.composeLen = 0;
        state.prevMergeable = false;
        state.prevSyllable.init();
    }

    /* 전체 지우기 */
    public static void clear(ChunjiinState state) {
        Mode mode = state.nowMode;
        reset(state);
        state.nowMode = mode;
    }

    /* 입력 모드 변경. 조합은 확정된다. */
    public static void setMode(ChunjiinState state, Mode mode) {
        if (mode == null) return;
        commit(state);
        state.nowMode = mode;
        initEngnum(state);
        state.lastKey = -1;
        state.tapCount = 0;
    }

    public static void setMode(ChunjiinState state, int mode) {
        setMode(state, Mode.of(mode));
    }

    /* 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순환 */
    public static void cycleMode(ChunjiinState state) {
        setMode(state, Mode.of((state.nowMode.index() + 1) % Mode.COUNT));
    }

    /*
     * 연타 순환을 끊는다.
     * "안녕"처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은 키는
     * 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는 유지된다.
     */
    public static void breakMultitap(ChunjiinState state) {
        state.lastKey = -1;
        state.tapCount = 0;
        if (state.nowMode != Mode.HANGUL) state.flagEngdelete = false;
    }

    /* ------------------------------------------------------------------ */
    /* 표시용 문자열                                                       */
    /* ------------------------------------------------------------------ */

    private static final String[] LABEL_HANGUL = {
        "ㅣ", "·", "ㅡ",
        "ㄱㅋ", "ㄴㄹ", "ㄷㅌ",
        "ㅂㅍ", "ㅅㅎ", "ㅈㅊ",
        ". ,", "ㅇㅁ", "? !",
    };

    /* ENG_MAP 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번 */
    private static final String[] LABEL_LOWER = {
        "abc", "def", "ghi",
        "jkl", "mno", "pqr",
        "stu", "vwx", "yz",
        ". , ?", "! ' \"", "- : @",
    };

    private static final String[] LABEL_UPPER = {
        "ABC", "DEF", "GHI",
        "JKL", "MNO", "PQR",
        "STU", "VWX", "YZ",
        ". , ?", "! ' \"", "- : @",
    };

    private static final String[] LABEL_NUMBER = {
        "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#",
    };

    /* SPECIAL_MAP 과 같은 순서 */
    private static final String[] LABEL_SPECIAL = {
        ". , :", "? ! ;", "' \" `",
        "- _ ~", "+ = *", "/ \\ |",
        "( ) &", "[ ] ^", "{ } %",
        "< > #", "@ $ ₩", "※ … ・",
    };

    /* 현재 모드에서 키 인덱스(0~11)에 표시할 라벨. */
    public static String keyLabel(ChunjiinState state, int key) {
        if (key < 0 || key >= KEY_COUNT) return "";
        switch (state.nowMode) {
            case HANGUL: return LABEL_HANGUL[key];
            case ENGLISH: return LABEL_LOWER[key];
            case UPPER_ENGLISH: return LABEL_UPPER[key];
            case NUMBER: return LABEL_NUMBER[key];
            default: return LABEL_SPECIAL[key];
        }
    }

    /* 현재 모드 이름 ("한글", "영문 abc" ...) */
    public static String modeName(ChunjiinState state) {
        switch (state.nowMode) {
            case HANGUL: return "한글";
            case ENGLISH: return "영문 abc";
            case UPPER_ENGLISH: return "영문 ABC";
            case NUMBER: return "숫자 123";
            default: return "기호 !@#";
        }
    }

    /* 조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로 만든다(상태 표시줄용). */
    public static String compositionText(ChunjiinState state) {
        return compositionText(state, Integer.MAX_VALUE);
    }

    public static String compositionText(ChunjiinState state, int outLen) {
        HangulState h = state.hangul;

        if (outLen == 0) return "";

        if (state.nowMode != Mode.HANGUL) {
            if (!state.engnum.isEmpty() && state.flagEngdelete && outLen >= 2) {
                return state.engnum.substring(0, 1);
            }
            return "";
        }

        if (isEmpty(h.chosung) && isEmpty(h.jungsung) && isEmpty(h.jongsung)) return "";

        String line = (isEmpty(h.chosung) ? "-" : h.chosung) + " + "
            + (isEmpty(h.jungsung) ? "-" : h.jungsung) + " + "
            + (isEmpty(h.jongsung) ? "-" : h.jongsung) + (isEmpty(h.jongsung2) ? "" : h.jongsung2);

        if (outLen == Integer.MAX_VALUE) return line;
        return line.length() <= outLen - 1 ? line : line.substring(0, outLen - 1);
    }

    /* 새 상태를 만들어 초기화까지 마친다. */
    public static ChunjiinState createState() {
        ChunjiinState state = new ChunjiinState();
        reset(state);
        return state;
    }
}
