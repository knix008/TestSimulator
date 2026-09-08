/*
 * EditorPanel.java - 편집 영역
 *
 * 원본 C 판은 Win32 EDIT 컨트롤을 서브클래싱해서 썼고, 웹판은 div 에 직접
 * 그렸다. 여기서도 JTextArea 를 쓰지 않고 직접 그린다.
 * 캐럿 위치를 엔진이 온전히 쥐고 있어야 하기 때문이다.
 *
 *   [확정된 글] [조합 중인 글자] |캐럿| [뒤쪽 글]
 *
 * 조합 중인 글자에는 밑줄을 그어 "아직 바뀔 수 있음"을 보여 준다.
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
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;
import javax.accessibility.AccessibleContext;
import javax.accessibility.AccessibleRole;
import javax.swing.JComponent;
import javax.swing.Scrollable;
import javax.swing.SwingConstants;
import javax.swing.Timer;

public final class EditorPanel extends JComponent implements Scrollable {

    /* 웹판 .editor 의 padding: 12px 14px */
    private static final int PAD_X = 14;
    private static final int PAD_Y = 12;
    /* 웹판 line-height: 1.55 */
    private static final double LINE_HEIGHT = 1.55;
    /* 캐럿 깜빡임. 웹판 애니메이션 1.06초의 절반 */
    private static final int BLINK_MS = 530;

    private Theme theme;
    private int fontSize = 21;

    private String text = "";
    private int cursorPos;
    private int composeLen;

    private boolean caretOn = true;
    private final Timer blink;

    private IntConsumer onSetCursor = at -> { };

    /* 한 줄이 어디서 어디까지인지. 다시 그릴 때마다 폭에 맞춰 새로 잰다. */
    private static final class Line {
        final int start;
        final int end;      /* 줄에 담긴 마지막 글자 다음 자리 */

        Line(int start, int end) {
            this.start = start;
            this.end = end;
        }
    }

    private final List<Line> lines = new ArrayList<>();
    private int laidOutWidth = -1;
    private String laidOutText = null;
    private int laidOutFontSize = -1;

    public EditorPanel(Theme theme) {
        this.theme = theme;
        setCursor(Cursor.getPredefinedCursor(Cursor.TEXT_CURSOR));
        setOpaque(true);
        setFocusable(true);

        blink = new Timer(BLINK_MS, e -> {
            caretOn = !caretOn;
            repaint();
        });
        blink.start();

        addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                requestFocusInWindow();
                int at = offsetFromPoint(e.getX(), e.getY());
                if (at >= 0) onSetCursor.accept(at);
            }
        });
    }

    public void setOnSetCursor(IntConsumer c) {
        this.onSetCursor = c == null ? at -> { } : c;
    }

    public void setTheme(Theme t) {
        this.theme = t;
        repaint();
    }

    public void setFontSize(int size) {
        this.fontSize = size;
        laidOutWidth = -1;
        revalidate();
        repaint();
    }

    /* 엔진이 바뀔 때마다 화면 쪽에서 이것을 부른다. */
    public void update(String text, int cursorPos, int composeLen) {
        this.text = text;
        this.cursorPos = cursorPos;
        this.composeLen = composeLen;
        /* 글자를 칠 때는 캐럿이 보이는 상태에서 다시 시작한다 */
        caretOn = true;
        blink.restart();
        laidOutWidth = -1;
        revalidate();
        repaint();
        scrollCaretIntoView();
    }

    /* ------------------------------------------------------------------ */
    /* 줄 나누기                                                           */
    /* ------------------------------------------------------------------ */

    private Font textFont() {
        return Fonts.ui(fontSize);
    }

    private int lineHeight() {
        return (int) Math.round(fontSize * LINE_HEIGHT);
    }

    /*
     * 폭에 맞춰 줄을 나눈다.
     * 웹판이 `overflow-wrap: anywhere` 이므로 낱말 단위가 아니라 글자 단위로
     * 끊는다. 한글은 원래 글자 단위로 끊기고, 긴 영문도 창 밖으로 나가지 않는다.
     */
    private void layout(int width) {
        if (laidOutWidth == width && text.equals(laidOutText) && laidOutFontSize == fontSize) return;

        laidOutWidth = width;
        laidOutText = text;
        laidOutFontSize = fontSize;
        lines.clear();

        FontMetrics fm = getFontMetrics(textFont());
        int avail = Math.max(1, width - PAD_X * 2);

        int start = 0;
        int w = 0;

        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);

            if (ch == '\n') {
                lines.add(new Line(start, i));
                start = i + 1;
                w = 0;
                continue;
            }

            int cw = fm.charWidth(ch);
            if (w + cw > avail && i > start) {
                lines.add(new Line(start, i));
                start = i;
                w = 0;
            }
            w += cw;
        }
        lines.add(new Line(start, text.length()));
    }

    /* 글자 번호가 몇 번째 줄에 있는지 */
    private int lineOf(int index) {
        for (int i = 0; i < lines.size(); i++) {
            Line l = lines.get(i);
            if (index >= l.start && index <= l.end) return i;
        }
        return Math.max(0, lines.size() - 1);
    }

    /* 글자 번호의 화면 x 좌표 */
    private int xOf(int index, FontMetrics fm) {
        Line l = lines.get(lineOf(index));
        return PAD_X + fm.stringWidth(text.substring(l.start, Math.min(index, l.end)));
    }

    /* 클릭한 화면 좌표가 텍스트의 몇 번째 글자인지 알아낸다. */
    private int offsetFromPoint(int px, int py) {
        layout(getWidth());
        FontMetrics fm = getFontMetrics(textFont());
        int lh = lineHeight();

        int row = (py - PAD_Y) / lh;
        row = Math.max(0, Math.min(lines.size() - 1, row));
        Line l = lines.get(row);

        int x = PAD_X;
        for (int i = l.start; i < l.end; i++) {
            int cw = fm.charWidth(text.charAt(i));
            if (px < x + cw / 2) return i;
            x += cw;
        }
        return l.end;
    }

    /* 글자를 넣을 때마다 캐럿이 화면 안에 남아 있게 한다 */
    private void scrollCaretIntoView() {
        if (getWidth() <= 0) return;
        layout(getWidth());
        FontMetrics fm = getFontMetrics(textFont());
        int lh = lineHeight();
        int row = lineOf(cursorPos);
        scrollRectToVisible(new Rectangle(xOf(cursorPos, fm) - 2, PAD_Y + row * lh, 4, lh));
    }

    /* ------------------------------------------------------------------ */
    /* 그리기                                                              */
    /* ------------------------------------------------------------------ */

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        g2.setColor(theme.card);
        g2.fillRect(0, 0, getWidth(), getHeight());

        layout(getWidth());

        Font f = textFont();
        g2.setFont(f);
        FontMetrics fm = g2.getFontMetrics();
        int lh = lineHeight();
        /* 줄 상자 안에서 글자를 세로 가운데에 앉힌다 */
        int baseline = (lh - fm.getHeight()) / 2 + fm.getAscent();

        int composeStart = Math.max(0, cursorPos - composeLen);
        Color primary = theme.role(Theme.Role.PRIMARY).bg;

        for (int row = 0; row < lines.size(); row++) {
            Line l = lines.get(row);
            int y = PAD_Y + row * lh;
            if (y > getHeight() && getParent() == null) break;

            int x = PAD_X;
            for (int i = l.start; i < l.end; i++) {
                String ch = text.substring(i, i + 1);
                int cw = fm.stringWidth(ch);
                boolean composing = i >= composeStart && i < cursorPos;

                g2.setColor(theme.text);
                g2.drawString(ch, x, y + baseline);

                /* 조합 중인 글자에는 밑줄 (웹판 .composing) */
                if (composing) {
                    g2.setColor(primary);
                    g2.fillRect(x, y + baseline + 3, cw, 2);
                }
                x += cw;
            }
        }

        /* 캐럿 */
        if (caretOn && isFocusOwner()) {
            int row = lineOf(cursorPos);
            int cx = xOf(cursorPos, fm);
            int cy = PAD_Y + row * lh;
            g2.setColor(primary);
            g2.fillRect(cx, cy + (lh - fm.getHeight()) / 2, 2, fm.getHeight());
        }

        g2.dispose();
    }

    /* JComponent 는 접근성 정보를 스스로 만들지 않으므로 여기서 만들어 준다. */
    @Override
    public AccessibleContext getAccessibleContext() {
        if (accessibleContext == null) {
            accessibleContext = new AccessibleJComponent() {
                @Override
                public AccessibleRole getAccessibleRole() {
                    return AccessibleRole.TEXT;
                }
            };
            accessibleContext.setAccessibleName("편집 영역");
        }
        return accessibleContext;
    }

    @Override
    public Dimension getPreferredSize() {
        int w = getParent() == null ? 400 : getParent().getWidth();
        layout(w);
        return new Dimension(w, PAD_Y * 2 + Math.max(1, lines.size()) * lineHeight());
    }

    /* ------------------------------------------------------------------ */
    /* Scrollable - 가로로는 늘어나지 않고, 세로로만 흐른다                */
    /* ------------------------------------------------------------------ */

    @Override
    public Dimension getPreferredScrollableViewportSize() {
        return getPreferredSize();
    }

    @Override
    public int getScrollableUnitIncrement(Rectangle visible, int orientation, int direction) {
        return orientation == SwingConstants.VERTICAL ? lineHeight() : 20;
    }

    @Override
    public int getScrollableBlockIncrement(Rectangle visible, int orientation, int direction) {
        return orientation == SwingConstants.VERTICAL ? visible.height - lineHeight() : visible.width;
    }

    @Override
    public boolean getScrollableTracksViewportWidth() {
        return true;
    }

    @Override
    public boolean getScrollableTracksViewportHeight() {
        return false;
    }
}
