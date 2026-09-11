/*
 * ModalDialog.java - 설정 · 사용법 · 프로그램 정보 · 오류 창의 껍데기
 *
 * 웹판 Modal.jsx 에 해당한다. 본체 창과 마찬가지로 운영체제 장식을 끄고
 * 제목줄을 직접 그린다. 창 하나만 테마 색이고 다른 하나는 운영체제 색이면
 * 어울리지 않기 때문이다. 옮기기 · 크기 바꾸기도 본체와 같은 부품이 맡는다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.GraphicsConfiguration;
import java.awt.GraphicsEnvironment;
import java.awt.Insets;
import java.awt.Rectangle;
import java.awt.Toolkit;
import java.awt.Window;
import java.awt.event.ActionEvent;
import java.awt.event.KeyEvent;
import javax.swing.AbstractAction;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JPanel;
import javax.swing.KeyStroke;

public class ModalDialog extends JDialog {

    /* 창 가장자리에서 이 안쪽까지가 크기 조절 자리다 (WindowResizer 와 같은 값) */
    private static final int EDGE = 5;

    protected final Theme theme;
    private final TitleBar titleBar;
    private final JPanel body = new JPanel();
    private final JPanel foot = new JPanel();

    /*
     * this-escape 경고를 끈다. 이 창은 물려받으라고 만든 것이라 final 로 닫을 수
     * 없고, 창을 꾸미려면 생성자에서 setUndecorated 같은 것을 불러야 한다.
     *
     * 새어 나간 this 가 실제로 쓰이지는 않는지 확인했다.
     *   - TitleBar 는 getIconImages() 만 읽는다. 바로 윗줄에서 채워 넣은 값이고
     *     하위 넷(About·Error·Help·Settings) 가운데 그것을 재정의한 곳은 없다.
     *   - onCancel() 은 하위에서 재정의하지만, 닫기 단추와 Esc 에서만 불린다.
     *     둘 다 창이 다 만들어진 뒤의 일이다.
     * 하위 클래스가 늘거나 위 둘을 건드리게 되면 여기부터 다시 보아야 한다.
     */
    @SuppressWarnings("this-escape")
    public ModalDialog(Window owner, Theme theme, String title, boolean wide) {
        super(owner, title, ModalityType.APPLICATION_MODAL);
        this.theme = theme;

        setUndecorated(true);
        if (owner != null) setIconImages(owner.getIconImages());
        titleBar = new TitleBar(this, theme, false);

        body.setBackground(theme.card);
        body.setOpaque(true);
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setBorder(BorderFactory.createEmptyBorder(16, 16, 16, 16));

        foot.setBackground(theme.card);
        foot.setOpaque(true);
        foot.setLayout(new BoxLayout(foot, BoxLayout.X_AXIS));
        foot.setBorder(BorderFactory.createEmptyBorder(12, 16, 12, 16));
        foot.add(Box.createHorizontalGlue());

        JPanel content = new JPanel(new BorderLayout());
        content.setBackground(theme.card);
        content.add(body, BorderLayout.CENTER);
        content.add(foot, BorderLayout.SOUTH);

        JPanel shell = new JPanel(new BorderLayout()) {
            @Override
            protected void paintComponent(Graphics g) {
                g.setColor(theme.card);
                g.fillRect(0, 0, getWidth(), getHeight());
                /* 창 장식이 없으므로 바탕과 창의 경계를 직접 그어 준다 */
                g.setColor(theme.border);
                g.drawRect(0, 0, getWidth() - 1, getHeight() - 1);
            }
        };
        shell.setOpaque(false);
        shell.setBorder(BorderFactory.createEmptyBorder(EDGE, EDGE, EDGE, EDGE));
        shell.add(titleBar, BorderLayout.NORTH);
        shell.add(content, BorderLayout.CENTER);

        setContentPane(shell);
        WindowResizer.install(this, shell);

        setDefaultCloseOperation(DISPOSE_ON_CLOSE);

        /* 제목줄의 닫기 단추와 Esc 가 같은 자리로 간다 */
        addWindowListener(new java.awt.event.WindowAdapter() {
            @Override
            public void windowClosing(java.awt.event.WindowEvent e) {
                onCancel();
            }
        });

        shell.getInputMap(JComponent.WHEN_IN_FOCUSED_WINDOW)
            .put(KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE, 0), "close");
        shell.getActionMap().put("close", new AbstractAction() {
            @Override
            public void actionPerformed(ActionEvent e) {
                onCancel();
            }
        });

        setMinimumSize(new Dimension(wide ? 640 : 420, 240));
    }

    /* 본문에 부품을 얹는다. */
    protected void addBody(Component c) {
        if (c instanceof JComponent jc) jc.setAlignmentX(Component.LEFT_ALIGNMENT);
        body.add(c);
    }

    protected JPanel bodyPanel() {
        return body;
    }

    /* 아래 단추줄에 단추를 얹는다. 나중에 얹은 것이 오른쪽에 온다. */
    protected KeyButton addButton(String text, boolean primary, Runnable onClick) {
        KeyButton b = new KeyButton(theme, primary ? Theme.Role.PRIMARY : Theme.Role.FN)
            .label(text)
            .font(14, false)
            .onClick(onClick);
        Dimension d = new Dimension(Math.max(84, b.getPreferredSize().width + 16), 34);
        b.setPreferredSize(d);
        b.setMinimumSize(d);
        b.setMaximumSize(d);
        if (foot.getComponentCount() > 1) foot.add(Box.createHorizontalStrut(8));
        foot.add(b);
        return b;
    }

    /* Esc 나 창 닫기를 눌렀을 때. 설정 창은 이걸 가로채 되돌린다. */
    protected void onCancel() {
        dispose();
    }

    /*
     * 다 짓고 나서 부른다. 내용이 다 보이는 크기로 맞추고 부모 가운데에 띄운다.
     *
     * 스크롤바는 두지 않는다. 내용이 길면 창이 그만큼 길어지고,
     * 화면(작업 영역)을 넘어설 것 같을 때만 거기에 맞춘다.
     */
    protected void ready(Window owner) {
        pack();

        Rectangle screen = usableScreen(owner);
        Dimension d = getSize();
        Dimension min = getMinimumSize();

        setSize(
            Math.min(Math.max(d.width, min.width), screen.width - 40),
            Math.min(Math.max(d.height, 240), screen.height - 40));
        setLocationRelativeTo(owner);
    }

    /* 작업 표시줄 따위를 뺀, 실제로 창을 놓을 수 있는 자리 */
    private static Rectangle usableScreen(Window owner) {
        GraphicsConfiguration gc = owner != null ? owner.getGraphicsConfiguration()
            : GraphicsEnvironment.getLocalGraphicsEnvironment()
                .getDefaultScreenDevice().getDefaultConfiguration();

        Rectangle b = gc.getBounds();
        Insets in = Toolkit.getDefaultToolkit().getScreenInsets(gc);
        return new Rectangle(b.x + in.left, b.y + in.top,
            b.width - in.left - in.right, b.height - in.top - in.bottom);
    }
}
