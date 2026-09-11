/*
 * KeyButton.java - 툴바 · 키패드 · 대화상자가 함께 쓰는 버튼
 *
 * 웹판의 `.btn` 과 그 변종(`key-vowel`, `key-fn`, `tool` ...)에 해당한다.
 * JButton 을 쓰지 않고 직접 그리는 까닭은 두 가지다.
 *
 *  - 룩앤필마다 테두리·여백이 달라 테마 색이 그대로 나오지 않는다
 *  - 키패드는 눌러도 포커스를 가져가면 안 된다 (편집 영역이 키를 계속 받아야 한다)
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.accessibility.AccessibleContext;
import javax.accessibility.AccessibleRole;
import javax.swing.JComponent;

/*
 * final 이다. 물려받는 곳이 없고, 생성자가 setCursor 같은 JComponent 의 메서드를
 * 부르므로 열어 두면 하위 클래스가 다 만들어지기 전에 그것이 불릴 수 있다.
 */
public final class KeyButton extends JComponent {

    /* 웹판 --radius */
    private static final int RADIUS = 10;

    private Theme theme;
    private Theme.Role role;

    private String label = "";
    private String iconName;
    private String hint;            /* 키 오른쪽 위 작은 숫자 (물리 키보드 대응) */
    private int iconSize = 18;
    private int fontSize = 14;
    private boolean bold;
    private boolean flat;           /* 툴바 버튼: 평소엔 배경·테두리가 없다 */

    private boolean hover;
    private boolean pressed;

    private Runnable action = () -> { };

    public KeyButton(Theme theme, Theme.Role role) {
        this.theme = theme;
        this.role = role;
        setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        setOpaque(false);

        addMouseListener(new MouseAdapter() {
            @Override
            public void mouseEntered(MouseEvent e) {
                hover = true;
                repaint();
            }

            @Override
            public void mouseExited(MouseEvent e) {
                hover = false;
                pressed = false;
                repaint();
            }

            @Override
            public void mousePressed(MouseEvent e) {
                if (e.getButton() != MouseEvent.BUTTON1) return;
                pressed = true;
                repaint();
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                if (e.getButton() != MouseEvent.BUTTON1) return;
                boolean fire = pressed && contains(e.getPoint());
                pressed = false;
                repaint();
                if (fire) action.run();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* 짓기                                                                */
    /* ------------------------------------------------------------------ */

    public KeyButton label(String text) {
        this.label = text == null ? "" : text;
        repaint();
        return this;
    }

    public KeyButton icon(String name, int size) {
        this.iconName = name;
        this.iconSize = size;
        repaint();
        return this;
    }

    public KeyButton hint(String text) {
        this.hint = text;
        repaint();
        return this;
    }

    public KeyButton font(int size, boolean isBold) {
        this.fontSize = size;
        this.bold = isBold;
        repaint();
        return this;
    }

    public KeyButton flat() {
        this.flat = true;
        return this;
    }

    public KeyButton tip(String text) {
        setToolTipText(text);
        getAccessibleContext().setAccessibleName(text);
        return this;
    }

    public KeyButton onClick(Runnable r) {
        this.action = r == null ? () -> { } : r;
        return this;
    }

    public KeyButton role(Theme.Role r) {
        this.role = r;
        repaint();
        return this;
    }

    public void setTheme(Theme t) {
        this.theme = t;
        repaint();
    }

    /* ------------------------------------------------------------------ */
    /* 그리기                                                              */
    /* ------------------------------------------------------------------ */

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        Theme.RoleColors rc = theme.role(role);
        int w = getWidth();
        int h = getHeight();

        Color bg = pressed ? rc.active : (hover ? rc.hover : rc.bg);
        Color border = rc.border;

        /* 툴바 버튼은 마우스가 올라왔을 때만 모습을 드러낸다 */
        if (flat && !hover && !pressed) {
            bg = null;
            border = null;
        }

        if (bg != null) {
            g2.setColor(bg);
            g2.fillRoundRect(0, 0, w - 1, h - 1, RADIUS, RADIUS);
        }
        if (border != null) {
            g2.setColor(border);
            g2.drawRoundRect(0, 0, w - 1, h - 1, RADIUS, RADIUS);
        }

        Color fg = rc.fg;

        if (iconName != null) {
            Icons.draw(g2, iconName, (w - iconSize) / 2, (h - iconSize) / 2, iconSize, fg);
        } else if (!label.isEmpty()) {
            g2.setFont(bold ? Fonts.uiBold(fontSize) : Fonts.ui(fontSize));
            FontMetrics fm = g2.getFontMetrics();
            int tx = (w - fm.stringWidth(label)) / 2;
            int ty = (h - fm.getHeight()) / 2 + fm.getAscent();
            g2.setColor(fg);
            g2.drawString(label, tx, ty);
        }

        if (hint != null) {
            g2.setFont(Fonts.ui(10));
            FontMetrics fm = g2.getFontMetrics();
            /* 웹판의 opacity .42 를 알파로 흉내 낸다 */
            g2.setColor(new Color(fg.getRed(), fg.getGreen(), fg.getBlue(), 107));
            g2.drawString(hint, w - 6 - fm.stringWidth(hint), 3 + fm.getAscent());
        }

        g2.dispose();
    }

    /*
     * JComponent 는 접근성 정보를 스스로 만들지 않는다(getAccessibleContext() 가 null).
     * 화면 낭독기에 버튼으로 읽히도록 여기서 만들어 준다.
     */
    @Override
    public AccessibleContext getAccessibleContext() {
        if (accessibleContext == null) {
            accessibleContext = new AccessibleJComponent() {
                @Override
                public AccessibleRole getAccessibleRole() {
                    return AccessibleRole.PUSH_BUTTON;
                }
            };
        }
        return accessibleContext;
    }

    @Override
    public Dimension getPreferredSize() {
        if (isPreferredSizeSet()) return super.getPreferredSize();
        Font f = bold ? Fonts.uiBold(fontSize) : Fonts.ui(fontSize);
        FontMetrics fm = getFontMetrics(f);
        int w = iconName != null ? iconSize + 10 : fm.stringWidth(label) + 22;
        int h = Math.max(iconName != null ? iconSize + 10 : 0, fm.getHeight() + 12);
        return new Dimension(w, h);
    }
}
