/*
 * StatusBar.java - 상태줄
 *
 * 메뉴 막대를 없앴으므로, 프로그램이 지금 어떤 상태인지는 모두 여기서 본다.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ 한글        조합 ㄱ + ㅏ + -      저장했습니다 │  1줄: 지금 치고 있는 것
 *   │ 라이트 · 21px   연타 0.8초 ●   커서 5 · 12자  │  2줄: 설정과 위치
 *   └────────────────────────────────────────────┘
 *
 * `조합` 칸은 만들고 있는 글자의 초성 · 중성 · 종성이고 `-` 는 아직 비었다는 뜻이다.
 * `연타` 옆의 ● 는 지금 같은 키를 누르면 순환이 이어진다는 표시다.
 *
 * 라벨을 여러 개 붙이는 대신 한 부품이 직접 그린다. 글자를 칠 때마다
 * 상태줄 전체가 바뀌는데, 부품이 하나면 다시 그리는 자리도 하나다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.swing.JComponent;

public final class StatusBar extends JComponent {

    private static final int PAD_X = 10;
    private static final int PAD_TOP = 5;
    private static final int PAD_BOTTOM = 6;
    private static final int ROW_GAP = 2;
    private static final int SIZE_1 = 13;   /* 웹판 12.5px */
    private static final int SIZE_2 = 12;   /* 웹판 11.5px */
    private static final int RADIUS = 10;

    private Theme theme;

    private String modeName = "";
    private String composition = "";
    private int cursorPos;
    private int length;
    private String themeName = "";
    private int fontSize;
    private int multitapMs;
    private boolean multitapLive;

    private String note;
    private boolean noteIsError;
    private Runnable onNoteClick = () -> { };

    /* 알림이 그려진 자리. 오류 알림을 눌러 다시 열 수 있게 기억해 둔다. */
    private Rectangle noteBox = new Rectangle(0, 0, 0, 0);

    public StatusBar(Theme theme) {
        this.theme = theme;
        setOpaque(false);

        addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (noteIsError && noteBox.contains(e.getPoint())) onNoteClick.run();
            }
        });
        addMouseMotionListener(new MouseAdapter() {
            @Override
            public void mouseMoved(MouseEvent e) {
                boolean on = noteIsError && noteBox.contains(e.getPoint());
                setCursor(Cursor.getPredefinedCursor(on ? Cursor.HAND_CURSOR : Cursor.DEFAULT_CURSOR));
            }
        });
        setToolTipText("");     /* getToolTipText(MouseEvent) 가 자리마다 다르게 답한다 */
    }

    public void setTheme(Theme t) {
        this.theme = t;
        repaint();
    }

    public void setOnNoteClick(Runnable r) {
        this.onNoteClick = r == null ? () -> { } : r;
    }

    public void update(String modeName, String composition, int cursorPos, int length,
                       String themeName, int fontSize, int multitapMs, boolean multitapLive,
                       String note, boolean noteIsError) {
        this.modeName = modeName;
        this.composition = composition;
        this.cursorPos = cursorPos;
        this.length = length;
        this.themeName = themeName;
        this.fontSize = fontSize;
        this.multitapMs = multitapMs;
        this.multitapLive = multitapLive;
        this.note = note;
        this.noteIsError = noteIsError;
        repaint();
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
        g2.fillRoundRect(0, 0, w - 1, h - 1, RADIUS, RADIUS);
        g2.setColor(theme.border);
        g2.drawRoundRect(0, 0, w - 1, h - 1, RADIUS, RADIUS);

        Color primary = theme.role(Theme.Role.PRIMARY).bg;
        Color primaryFg = theme.role(Theme.Role.PRIMARY).fg;

        /* --- 윗줄 --------------------------------------------------- */
        g2.setFont(Fonts.uiBold(SIZE_1));
        FontMetrics fm1 = g2.getFontMetrics();
        int y1 = PAD_TOP + fm1.getAscent();

        g2.setColor(theme.text);
        g2.drawString(modeName, PAD_X, y1);
        int x = PAD_X + fm1.stringWidth(modeName) + 10;

        g2.setFont(Fonts.ui(SIZE_1));
        FontMetrics fmN = g2.getFontMetrics();

        noteBox = new Rectangle(0, 0, 0, 0);
        int noteLeft = w - PAD_X;

        if (note != null && !note.isEmpty()) {
            int nw = fmN.stringWidth(note);
            if (noteIsError) {
                int bw = nw + 14;
                int bh = fmN.getHeight() + 2;
                int bx = w - PAD_X - bw;
                int by = PAD_TOP - 1;
                noteBox = new Rectangle(bx, by, bw, bh);
                g2.setColor(primary);
                g2.fillRoundRect(bx, by, bw, bh, 5, 5);
                g2.setFont(Fonts.uiBold(SIZE_1));
                g2.setColor(primaryFg);
                g2.drawString(note, bx + 7, y1);
                g2.setFont(Fonts.ui(SIZE_1));
            } else {
                g2.setColor(theme.muted);
                g2.drawString(note, w - PAD_X - nw, y1);
            }
            noteLeft = w - PAD_X - nw - 16;
        }

        if (!composition.isEmpty()) {
            String s = "조합 " + composition;
            g2.setColor(theme.muted);
            g2.drawString(clip(s, fmN, Math.max(0, noteLeft - x)), x, y1);
        }

        /* --- 아랫줄 ------------------------------------------------- */
        g2.setFont(Fonts.ui(SIZE_2));
        FontMetrics fm2 = g2.getFontMetrics();
        int y2 = PAD_TOP + fm1.getHeight() + ROW_GAP + fm2.getAscent();

        g2.setColor(theme.muted);
        g2.drawString(themeName + " · " + fontSize + "px", PAD_X, y2);

        String tap = String.format("연타 %.1f초", multitapMs / 1000.0);
        String pos = "커서 " + cursorPos + " · " + length + "자";

        int posW = fm2.stringWidth(pos);
        g2.drawString(pos, w - PAD_X - posW, y2);

        /* 연타 칸은 가운데. 순환이 살아 있는 동안만 ● 에 불이 들어온다. */
        int tapX = (w - fm2.stringWidth(tap + " ●")) / 2;
        g2.drawString(tap, tapX, y2);
        int dotX = tapX + fm2.stringWidth(tap) + 3;
        g2.setFont(Fonts.ui(9));
        g2.setColor(multitapLive ? primary : new Color(theme.muted.getRed(), theme.muted.getGreen(),
            theme.muted.getBlue(), 56));
        g2.drawString("●", dotX, y2);

        g2.dispose();
    }

    /* 자리가 모자라면 뒤를 잘라 … 을 붙인다 (웹판 text-overflow: ellipsis) */
    private static String clip(String s, FontMetrics fm, int max) {
        if (max <= 0) return "";
        if (fm.stringWidth(s) <= max) return s;
        for (int i = s.length() - 1; i > 0; i--) {
            String cut = s.substring(0, i) + "…";
            if (fm.stringWidth(cut) <= max) return cut;
        }
        return "";
    }

    @Override
    public String getToolTipText(MouseEvent e) {
        int rowTwo = PAD_TOP + getFontMetrics(Fonts.uiBold(SIZE_1)).getHeight() + ROW_GAP;

        if (e.getY() < rowTwo) {
            if (noteIsError && noteBox.contains(e.getPoint())) return "눌러서 자세히 보기";
            if (e.getX() < PAD_X + getFontMetrics(Fonts.uiBold(SIZE_1)).stringWidth(modeName) + 6) {
                return "입력 모드 (F2 로 바꿉니다)";
            }
            return "조합 중인 낱자 (초성 + 중성 + 종성)";
        }

        int w = getWidth();
        if (e.getX() > w * 2 / 3) return "커서 위치 · 전체 글자 수";
        if (e.getX() > w / 3) {
            return multitapLive
                ? "지금 같은 키를 누르면 순환이 이어집니다"
                : "순환이 끊겼습니다. 같은 키를 누르면 새 글자로 들어갑니다";
        }
        return "테마 (F3) · 글꼴 크기 (F4 에서 바꿉니다)";
    }

    @Override
    public Dimension getPreferredSize() {
        int h = PAD_TOP
            + getFontMetrics(Fonts.uiBold(SIZE_1)).getHeight()
            + ROW_GAP
            + getFontMetrics(Fonts.ui(SIZE_2)).getHeight()
            + PAD_BOTTOM;
        return new Dimension(200, h);
    }

    @Override
    public Dimension getMaximumSize() {
        return new Dimension(Integer.MAX_VALUE, getPreferredSize().height);
    }
}
