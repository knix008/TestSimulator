/*
 * ToolbarPanel.java - 자주 쓰는 것들
 *
 * 메뉴 막대를 두지 않으므로 모든 명령이 여기와 단축키에 있다.
 * 버튼은 절대 접히거나 잘리지 않는다(가로 한 줄, 창 최소 폭 420px).
 * `프로그램 정보` 는 언제나 맨 오른쪽에 붙는다.
 * 사용법은 버튼을 두지 않는다 - F1 과 프로그램 정보 창에서 연다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JComponent;
import javax.swing.JPanel;

public final class ToolbarPanel extends JPanel {

    private static final int RADIUS = 10;
    private static final int PAD = 3;
    private static final int BTN = 28;

    /* id, 아이콘, 설명, 앞에 구분선, 오른쪽 끝 */
    private static final String[][] TOOLS = {
        {"new", "new", "새로 만들기", "0", "0"},
        {"open", "open", "열기", "0", "0"},
        {"save", "save", "저장", "0", "0"},
        {"copy", "copy", "복사", "1", "0"},
        {"paste", "paste", "붙여넣기", "0", "0"},
        {"clear", "trash", "전체 지우기", "0", "0"},
        {"mode", "keyboard", "입력 모드 전환 (F2)", "1", "0"},
        {"theme", "palette", "테마 전환 (F3)", "0", "0"},
        {"settings", "gear", "설정... (F4)", "0", "0"},
        {"about", "info", "프로그램 정보", "0", "1"},
    };

    private Theme theme;
    private final List<KeyButton> buttons = new ArrayList<>();
    private final List<Separator> separators = new ArrayList<>();

    public ToolbarPanel(Theme theme, Consumer<String> onCommand, java.util.Map<String, String> accel) {
        this.theme = theme;
        setOpaque(false);
        setLayout(new BoxLayout(this, BoxLayout.X_AXIS));
        setBorder(javax.swing.BorderFactory.createEmptyBorder(PAD, PAD, PAD, PAD));

        for (String[] t : TOOLS) {
            final String id = t[0];

            if ("1".equals(t[4])) add(Box.createHorizontalGlue());
            if ("1".equals(t[3])) {
                Separator sep = new Separator();
                separators.add(sep);
                add(Box.createHorizontalStrut(4));
                add(sep);
                add(Box.createHorizontalStrut(4));
            }

            String tip = accel.containsKey(id) ? t[2] + " (" + accel.get(id) + ")" : t[2];
            KeyButton b = new KeyButton(theme, Theme.Role.TOOL)
                .flat()
                .icon(t[1], 17)
                .tip(tip)
                .onClick(() -> onCommand.accept(id));
            b.setPreferredSize(new Dimension(BTN, BTN));
            b.setMinimumSize(new Dimension(BTN, BTN));
            b.setMaximumSize(new Dimension(BTN, BTN));
            buttons.add(b);
            add(b);
            add(Box.createHorizontalStrut(2));
        }
    }

    public void setTheme(Theme t) {
        this.theme = t;
        for (KeyButton b : buttons) b.setTheme(t);
        for (Separator s : separators) s.repaint();
        repaint();
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setColor(theme.role(Theme.Role.TOOL).bg);
        g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, RADIUS, RADIUS);
        g2.setColor(theme.border);
        g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, RADIUS, RADIUS);
        g2.dispose();
    }

    @Override
    public Dimension getMaximumSize() {
        return new Dimension(Integer.MAX_VALUE, getPreferredSize().height);
    }

    /* 묶음 사이를 갈라 주는 가는 선 (웹판 .tool-sep) */
    private final class Separator extends JComponent {
        Separator() {
            Dimension d = new Dimension(1, 17);
            setPreferredSize(d);
            setMinimumSize(d);
            setMaximumSize(d);
        }

        @Override
        protected void paintComponent(Graphics g) {
            Color c = theme.border;
            g.setColor(c);
            g.fillRect(0, 0, getWidth(), getHeight());
        }
    }
}
