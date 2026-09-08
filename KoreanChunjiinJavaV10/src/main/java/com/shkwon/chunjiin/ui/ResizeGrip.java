/*
 * ResizeGrip.java - 창 오른쪽 아래 크기 조절 손잡이
 *
 * 창을 좁게 잡아 두었으므로 크기를 바꿀 수 있다는 표시가 눈에 보여야 한다.
 * 운영체제가 그려 주는 테두리는 얇아서 잘 안 보이므로 직접 그린다.
 *
 * 웹판은 Electron 에 창 크기를 알려 주는 다리를 따로 놓아야 했지만,
 * 여기서는 JFrame 을 바로 만질 수 있으므로 끌린 만큼 그 자리에서 키운다.
 * 최소 크기는 JFrame 의 minimumSize 가 지켜 준다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.swing.JComponent;
import javax.swing.JFrame;

public final class ResizeGrip extends JComponent {

    private Theme theme;
    private final JFrame frame;
    private Point from;
    private Dimension startSize;
    private boolean hover;

    public ResizeGrip(JFrame frame, Theme theme) {
        this.frame = frame;
        this.theme = theme;
        setOpaque(false);
        setCursor(Cursor.getPredefinedCursor(Cursor.SE_RESIZE_CURSOR));
        Dimension size = new Dimension(16, 16);
        setPreferredSize(size);
        setMinimumSize(size);
        setMaximumSize(size);   /* 안 그러면 BoxLayout 이 늘려서 가운데로 밀린다 */
        setToolTipText("끌어서 창 크기 바꾸기");

        MouseAdapter m = new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                if (e.getButton() != MouseEvent.BUTTON1) return;
                /* 화면 기준 좌표라야 창이 커지는 동안에도 어긋나지 않는다 */
                from = e.getLocationOnScreen();
                startSize = frame.getSize();
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                if (from == null) return;
                Point now = e.getLocationOnScreen();
                frame.setSize(startSize.width + (now.x - from.x), startSize.height + (now.y - from.y));
                frame.validate();
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                from = null;
            }

            @Override
            public void mouseEntered(MouseEvent e) {
                hover = true;
                repaint();
            }

            @Override
            public void mouseExited(MouseEvent e) {
                hover = false;
                repaint();
            }
        };
        addMouseListener(m);
        addMouseMotionListener(m);
    }

    public void setTheme(Theme t) {
        this.theme = t;
        repaint();
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setColor(hover ? theme.role(Theme.Role.PRIMARY).bg : theme.muted);

        /* 웹판과 같은 여섯 점 배치 */
        int[][] dots = {{12, 12}, {8, 12}, {12, 8}, {4, 12}, {12, 4}, {8, 8}};
        for (int[] d : dots) {
            g2.fillOval(d[0] - 1, d[1] - 1, 3, 3);
        }
        g2.dispose();
    }
}
