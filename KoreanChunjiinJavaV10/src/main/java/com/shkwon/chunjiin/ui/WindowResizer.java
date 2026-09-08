/*
 * WindowResizer.java - 창 가장자리를 끌어 크기 바꾸기
 *
 * 창 장식을 끄면(`setUndecorated`) 운영체제가 그려 주던 조절 테두리도 없어진다.
 * 그래서 창 안쪽 가장자리 몇 픽셀을 조절 자리로 삼아 직접 받는다.
 * 여덟 방향 모두 되고, 마우스 모양도 방향에 맞춰 바뀐다.
 *
 * 최소 크기는 창의 minimumSize 가 지켜 준다.
 */
package com.shkwon.chunjiin.ui;

import java.awt.Component;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

public final class WindowResizer extends MouseAdapter {

    /* 가장자리에서 이 안쪽까지가 조절 자리다 */
    private static final int EDGE = 5;

    private static final int NONE = 0;
    private static final int N = 1;
    private static final int S = 2;
    private static final int W = 4;
    private static final int E = 8;

    private final Window window;

    private int dragEdge = NONE;
    private Point dragFrom;
    private Rectangle startBounds;

    private WindowResizer(Window window) {
        this.window = window;
    }

    /*
     * 크기 조절 자리를 맡을 부품에 단다.
     *
     * 본문을 EDGE 만큼 안쪽으로 들여놓으면 그 바깥 띠에는 부품이 없다.
     * Swing 은 마우스 아래 가장 깊은 부품에게 이벤트를 주므로, 그 띠에서만
     * 여기 달린 것이 불린다. 유리판을 덮을 필요가 없다.
     */
    public static void install(Window window, Component edgeArea) {
        WindowResizer r = new WindowResizer(window);
        edgeArea.addMouseListener(r);
        edgeArea.addMouseMotionListener(r);
    }

    private boolean maximized() {
        return window instanceof Frame f && (f.getExtendedState() & Frame.MAXIMIZED_BOTH) != 0;
    }

    /* 창 좌표 기준 (x, y) 가 어느 가장자리인가 */
    private int edgeAt(Point onScreen) {
        Rectangle b = window.getBounds();
        int x = onScreen.x - b.x;
        int y = onScreen.y - b.y;

        int edge = NONE;
        if (x <= EDGE) edge |= W;
        else if (x >= b.width - EDGE) edge |= E;
        if (y <= EDGE) edge |= N;
        else if (y >= b.height - EDGE) edge |= S;
        return edge;
    }

    private static int cursorFor(int edge) {
        switch (edge) {
            case N: return Cursor.N_RESIZE_CURSOR;
            case S: return Cursor.S_RESIZE_CURSOR;
            case W: return Cursor.W_RESIZE_CURSOR;
            case E: return Cursor.E_RESIZE_CURSOR;
            case N | W: return Cursor.NW_RESIZE_CURSOR;
            case N | E: return Cursor.NE_RESIZE_CURSOR;
            case S | W: return Cursor.SW_RESIZE_CURSOR;
            case S | E: return Cursor.SE_RESIZE_CURSOR;
            default: return Cursor.DEFAULT_CURSOR;
        }
    }

    @Override
    public void mouseMoved(MouseEvent e) {
        if (maximized()) return;
        int edge = edgeAt(e.getLocationOnScreen());
        Component c = (Component) e.getSource();
        c.setCursor(Cursor.getPredefinedCursor(cursorFor(edge)));
    }

    @Override
    public void mouseExited(MouseEvent e) {
        if (dragEdge == NONE) ((Component) e.getSource()).setCursor(Cursor.getDefaultCursor());
    }

    @Override
    public void mousePressed(MouseEvent e) {
        if (e.getButton() != MouseEvent.BUTTON1 || maximized()) return;
        dragEdge = edgeAt(e.getLocationOnScreen());
        if (dragEdge == NONE) return;
        dragFrom = e.getLocationOnScreen();
        startBounds = window.getBounds();
    }

    @Override
    public void mouseDragged(MouseEvent e) {
        if (dragEdge == NONE) return;

        Point now = e.getLocationOnScreen();
        int dx = now.x - dragFrom.x;
        int dy = now.y - dragFrom.y;

        Dimension min = window.getMinimumSize();
        Rectangle b = new Rectangle(startBounds);

        if ((dragEdge & E) != 0) b.width = Math.max(min.width, startBounds.width + dx);
        if ((dragEdge & S) != 0) b.height = Math.max(min.height, startBounds.height + dy);
        if ((dragEdge & W) != 0) {
            /* 왼쪽·위쪽은 크기와 자리를 함께 옮겨야 반대쪽 모서리가 제자리에 있다 */
            b.width = Math.max(min.width, startBounds.width - dx);
            b.x = startBounds.x + startBounds.width - b.width;
        }
        if ((dragEdge & N) != 0) {
            b.height = Math.max(min.height, startBounds.height - dy);
            b.y = startBounds.y + startBounds.height - b.height;
        }

        window.setBounds(b);
        window.validate();
    }

    @Override
    public void mouseReleased(MouseEvent e) {
        dragEdge = NONE;
        if (e.getSource() instanceof Component c) {
            c.setCursor(Cursor.getPredefinedCursor(cursorFor(edgeAt(e.getLocationOnScreen()))));
        }
    }
}
