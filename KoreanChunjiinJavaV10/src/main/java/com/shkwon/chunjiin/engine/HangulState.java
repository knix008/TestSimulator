/*
 * HangulState.java - 조합 중인 한 음절의 상태
 *
 * KoreanChunJiInC++/include/chunjiin.h 의 HANGUL 구조체를 그대로 옮긴 것이다.
 *
 * jungsung 에는 완성 모음뿐 아니라 중간 상태인 '·'(아래아 1개),
 * '‥'(아래아 2개) 도 들어간다. Chunjiin.getUnicode() 가 이 두 값을
 * "아직 모음이 아님"으로 취급한다.
 *
 * 낱자는 C 의 wchar_t 한 글자에 대응하지만, 비어 있음을 나타내야 하므로
 * 자바스크립트 판과 같이 문자열로 두었다. 빈 문자열이 "비어 있음"이다.
 */
package com.shkwon.chunjiin.engine;

public final class HangulState {
    public String chosung = "";
    public String jungsung = "";
    public String jongsung = "";
    public String jongsung2 = "";   /* 겹받침의 두 번째 자음 */

    public Slot step = Slot.NONE;   /* 마지막으로 채워진 자리 */
    public boolean flagWriting;     /* true 면 text[cursorPos-1] 이 조합 중인 글자 */
    public boolean flagDotused;     /* 아래아(·)로 시작한 모음인지 */
    public boolean flagDoubled;     /* 현재 자음이 쌍자음으로 바뀐 상태인지 */
    public boolean flagAddcursor;   /* 직전 입력에서 음절이 확정되었는지 */
    public boolean flagSpace;       /* 직전 입력이 공백이었는지 */

    /* hangul_init() */
    public void init() {
        chosung = "";
        jungsung = "";
        jongsung = "";
        jongsung2 = "";
        step = Slot.NONE;
        flagWriting = false;
        flagDotused = false;
        flagDoubled = false;
        flagAddcursor = false;
        flagSpace = false;
    }

    /* C 의 구조체 대입(값 복사)에 해당한다. */
    public HangulState copy() {
        HangulState h = new HangulState();
        h.copyFrom(this);
        return h;
    }

    public void copyFrom(HangulState src) {
        chosung = src.chosung;
        jungsung = src.jungsung;
        jongsung = src.jongsung;
        jongsung2 = src.jongsung2;
        step = src.step;
        flagWriting = src.flagWriting;
        flagDotused = src.flagDotused;
        flagDoubled = src.flagDoubled;
        flagAddcursor = src.flagAddcursor;
        flagSpace = src.flagSpace;
    }

    /*
     * 자음 자리를 이름 대신 step 으로 읽고 쓴다.
     * 자바스크립트 판의 h[slot] 동적 접근에 해당한다.
     */
    public String consAt(Slot slot) {
        switch (slot) {
            case CHOSUNG: return chosung;
            case JONGSUNG: return jongsung;
            case JONGSUNG2: return jongsung2;
            default: return "";
        }
    }

    public void setConsAt(Slot slot, String value) {
        switch (slot) {
            case CHOSUNG: chosung = value; break;
            case JONGSUNG: jongsung = value; break;
            case JONGSUNG2: jongsung2 = value; break;
            default: break;
        }
    }
}
