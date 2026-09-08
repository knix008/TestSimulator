/*
 * TitleBar.java - 직접 그리는 제목줄
 *
 * 운영체제가 그려 주는 제목줄은 색을 바꿀 수 없다. 자바에는 그럴 API 가 없고,
 * Windows 의 DWM 을 부르려면 네이티브 호출이 필요한데 그것도 Windows 에서만 듣는다.
 * 그래서 창 장식을 끄고(`setUndecorated`) 여기서 직접 그린다.
 * 테마 4종의 색이 창 맨 위까지 이어지고, 세 운영체제에서 같은 모습이 된다.
 *
 * 대신 운영체제가 해 주던 일을 이쪽이 맡는다.
 *   - 끌어서 창 옮기기, 두 번 눌러 최대화
 *   - 최소화 · 최대화 · 닫기 단추
 *   - 창 가장자리 끌어서 크기 바꾸기는 WindowResizer 가 맡는다
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.List;
import javax.swing.JComponent;

public final class TitleBar extends JComponent {

    public static final int HEIGHT = 34;

    private static final int BTN_W = 44;
    private static final int ICON = 16;
    private static final Color CLOSE_HOVER = new Color(0xE8, 0x11, 0x23);

    private final Window window;
    private final boolean fullButtons;   /* 최소화·최대화까지 둘지 (대화상자는 닫기만) */
    private Theme theme;
    private Image icon;

    /* 마우스가 어느 단추 위에 있는지. -1 이면 없음. 0 최소화 1 최대화 2 닫기 */
    private int hot = -1;
    private int pressed = -1;

    /* 끌기 시작한 자리 */
    private Point dragFrom;
    private Point windowFrom;

    public TitleBar(Window window, Theme theme, boolean fullButtons) {
        this.window = window;
        this.theme = theme;
        this.fullButtons = fullButtons;
        setOpaque(false);

        List<Image> images = window.getIconImages();
        if (!images.isEmpty()) icon = images.get(0);

        MouseAdapter m = new MouseAdapter() {
            @Override
            public void mouseMoved(MouseEvent e) {
                int now = buttonAt(e.getX(), e.getY());
                if (now != hot) {
                    hot = now;
                    repaint();
                }
            }

            @Override
            public void mouseExited(MouseEvent e) {
                hot = -1;
                repaint();
            }

            @Override
            public void mousePressed(MouseEvent e) {
                if (e.getButton() != MouseEvent.BUTTON1) return;
                pressed = buttonAt(e.getX(), e.getY());
                repaint();

                if (pressed < 0) {
                    dragFrom = e.getLocationOnScreen();
                    windowFrom = window.getLocation();
                }
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                if (dragFrom == null || isMaximized()) return;
                Point now = e.getLocationOnScreen();
                window.setLocation(
                    windowFrom.x + (now.x - dragFrom.x),
                    windowFrom.y + (now.y - dragFrom.y));
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                if (e.getButton() != MouseEvent.BUTTON1) return;
                dragFrom = null;
                int was = pressed;
                pressed = -1;
                repaint();
                if (was >= 0 && was == buttonAt(e.getX(), e.getY())) click(was);
            }

            @Override
            public void mouseClicked(MouseEvent e) {
                /* 제목줄을 두 번 누르면 최대화 / 되돌리기 */
                if (e.getClickCount() == 2 && buttonAt(e.getX(), e.getY()) < 0) toggleMaximize();
            }
        };
        addMouseListener(m);
        addMouseMotionListener(m);
    }

    public void setTheme(Theme t) {
        this.theme = t;
        repaint();
    }

    /* ------------------------------------------------------------------ */

    private boolean isMaximized() {
        return window instanceof Frame f && (f.getExtendedState() & Frame.MAXIMIZED_BOTH) != 0;
    }

    private void toggleMaximize() {
        if (!(window instanceof Frame f)) return;
        f.setExtendedState(isMaximized() ? Frame.NORMAL : Frame.MAXIMIZED_BOTH);
        repaint();
    }

    private void click(int button) {
        switch (button) {
            case 0:
                if (window instanceof Frame f) f.setExtendedState(Frame.ICONIFIED);
                break;
            case 1:
                toggleMaximize();
                break;
            default:
                window.dispatchEvent(new java.awt.event.WindowEvent(
                    window, java.awt.event.WindowEvent.WINDOW_CLOSING));
                break;
        }
    }

    private int buttonCount() {
        return fullButtons ? 3 : 1;
    }

    /* 단추 번호(0 최소화, 1 최대화, 2 닫기). 단추 위가 아니면 -1. */
    private int buttonAt(int x, int y) {
        if (y < 0 || y >= getHeight()) return -1;
        int right = getWidth();
        for (int i = 0; i < buttonCount(); i++) {
            int bx = right - BTN_W * (i + 1);
            if (x >= bx && x < bx + BTN_W) return fullButtons ? 2 - i : 2;
        }
        return -1;
    }

    private Rectangle buttonBox(int button) {
        int slot = fullButtons ? 2 - button : 0;
        return new Rectangle(getWidth() - BTN_W * (slot + 1), 0, BTN_W, getHeight());
    }

    /* ------------------------------------------------------------------ */

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        int w = getWidth();
        int h = getHeight();

        Theme.RoleColors tool = theme.role(Theme.Role.TOOL);
        g2.setColor(tool.bg);
        g2.fillRect(0, 0, w, h);

        /* 아래쪽에 가는 선 하나로 본문과 갈라 놓는다 */
        g2.setColor(theme.border);
        g2.drawLine(0, h - 1, w, h - 1);

        int x = 10;
        if (icon != null) {
            g2.drawImage(icon, x, (h - ICON) / 2, ICON, ICON, null);
            x += ICON + 8;
        }

        String title = window instanceof Frame f ? f.getTitle()
            : (window instanceof java.awt.Dialog d ? d.getTitle() : "");
        if (title != null && !title.isEmpty()) {
            g2.setFont(Fonts.ui(13));
            java.awt.FontMetrics fm = g2.getFontMetrics();
            int limit = w - BTN_W * buttonCount() - x - 8;
            g2.setColor(theme.text);
            g2.drawString(clip(title, fm, limit), x, (h - fm.getHeight()) / 2 + fm.getAscent());
        }

        for (int i = 0; i < buttonCount(); i++) {
            int button = fullButtons ? i : 2;
            drawButton(g2, button);
        }

        g2.dispose();
    }

    private void drawButton(Graphics2D g, int button) {
        Rectangle b = buttonBox(button);
        boolean isHot = hot == button;
        boolean isDown = pressed == button;

        if (isHot || isDown) {
            Color bg = button == 2
                ? (isDown ? CLOSE_HOVER.darker() : CLOSE_HOVER)
                : (isDown ? theme.role(Theme.Role.TOOL).active : theme.role(Theme.Role.TOOL).hover);
            g.setColor(bg);
            g.fillRect(b.x, b.y, b.width, b.height - 1);
        }

        Color fg = button == 2 && (isHot || isDown) ? Color.WHITE : theme.role(Theme.Role.TOOL).fg;
        g.setColor(fg);
        g.setStroke(new BasicStroke(1.2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));

        int cx = b.x + b.width / 2;
        int cy = b.height / 2;
        int r = 5;

        switch (button) {
            case 0:     /* 최소화 - 가로줄 하나 */
                g.drawLine(cx - r, cy, cx + r, cy);
                break;
            case 1:     /* 최대화 - 네모, 최대화 상태면 겹친 네모 */
                if (isMaximized()) {
                    g.drawRect(cx - r, cy - r + 2, r * 2 - 2, r * 2 - 2);
                    g.drawLine(cx - r + 2, cy - r + 2, cx - r + 2, cy - r);
                    g.drawLine(cx - r + 2, cy - r, cx + r, cy - r);
                    g.drawLine(cx + r, cy - r, cx + r, cy + r - 2);
                } else {
                    g.drawRect(cx - r, cy - r, r * 2, r * 2);
                }
                break;
            default:    /* 닫기 - X */
                g.drawLine(cx - r, cy - r, cx + r, cy + r);
                g.drawLine(cx + r, cy - r, cx - r, cy + r);
                break;
        }
    }

    /* 자리가 모자라면 뒤를 잘라 … 을 붙인다 */
    private static String clip(String s, java.awt.FontMetrics fm, int max) {
        if (max <= 0) return "";
        if (fm.stringWidth(s) <= max) return s;
        for (int i = s.length() - 1; i > 0; i--) {
            String cut = s.substring(0, i) + "…";
            if (fm.stringWidth(cut) <= max) return cut;
        }
        return "";
    }

    @Override
    public Dimension getPreferredSize() {
        return new Dimension(200, HEIGHT);
    }

    @Override
    public Dimension getMaximumSize() {
        return new Dimension(Integer.MAX_VALUE, HEIGHT);
    }

    @Override
    public Dimension getMinimumSize() {
        return new Dimension(BTN_W * buttonCount() + 40, HEIGHT);
    }
}
