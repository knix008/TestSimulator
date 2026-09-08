/*
 * MainFrame.java - 화면 전체를 엮는다.
 *
 * 원본 main.c 가 하던 일 - 키보드 처리, 툴바 · 상태줄 · 키패드 그리기,
 * 파일 · 클립보드 · 설정 - 을 그대로 옮겼다. 조합 자체는 손대지 않고
 * engine 패키지의 오토마타에 맡긴다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Platform;
import com.shkwon.chunjiin.Settings;
import com.shkwon.chunjiin.Theme;
import com.shkwon.chunjiin.Version;
import com.shkwon.chunjiin.engine.Chunjiin;
import com.shkwon.chunjiin.engine.ChunjiinState;
import com.shkwon.chunjiin.engine.Input;
import com.shkwon.chunjiin.engine.Mode;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.KeyboardFocusManager;
import java.awt.RenderingHints;
import java.awt.Toolkit;
import java.awt.event.KeyEvent;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JFrame;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.ScrollPaneConstants;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import javax.swing.ToolTipManager;

public final class MainFrame extends JFrame {

    /* 웹판 --gap. 아래쪽은 손잡이가 앉을 자리만큼 더 띄운다. */
    private static final int GAP = 6;
    private static final int BOTTOM = 20;
    private static final int RADIUS = 10;
    /* 창 가장자리에서 이 안쪽까지가 크기 조절 자리다 (WindowResizer 와 같은 값) */
    private static final int EDGE = 5;

    private final ChunjiinState st = Input.createState();
    private Settings settings = Settings.load();
    private Theme theme;

    private final JPanel root;
    private JPanel shell;
    private final TitleBar titleBar;
    private ToolbarPanel toolbar;
    private final CardPanel card;
    private final EditorPanel editor;
    private final JScrollPane editorScroll;
    private final StatusBar statusBar;
    private final KeypadPanel keypad;
    private final ResizeGrip grip;

    /* 연타 순환 시계와 상태줄 알림 시계 */
    private final Timer tapTimer;
    private final Timer noteTimer;
    private boolean tapLive;

    private String note;
    private boolean noteIsError;
    private ErrorDialog.Info lastError;

    private final String mod = Platform.IS_MAC ? "⌘" : "Ctrl";

    public MainFrame() {
        super(Version.APP_NAME);

        theme = Theme.get(settings.theme);
        Input.setMode(st, Mode.of(settings.startMode));

        setIconImages(AppIcons.load());
        setDefaultCloseOperation(EXIT_ON_CLOSE);

        /*
         * 운영체제가 그려 주는 제목줄은 색을 바꿀 수 없으므로 장식을 끄고
         * TitleBar 가 직접 그린다. 그 대신 창을 옮기고 크기를 바꾸는 일도
         * TitleBar 와 WindowResizer 가 맡는다.
         */
        setUndecorated(true);
        setSize(400, 820);

        /* 설명 풍선은 기본값보다 훨씬 빨리 뜨게 한다 (웹판 130ms) */
        ToolTipManager.sharedInstance().setInitialDelay(130);
        ToolTipManager.sharedInstance().setDismissDelay(10_000);
        ToolTipManager.sharedInstance().setReshowDelay(0);

        Map<String, String> accel = new HashMap<>();
        accel.put("new", mod + "+N");
        accel.put("open", mod + "+O");
        accel.put("save", mod + "+S");
        accel.put("copy", mod + "+C");
        accel.put("paste", mod + "+V");

        toolbar = new ToolbarPanel(theme, this::command, accel);

        editor = new EditorPanel(theme);
        editor.setOnSetCursor(at -> {
            Input.setCursor(st, at);
            stopMultitap();
            refresh();
        });

        editorScroll = new JScrollPane(editor,
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
        editorScroll.setBorder(BorderFactory.createEmptyBorder());
        editorScroll.getVerticalScrollBar().setUnitIncrement(24);

        card = new CardPanel();
        card.setLayout(new BorderLayout());
        card.setBorder(BorderFactory.createEmptyBorder(1, 1, 1, 1));
        card.add(editorScroll, BorderLayout.CENTER);

        statusBar = new StatusBar(theme);
        statusBar.setOnNoteClick(() -> {
            if (lastError != null) showErrorDialog(lastError);
        });

        keypad = new KeypadPanel(theme, this::doKey, this::fnKey);

        root = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                g.setColor(theme.wnd);
                g.fillRect(0, 0, getWidth(), getHeight());
            }
        };
        root.setLayout(new BoxLayout(root, BoxLayout.Y_AXIS));
        root.setBorder(BorderFactory.createEmptyBorder(GAP, GAP, 2, GAP));

        grip = new ResizeGrip(this, theme);
        titleBar = new TitleBar(this, theme, true);

        /*
         * 껍데기 하나가 제목줄과 본문을 담고, 가장자리 EDGE 만큼을 빈 테두리로 남긴다.
         * 그 테두리에는 부품이 없으므로 마우스가 거기 오면 껍데기가 받는다 -
         * 그것이 크기 조절 자리다.
         */
        shell = new JPanel(new BorderLayout()) {
            @Override
            protected void paintComponent(Graphics g) {
                g.setColor(theme.wnd);
                g.fillRect(0, 0, getWidth(), getHeight());
                /* 창 장식이 없으므로 바탕 화면과 창의 경계를 직접 그어 준다 */
                g.setColor(theme.border);
                g.drawRect(0, 0, getWidth() - 1, getHeight() - 1);
            }
        };
        shell.setOpaque(false);
        shell.setBorder(BorderFactory.createEmptyBorder(EDGE, EDGE, EDGE, EDGE));
        shell.add(titleBar, BorderLayout.NORTH);
        shell.add(root, BorderLayout.CENTER);

        setContentPane(shell);
        WindowResizer.install(this, shell);

        rebuildLayout();

        /*
         * 최소 폭은 툴바가 정한다. 툴바 단추는 절대 접히거나 잘리지 않아야 하므로
         * 그것이 온전히 들어가는 폭 아래로는 줄지 않게 한다.
         */
        int needed = Math.max(toolbar.getMinimumSize().width, titleBar.getMinimumSize().width);
        setMinimumSize(new Dimension(needed + GAP * 2 + EDGE * 2, 520));

        tapTimer = new Timer(settings.multitapMs, e -> {
            Input.breakMultitap(st);
            tapLive = false;
            refresh();
        });
        tapTimer.setRepeats(false);

        noteTimer = new Timer(2600, e -> {
            note = null;
            refresh();
        });
        noteTimer.setRepeats(false);

        installKeyboard();
        applyTheme();
        refresh();

        SwingUtilities.invokeLater(editor::requestFocusInWindow);
    }

    /* ------------------------------------------------------------------ */
    /* 뼈대 다시 짜기 (툴바 · 상태줄 보이기가 바뀔 때)                     */
    /* ------------------------------------------------------------------ */

    private void rebuildLayout() {
        root.removeAll();

        if (settings.showToolbar) {
            root.add(toolbar);
            root.add(Box.createVerticalStrut(GAP));
        }
        root.add(card);
        root.add(Box.createVerticalStrut(GAP));
        if (settings.showStatus) {
            root.add(statusBar);
            root.add(Box.createVerticalStrut(GAP));
        }
        root.add(keypad);

        /* 크기 조절 손잡이는 맨 아래 오른쪽 구석에 */
        JPanel gripRow = new JPanel();
        gripRow.setOpaque(false);
        gripRow.setLayout(new BoxLayout(gripRow, BoxLayout.X_AXIS));
        gripRow.setMaximumSize(new Dimension(Integer.MAX_VALUE, 18));
        gripRow.add(Box.createHorizontalGlue());
        gripRow.add(grip);
        root.add(gripRow);

        root.revalidate();
        root.repaint();
    }

    /* ------------------------------------------------------------------ */
    /* 화면 갱신                                                           */
    /* ------------------------------------------------------------------ */

    private void refresh() {
        editor.update(st.textString(), st.cursorPos, st.composeLen);

        String[] labels = new String[Chunjiin.KEY_COUNT];
        for (int k = 0; k < labels.length; k++) labels[k] = Input.keyLabel(st, k);
        keypad.update(labels, st.nowMode == Mode.HANGUL);

        statusBar.update(
            Input.modeName(st),
            Input.compositionText(st),
            st.cursorPos,
            st.textLength(),
            theme.name,
            settings.fontSize,
            settings.multitapMs,
            tapLive,
            note,
            noteIsError);
    }

    private void applyTheme() {
        toolbar.setTheme(theme);
        editor.setTheme(theme);
        editor.setFontSize(settings.fontSize);
        statusBar.setTheme(theme);
        keypad.setTheme(theme);
        grip.setTheme(theme);
        titleBar.setTheme(theme);
        card.repaint();
        editorScroll.getViewport().setBackground(theme.card);
        if (shell != null) shell.repaint();

        setTitle(Version.APP_NAME + " - " + theme.name);
        titleBar.repaint();
        root.repaint();
    }

    /* 상태줄 오른쪽에 잠깐 뜨는 알림 */
    private void flash(String text) {
        note = text;
        noteIsError = false;
        noteTimer.restart();
        refresh();
    }

    /*
     * 오류를 알린다.
     * 상태줄에는 한 줄로 남겨 두고(눌러서 다시 열 수 있다), 창을 띄워
     * 무엇을 하다가 어디서 어떻게 틀어졌는지 통째로 복사할 수 있게 한다.
     */
    private void showError(String what, Throwable cause) {
        String message = cause == null ? "알 수 없는 오류"
            : (cause.getMessage() == null ? cause.toString() : cause.getMessage());

        StringBuilder detail = new StringBuilder();
        if (cause != null) {
            detail.append(cause.getClass().getName()).append(": ").append(message).append('\n');
            for (StackTraceElement el : cause.getStackTrace()) detail.append("    at ").append(el).append('\n');
        }

        ErrorDialog.Info info = new ErrorDialog.Info(
            what,
            LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy. M. d. a h:mm:ss")),
            Version.APP_NAME + " " + Version.APP_VERSION + " · Java " + System.getProperty("java.version")
                + " · " + Platform.platformName(),
            message,
            detail.toString());

        lastError = info;
        note = what + " 실패";
        noteIsError = true;
        noteTimer.stop();
        refresh();
        showErrorDialog(info);
    }

    private void showErrorDialog(ErrorDialog.Info info) {
        new ErrorDialog(this, theme, info).setVisible(true);
    }

    /*
     * 연타 순환 시계.
     * 정해진 시간이 지나면 다음 같은 키는 순환이 아니라 새 문자로 시작한다.
     */
    private void armMultitap() {
        tapLive = true;
        tapTimer.setInitialDelay(settings.multitapMs);
        tapTimer.restart();
    }

    /* 커서 이동·모드 전환처럼 순환을 곧바로 끊는 자리에서 부른다 */
    private void stopMultitap() {
        tapTimer.stop();
        tapLive = false;
    }

    /* ------------------------------------------------------------------ */
    /* 편집 명령                                                           */
    /* ------------------------------------------------------------------ */

    private void doKey(int key) {
        Input.processInput(st, key);
        armMultitap();
        refresh();
    }

    private void fnKey(String id) {
        switch (id) {
            case "mode": command("mode"); return;
            case "left": Input.moveCursor(st, -1); break;
            case "right": Input.moveCursor(st, 1); break;
            case "space": Input.space(st); break;
            case "enter": Input.insertChar(st, '\n'); break;
            case "backspace": Input.backspace(st); break;
            default: return;
        }
        stopMultitap();
        refresh();
    }

    private void doCopy() {
        if (st.textLength() == 0) {
            flash("복사할 글이 없습니다");
            return;
        }
        try {
            if (Platform.copyToClipboard(st.textString())) flash("복사했습니다");
            else throw new IllegalStateException("클립보드에 쓸 수 없습니다. 다른 프로그램이 붙잡고 있는지 보세요.");
        } catch (Exception e) {
            showError("복사", e);
        }
    }

    private void doPaste() {
        String text = Platform.readClipboard();
        if (text == null) {
            flash("붙여넣을 수 없습니다");
            return;
        }
        Input.commit(st);
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\r') continue;
            Input.insertChar(st, ch);
        }
        refresh();
    }

    private void doOpen() {
        try {
            Platform.TextFile file = Platform.openTextFile(this);
            if (file == null) return;

            Input.clear(st);
            for (int i = 0; i < file.text.length(); i++) {
                char ch = file.text.charAt(i);
                if (ch == '\r') continue;
                Input.insertChar(st, ch);
            }
            stopMultitap();
            refresh();                      /* 커서는 원본과 같이 글 끝에 둔다 */
            flash(file.name + " 을(를) 열었습니다");
        } catch (Exception e) {
            showError("파일 열기", e);
        }
    }

    private void doSave() {
        try {
            Input.commit(st);
            String name = Platform.saveTextFile(this, st.textString());
            refresh();
            if (name != null) flash(name + " 에 저장했습니다");
        } catch (Exception e) {
            showError("파일 저장", e);
        }
    }

    private void cycleTheme() {
        settings.theme = (settings.theme + 1) % Theme.THEME_COUNT;
        settings.save();
        theme = Theme.get(settings.theme);
        applyTheme();
        refresh();
    }

    private void command(String id) {
        switch (id) {
            case "new":
            case "clear":
                Input.clear(st);
                stopMultitap();
                refresh();
                break;
            case "open": doOpen(); break;
            case "save": doSave(); break;
            case "copy": doCopy(); break;
            case "paste": doPaste(); break;
            case "mode":
                Input.cycleMode(st);
                stopMultitap();
                refresh();
                break;
            case "theme": cycleTheme(); break;
            case "settings": openSettings(); break;
            case "help": openHelp(); break;
            case "about": openAbout(); break;
            default: break;
        }
    }

    /* ------------------------------------------------------------------ */
    /* 대화상자                                                            */
    /* ------------------------------------------------------------------ */

    private void openSettings() {
        new SettingsDialog(this, theme, settings,
            next -> {                       /* 고르는 즉시 화면에 적용 */
                applySettings(next);
            },
            next -> {                       /* 확인을 누르면 저장 */
                applySettings(next);
                next.save();
            }).setVisible(true);
    }

    private void applySettings(Settings next) {
        boolean layoutChanged = next.showToolbar != settings.showToolbar
            || next.showStatus != settings.showStatus;
        settings = next;
        theme = Theme.get(settings.theme);
        if (layoutChanged) rebuildLayout();
        applyTheme();
        refresh();
    }

    private void openHelp() {
        new HelpDialog(this, theme, mod).setVisible(true);
    }

    private void openAbout() {
        new AboutDialog(this, theme, theme.name, this::openHelp).setVisible(true);
    }

    /* ------------------------------------------------------------------ */
    /* 물리 키보드                                                         */
    /* ------------------------------------------------------------------ */

    /* 한글 모드에서 숫자열을 키패드에 대응시킨다. 없으면 -1. */
    private static int codeToKeyHangul(int code) {
        switch (code) {
            case KeyEvent.VK_1: return 0;
            case KeyEvent.VK_2: return 1;
            case KeyEvent.VK_3: return 2;
            case KeyEvent.VK_4: return 3;
            case KeyEvent.VK_5: return 4;
            case KeyEvent.VK_6: return 5;
            case KeyEvent.VK_7: return 6;
            case KeyEvent.VK_8: return 7;
            case KeyEvent.VK_9: return 8;
            case KeyEvent.VK_MINUS: return 9;
            case KeyEvent.VK_0: return 10;
            case KeyEvent.VK_EQUALS: return 11;
            default: return -1;
        }
    }

    /* 숫자패드는 모든 모드에서 키패드로 쓴다. 없으면 -1. */
    private static int codeToKeyNumpad(int code) {
        switch (code) {
            case KeyEvent.VK_NUMPAD7: return 0;
            case KeyEvent.VK_NUMPAD8: return 1;
            case KeyEvent.VK_NUMPAD9: return 2;
            case KeyEvent.VK_NUMPAD4: return 3;
            case KeyEvent.VK_NUMPAD5: return 4;
            case KeyEvent.VK_NUMPAD6: return 5;
            case KeyEvent.VK_NUMPAD1: return 6;
            case KeyEvent.VK_NUMPAD2: return 7;
            case KeyEvent.VK_NUMPAD3: return 8;
            case KeyEvent.VK_DIVIDE: return 9;
            case KeyEvent.VK_NUMPAD0: return 10;
            case KeyEvent.VK_MULTIPLY: return 11;
            default: return -1;
        }
    }

    /*
     * 창 어디에 있든 키를 받는다.
     * 웹판이 window 에 keydown 을 걸어 둔 것과 같은 자리다.
     */
    private void installKeyboard() {
        KeyboardFocusManager.getCurrentKeyboardFocusManager().addKeyEventDispatcher(e -> {
            /* 대화상자가 떠 있으면 그 쪽이 키를 갖는다 */
            if (!isActive() || windowOf(e.getComponent()) != this) return false;

            if (e.getID() == KeyEvent.KEY_PRESSED) return onKeyPressed(e);
            if (e.getID() == KeyEvent.KEY_TYPED) return onKeyTyped(e);
            return false;
        });
    }

    /*
     * 키를 받은 부품이 어느 창에 속하는지.
     *
     * getWindowAncestor() 는 창 자신을 넘기면 null 을 돌려준다(창 위에는 창이 없으므로).
     * 포커스가 부품이 아니라 창 자체에 놓이는 자리가 있어서 - 대화상자를 닫은 직후가
     * 그렇다 - 그것까지 챙기지 않으면 키가 통째로 무시된다.
     */
    private static java.awt.Window windowOf(java.awt.Component c) {
        if (c == null) return null;
        return c instanceof java.awt.Window w ? w : SwingUtilities.getWindowAncestor(c);
    }

    private boolean onKeyPressed(KeyEvent e) {
        int accelMask = Toolkit.getDefaultToolkit().getMenuShortcutKeyMaskEx();
        boolean accel = (e.getModifiersEx() & accelMask) != 0;

        if (accel && !e.isAltDown()) {
            switch (e.getKeyCode()) {
                case KeyEvent.VK_C: doCopy(); return true;
                case KeyEvent.VK_V: doPaste(); return true;
                case KeyEvent.VK_S: doSave(); return true;
                case KeyEvent.VK_O: doOpen(); return true;
                case KeyEvent.VK_N: Input.clear(st); stopMultitap(); refresh(); return true;
                default: return true;   /* 다른 단축키는 흘려보내지 않는다 */
            }
        }
        if (e.isAltDown() || e.isMetaDown()) return false;

        /* 숫자패드는 모든 모드에서, 숫자열은 한글 모드에서만 키패드가 된다 */
        int key = codeToKeyNumpad(e.getKeyCode());
        if (key < 0 && st.nowMode == Mode.HANGUL && !e.isShiftDown()) {
            key = codeToKeyHangul(e.getKeyCode());
        }
        if (key >= 0 && key < Chunjiin.KEY_COUNT) {
            doKey(key);
            return true;
        }

        switch (e.getKeyCode()) {
            case KeyEvent.VK_SPACE: Input.space(st); done(); return true;
            case KeyEvent.VK_BACK_SPACE: Input.backspace(st); done(); return true;
            case KeyEvent.VK_ENTER: Input.insertChar(st, '\n'); done(); return true;
            case KeyEvent.VK_LEFT: Input.moveCursor(st, -1); done(); return true;
            case KeyEvent.VK_RIGHT: Input.moveCursor(st, 1); done(); return true;
            case KeyEvent.VK_HOME: Input.setCursor(st, 0); done(); return true;
            case KeyEvent.VK_END: Input.setCursor(st, st.textLength()); done(); return true;
            case KeyEvent.VK_DELETE:
                if (st.cursorPos < st.textLength()) {
                    Input.moveCursor(st, 1);
                    Input.backspace(st);
                }
                done();
                return true;
            case KeyEvent.VK_ESCAPE: Input.commit(st); done(); return true;
            case KeyEvent.VK_F1: openHelp(); return true;
            case KeyEvent.VK_F2: command("mode"); return true;
            case KeyEvent.VK_F3: cycleTheme(); return true;
            case KeyEvent.VK_F4: openSettings(); return true;
            default: return false;
        }
    }

    /* 영문 · 숫자 · 기호 모드에서는 키보드로 그냥 타이핑한다 */
    private boolean onKeyTyped(KeyEvent e) {
        if (st.nowMode == Mode.HANGUL) return false;

        char ch = e.getKeyChar();
        if (ch < ' ' || ch == 127) return false;
        if (e.isControlDown() || e.isAltDown() || e.isMetaDown()) return false;

        Input.insertChar(st, ch);
        done();
        return true;
    }

    private void done() {
        stopMultitap();
        refresh();
    }

    /* ------------------------------------------------------------------ */
    /* 화면 시험(AppSmokeTest)이 들여다보는 창구                           */
    /* ------------------------------------------------------------------ */

    /* 지금 편집 버퍼에 들어 있는 글 */
    public String editorText() {
        return st.textString();
    }

    /* 지금 입력 모드 이름 ("한글", "영문 abc" ...) */
    public String modeNameNow() {
        return Input.modeName(st);
    }

    /* 지금 테마 이름 */
    public String themeNameNow() {
        return theme.name;
    }

    /* 툴바 · 상태줄이 화면에 붙어 있는지 */
    public boolean toolbarShown() {
        return toolbar.getParent() != null;
    }

    public boolean statusShown() {
        return statusBar.getParent() != null;
    }

    /* ------------------------------------------------------------------ */
    /* 편집 영역을 감싼 카드                                               */
    /* ------------------------------------------------------------------ */

    private final class CardPanel extends JPanel {
        CardPanel() {
            setOpaque(false);
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setColor(theme.card);
            g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, RADIUS, RADIUS);
            g2.setColor(theme.border);
            g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, RADIUS, RADIUS);
            g2.dispose();
        }
    }

    /* 창 아이콘 (C 판 assets 에서 가져온 것을 그대로 쓴다) */
    private static final class AppIcons {
        static java.util.List<java.awt.Image> load() {
            java.util.List<java.awt.Image> images = new java.util.ArrayList<>();
            for (String size : new String[] {"16x16", "24x24", "32x32", "48x48", "64x64", "128x128", "256x256"}) {
                java.net.URL url = MainFrame.class.getResource("/icons/" + size + ".png");
                if (url != null) images.add(new ImageIcon(url).getImage());
            }
            return images;
        }
    }

    /* 오류 창에서 쓰는 것과 같은 색 계산이 필요할 때 */
    static Color fade(Color c, int alpha) {
        return new Color(c.getRed(), c.getGreen(), c.getBlue(), alpha);
    }
}
