/*
 * Fonts.java - 글꼴 고르기
 *
 * 웹판 styles.css 의 글꼴 사슬을 그대로 옮겼다.
 *
 *   "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Nanum Gothic",
 *   system-ui, "Segoe UI", sans-serif
 *
 * CSS 는 없는 글꼴을 알아서 건너뛰지만 자바는 그러지 않으므로,
 * 실제로 설치된 것 가운데 앞에 있는 것을 한 번 찾아 두고 계속 쓴다.
 */
package com.shkwon.chunjiin.ui;

import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class Fonts {

    private Fonts() {
    }

    private static final String[] CHAIN = {
        "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Nanum Gothic",
        "Segoe UI", "Dialog",
    };

    public static final String FAMILY = pick();

    private static String pick() {
        try {
            Set<String> have = new HashSet<>(Arrays.asList(
                GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames()));
            for (String name : CHAIN) {
                if (have.contains(name)) return name;
            }
        } catch (Exception e) {
            /* 헤드리스 등 글꼴 목록을 못 얻는 자리 */
        }
        return Font.SANS_SERIF;
    }

    public static Font ui(int size) {
        return new Font(FAMILY, Font.PLAIN, size);
    }

    public static Font uiBold(int size) {
        return new Font(FAMILY, Font.BOLD, size);
    }

    /* 오류 창의 자세한 내용처럼 줄을 맞춰 보여야 하는 곳 */
    public static Font mono(int size) {
        return new Font(Font.MONOSPACED, Font.PLAIN, size);
    }
}
