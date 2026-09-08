/*
 * KeypadPanel.java - 천지인 12키 + 기능 버튼 한 줄
 *
 *   ㅣ     ·      ㅡ        0  1  2
 *   ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
 *   ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
 *   . ,    ㅇㅁ   ? !       9  10 11
 *   모드  ◀  스페이스  ▶  ↵  ⌫
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Dimension;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Insets;
import java.util.function.Consumer;
import java.util.function.IntConsumer;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JPanel;

public final class KeypadPanel extends JPanel {

    /* 웹판 --gap */
    private static final int GAP = 6;
    /*
     * 키 높이. 웹판은 창 높이에 견주어 정한다.
     *   12키   grid-auto-rows: minmax(46px, 8vh)
     *   기능줄 height: clamp(40px, 6.5vh, 52px)
     * 기본 창 높이 820px 에서 각각 66px 과 52px(윗한계)이 되므로 그 값을 쓴다.
     */
    private static final int KEY_H = 66;
    private static final int FN_H = 52;

    /* 물리 키보드 숫자열 대응 (한글 모드에서만 쓴다). 화면 배치와 같은 순서. */
    private static final String[] HINTS = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "0", "="};

    /* 기능 버튼 한 줄 */
    private static final String[][] FN = {
        /* id, 라벨(없으면 null), 아이콘(없으면 null), 역할, 설명, 늘어남 */
        {"mode", "모드", null, "PRIMARY", "입력 모드 전환 (F2)", "1"},
        {"left", null, "left", "FN", "커서 왼쪽 (←)", "1"},
        {"space", "스페이스", null, "FN", "띄어쓰기 (Space)", "2"},
        {"right", null, "right", "FN", "커서 오른쪽 (→) · 연타 순환 끊기", "1"},
        {"enter", null, "enter", "FN", "줄바꿈 (Enter)", "1"},
        {"backspace", null, "backspace", "FN", "지우기 (Backspace)", "1"},
    };

    private final KeyButton[] keys = new KeyButton[12];
    private final KeyButton[] fnKeys = new KeyButton[FN.length];

    public KeypadPanel(Theme theme, IntConsumer onKey, Consumer<String> onFn) {
        setOpaque(false);
        setLayout(new BoxLayout(this, BoxLayout.Y_AXIS));

        JPanel grid = new JPanel(new GridLayout(4, 3, GAP, GAP));
        grid.setOpaque(false);
        for (int k = 0; k < 12; k++) {
            final int key = k;
            keys[k] = new KeyButton(theme, Theme.keyRole(k, true))
                .font(19, true)
                .onClick(() -> onKey.accept(key));
            keys[k].setPreferredSize(new Dimension(60, KEY_H));
            grid.add(keys[k]);
        }

        /*
         * 웹판은 flex-grow 로 자리를 나눈다(스페이스만 2, 나머지는 1).
         * BoxLayout 은 그 비율을 지키지 못하므로 GridBagLayout 의 weightx 로 옮겼다.
         */
        JPanel row = new JPanel(new GridBagLayout());
        row.setOpaque(false);
        for (int i = 0; i < FN.length; i++) {
            String[] f = FN[i];
            final String id = f[0];
            KeyButton b = new KeyButton(theme, Theme.Role.valueOf(f[3]))
                .font(14, true)
                .tip(f[4])
                .onClick(() -> onFn.accept(id));
            if (f[1] != null) b.label(f[1]);
            if (f[2] != null) b.icon(f[2], 20);
            b.setPreferredSize(new Dimension(10, FN_H));
            fnKeys[i] = b;

            GridBagConstraints c = new GridBagConstraints();
            c.gridx = i;
            c.weightx = Double.parseDouble(f[5]);
            c.fill = GridBagConstraints.BOTH;
            c.insets = new Insets(0, i == 0 ? 0 : GAP, 0, 0);
            row.add(b, c);
        }

        add(grid);
        add(Box.createVerticalStrut(GAP));
        add(row);
    }

    /* 모드가 바뀌면 라벨과 역할, 그리고 키보드 힌트 표시가 함께 바뀐다. */
    public void update(String[] labels, boolean isHangul) {
        for (int k = 0; k < 12; k++) {
            keys[k].label(labels[k])
                .role(Theme.keyRole(k, isHangul))
                .hint(isHangul ? HINTS[k] : null)
                .tip(isHangul ? "키보드 " + HINTS[k] : null);
        }
    }

    public void setTheme(Theme t) {
        for (KeyButton b : keys) b.setTheme(t);
        for (KeyButton b : fnKeys) b.setTheme(t);
    }

    @Override
    public Dimension getMaximumSize() {
        return new Dimension(Integer.MAX_VALUE, getPreferredSize().height);
    }
}
