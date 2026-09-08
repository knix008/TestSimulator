/*
 * Theme.java - 테마 4종
 *
 * KoreanChunJiInC++/src/main.c 의 THEMES 표를 그대로 옮긴 것이다.
 * COLORREF 값을 그대로 16진수 색으로 바꿨으므로 색감이 원본과 같다.
 *
 * 역할별 색은 [기본, 호버, 눌림, 테두리, 글자] 다섯 개다.
 * 웹판은 이것을 CSS 사용자 지정 속성으로 내려 보냈지만, Swing 에는
 * 그런 장치가 없으므로 각 부품이 이 표를 직접 읽어 칠한다.
 */
package com.shkwon.chunjiin;

import java.awt.Color;

public final class Theme {

    /* 버튼 역할. 순서가 role 표의 줄 번호다. */
    public enum Role {
        CONS,       /* 자음 · 일반 키 */
        VOWEL,      /* ㅣ · ㅡ */
        MOD,        /* 문장부호 */
        FN,         /* 기능 버튼 */
        PRIMARY,    /* 모드 전환 */
        TOOL        /* 툴바 */
    }

    /* 역할 하나의 다섯 색 */
    public static final class RoleColors {
        public final Color bg;
        public final Color hover;
        public final Color active;
        public final Color border;
        public final Color fg;

        RoleColors(String bg, String hover, String active, String border, String fg) {
            this.bg = hex(bg);
            this.hover = hex(hover);
            this.active = hex(active);
            this.border = hex(border);
            this.fg = hex(fg);
        }
    }

    public final String id;
    public final String name;
    public final boolean dark;
    public final Color wnd;
    public final Color card;
    public final Color border;
    public final Color text;
    public final Color muted;
    private final RoleColors[] roles;

    private Theme(String id, String name, boolean dark,
                  String wnd, String card, String border, String text, String muted,
                  RoleColors... roles) {
        this.id = id;
        this.name = name;
        this.dark = dark;
        this.wnd = hex(wnd);
        this.card = hex(card);
        this.border = hex(border);
        this.text = hex(text);
        this.muted = hex(muted);
        this.roles = roles;
    }

    public RoleColors role(Role r) {
        return roles[r.ordinal()];
    }

    private static Color hex(String s) {
        return new Color(Integer.parseInt(s.substring(1), 16));
    }

    /* ------------------------------------------------------------------ */

    public static final Theme[] THEMES = {
        new Theme("light", "라이트", false,
            "#F6F7FA", "#FFFFFF", "#DFE3EA", "#1F2328", "#6B7280",
            new RoleColors("#FFFFFF", "#F2F5FF", "#E3EAFD", "#DFE3EA", "#1F2328"),
            new RoleColors("#EDF2FF", "#E3EBFF", "#D6E1FD", "#D3DEFB", "#2749C9"),
            new RoleColors("#F1F3F7", "#E9ECF2", "#DFE3EB", "#E0E4EB", "#4A5162"),
            new RoleColors("#F1F3F7", "#E9ECF2", "#DFE3EB", "#E0E4EB", "#333842"),
            new RoleColors("#3F62E8", "#3557DD", "#2C4AC9", "#3557DD", "#FFFFFF"),
            new RoleColors("#F6F7FA", "#E7ECF8", "#D9E1F5", "#F6F7FA", "#3B4250")),

        new Theme("dark", "다크", true,
            "#1E1F22", "#17181B", "#33363D", "#E6E8EB", "#9AA1AC",
            new RoleColors("#24262B", "#2C2F36", "#363A43", "#383B43", "#E6E8EB"),
            new RoleColors("#21304F", "#27395E", "#2E446F", "#33456B", "#A9C4FF"),
            new RoleColors("#1D1F24", "#24262B", "#2B2E35", "#303339", "#B7BDC7"),
            new RoleColors("#1D1F24", "#24262B", "#2B2E35", "#303339", "#DDE1E7"),
            new RoleColors("#3F62E8", "#4A6DF0", "#3455CE", "#4A6DF0", "#FFFFFF"),
            new RoleColors("#1E1F22", "#2A2D34", "#343840", "#1E1F22", "#D5D9E0")),

        new Theme("sepia", "세피아", false,
            "#F3EADA", "#FBF3E6", "#DCCDB4", "#4A3B28", "#8A755A",
            new RoleColors("#FBF3E6", "#F6EAD6", "#EEDCC0", "#DCCDB4", "#4A3B28"),
            new RoleColors("#F3E3C6", "#EEDAB6", "#E6CEA2", "#D9C09B", "#8A5A22"),
            new RoleColors("#EFE4D0", "#E9DAC2", "#E0CDAF", "#D7C6AA", "#5A4A34"),
            new RoleColors("#EFE4D0", "#E9DAC2", "#E0CDAF", "#D7C6AA", "#4A3B28"),
            new RoleColors("#A9713C", "#96632F", "#855427", "#96632F", "#FFF8EC"),
            new RoleColors("#F3EADA", "#EADCC4", "#E0CEB0", "#F3EADA", "#5A4A34")),

        new Theme("contrast", "고대비", true,
            "#000000", "#000000", "#FFFFFF", "#FFFFFF", "#FFFF00",
            new RoleColors("#000000", "#222222", "#444444", "#FFFFFF", "#FFFFFF"),
            new RoleColors("#000000", "#222222", "#444444", "#FFFF00", "#FFFF00"),
            new RoleColors("#000000", "#222222", "#444444", "#00FF00", "#00FF00"),
            new RoleColors("#000000", "#222222", "#444444", "#FFFFFF", "#FFFFFF"),
            new RoleColors("#FFFF00", "#FFEA00", "#E6D200", "#FFFF00", "#000000"),
            new RoleColors("#000000", "#333333", "#555555", "#000000", "#FFFF00")),
    };

    public static final int THEME_COUNT = THEMES.length;

    public static Theme get(int index) {
        if (index < 0 || index >= THEME_COUNT) index = 0;
        return THEMES[index];
    }

    /* 키패드 12키의 역할. 한글 모드가 아니면 모두 일반 키로 그린다. */
    public static Role keyRole(int key, boolean isHangul) {
        if (!isHangul) return Role.CONS;
        if (key == 0 || key == 1 || key == 2) return Role.VOWEL;
        if (key == 9 || key == 11) return Role.MOD;
        return Role.CONS;
    }
}
