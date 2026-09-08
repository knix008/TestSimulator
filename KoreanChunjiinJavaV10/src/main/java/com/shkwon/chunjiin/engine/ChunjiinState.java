/*
 * ChunjiinState.java - 입력기 전체 상태
 *
 * KoreanChunJiInC++/include/chunjiin.h 의 CHUNJIIN 구조체에 대응한다.
 *
 * C 의 wchar_t text_buffer[4096] 은 StringBuilder 로 바꿨다.
 * 자바 문자열도 UTF-16 코드 단위 기준이므로 한글 음절·호환 자모가 모두
 * 한 칸을 차지한다. 따라서 커서 위치 계산이 원본과 똑같이 맞아떨어진다.
 */
package com.shkwon.chunjiin.engine;

public final class ChunjiinState {
    public final HangulState hangul = new HangulState();
    public Mode nowMode = Mode.HANGUL;

    public String engnum = "";      /* 영문/숫자/기호 모드에서 조합 중인 문자 */
    public boolean flagInitengnum;
    public boolean flagEngdelete;

    public final StringBuilder text = new StringBuilder();  /* 편집 버퍼 */
    public int cursorPos;           /* 삽입 위치. 조합 중이면 조합 글자는 cursorPos-1 */

    /* 아래는 원본 chunjiin.c 가 쓰지 않는 확장 필드 */
    public int lastKey = -1;        /* 직전에 눌린 키 인덱스, 없으면 -1 */
    public int tapCount;            /* 같은 키 연타 위치 */
    public int composeLen;          /* 조합 중인 글자가 차지하는 칸 수 (0~2) */

    /*
     * 겹받침 되돌려 붙이기용.
     * 받침 뒤에 온 자음이 겹받침을 이루지 못해 새 음절로 떨어져 나갔을 때,
     * 바로 앞 음절을 기억해 둔다. 그 자음을 연타해서 겹받침이 되는 자음으로
     * 바뀌면 앞 음절로 도로 합친다. (만 + ㅅ -> 만ㅅ -> 많)
     */
    public HangulState prevSyllable = new HangulState();
    public boolean prevMergeable;

    /* 편집 버퍼를 문자열로. 화면과 파일 저장이 이것을 쓴다. */
    public String textString() {
        return text.toString();
    }

    public int textLength() {
        return text.length();
    }
}
