/*
 * Mode.java - 입력 모드
 *
 * KoreanChunJiInC++/include/chunjiin.h 의 열거형을 그대로 옮긴 것이다.
 * 번호(ordinal)가 원본과 같아야 설정 저장값·시험 코드가 그대로 맞는다.
 */
package com.shkwon.chunjiin.engine;

public enum Mode {
    HANGUL,          /* 0 한글 (천지인) */
    ENGLISH,         /* 1 영문 소문자 */
    UPPER_ENGLISH,   /* 2 영문 대문자 */
    NUMBER,          /* 3 숫자 */
    SPECIAL;         /* 4 기호 */

    public static final int COUNT = values().length;

    /* 번호로 모드를 얻는다. 범위 밖이면 null. */
    public static Mode of(int index) {
        if (index < 0 || index >= COUNT) return null;
        return values()[index];
    }

    public int index() {
        return ordinal();
    }
}
