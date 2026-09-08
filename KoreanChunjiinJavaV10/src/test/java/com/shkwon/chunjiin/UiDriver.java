/*
 * UiDriver.java - 창을 띄우고 키를 눌러 주는 도우미
 *
 * 화면 시험(AppSmokeTest)과 그림 찍기(Screenshots)가 함께 쓴다.
 *
 * 창을 앞으로 내는 것만으로는 모자란다. Windows 는 다른 프로그램이 포커스를
 * 가로채는 것을 막으므로 toFront() 만으로는 활성 창이 되지 않을 때가 있고,
 * MainFrame 은 활성 창이 아니면 키를 받지 않는다(그게 맞는 동작이다).
 * 그래서 Robot 으로 편집 영역을 한 번 눌러 진짜로 활성화시킨다.
 */
package com.shkwon.chunjiin;

import com.shkwon.chunjiin.ui.MainFrame;

import java.awt.Point;
import java.awt.Rectangle;
import java.awt.Robot;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.util.concurrent.atomic.AtomicReference;
import javax.swing.SwingUtilities;

final class UiDriver {

    final MainFrame frame;
    final Robot robot;

    private UiDriver(MainFrame frame, Robot robot) {
        this.frame = frame;
        this.robot = robot;
    }

    /* 창을 띄우고, 키를 받을 수 있는 상태가 될 때까지 지켜본다. */
    static UiDriver launch() throws Exception {
        AtomicReference<MainFrame> ref = new AtomicReference<>();
        SwingUtilities.invokeAndWait(() -> {
            MainFrame f = new MainFrame();
            f.setVisible(true);
            ref.set(f);
        });
        MainFrame frame = ref.get();

        Robot robot = new Robot();
        robot.setAutoWaitForIdle(true);
        robot.delay(700);

        SwingUtilities.invokeAndWait(() -> {
            frame.setAlwaysOnTop(true);
            frame.toFront();
            frame.requestFocus();
        });

        UiDriver ui = new UiDriver(frame, robot);
        ui.clickEditor();

        /* 정말로 활성 창이 되었는지 본다. 안 되면 한 번 더 눌러 본다. */
        for (int i = 0; i < 20 && !frame.isActive(); i++) {
            robot.delay(150);
            if (i % 5 == 4) ui.clickEditor();
        }
        robot.delay(300);
        return ui;
    }

    /* 편집 영역 한가운데를 누른다. 창이 활성화되고 포커스가 편집 영역으로 간다. */
    void clickEditor() {
        Rectangle b = frame.getBounds();
        Point p = new Point(b.x + b.width / 2, b.y + b.height / 4);
        robot.mouseMove(p.x, p.y);
        robot.mousePress(InputEvent.BUTTON1_DOWN_MASK);
        robot.mouseRelease(InputEvent.BUTTON1_DOWN_MASK);
        robot.delay(120);
    }

    void close() throws Exception {
        SwingUtilities.invokeAndWait(() -> {
            frame.setAlwaysOnTop(false);
            frame.dispose();
        });
    }

    /*
     * 키를 누르기 전에 창이 아직 활성인지 본다.
     *
     * 시험이 도는 동안 다른 프로그램이 앞으로 나오면 - 화면 보호기, 알림 풍선,
     * 사람이 창을 누르는 것 - MainFrame 은 키를 무시한다(그게 맞는 동작이다).
     * 그러면 타가 조용히 사라져서 시험이 엉뚱하게 실패한다. 그래서 되찾아 온다.
     */
    private void ensureActive() {
        if (frame.isActive()) return;
        for (int i = 0; i < 10 && !frame.isActive(); i++) {
            clickEditor();
            robot.delay(150);
        }
    }

    void tap(int keyCode) {
        ensureActive();
        robot.keyPress(keyCode);
        robot.keyRelease(keyCode);
        robot.delay(45);
    }

    /* Ctrl(맥은 ⌘) 을 누른 채로 한 키 */
    void accel(int keyCode) {
        ensureActive();
        int mod = com.shkwon.chunjiin.Platform.IS_MAC ? KeyEvent.VK_META : KeyEvent.VK_CONTROL;
        robot.keyPress(mod);
        tap(keyCode);
        robot.keyRelease(mod);
        robot.delay(60);
    }

    /*
     * 한글 모드에서 숫자열이 키패드에 대응한다.
     * 엔진 키 0~11 을 눌러야 할 물리 키로 바꾼다. (0 -> '1', 9 -> '-', 10 -> '0', 11 -> '=')
     */
    private static int physicalKey(int engineKey) {
        switch (engineKey) {
            case 9: return KeyEvent.VK_MINUS;
            case 10: return KeyEvent.VK_0;
            case 11: return KeyEvent.VK_EQUALS;
            default: return KeyEvent.VK_1 + engineKey;
        }
    }

    /*
     * 엔진 키 시퀀스를 물리 키로 눌러 본다.
     *
     * '|' 는 연타 순환이 저절로 끊길 때까지 기다리는 것이다.
     * 오른쪽 화살표도 순환을 끊지만 커서를 옮기면서 조합까지 확정해 버리므로,
     * "글" 처럼 받침이 이어져야 하는 자리에는 쓸 수 없다.
     */
    void type(String seq) {
        ensureActive();
        for (int i = 0; i < seq.length(); i++) {
            char c = seq.charAt(i);
            if (c == '|') {
                robot.delay(950);
            } else if (c == 'a') {
                tap(physicalKey(10));
            } else if (c == 'b') {
                tap(physicalKey(11));
            } else if (c >= '0' && c <= '9') {
                tap(physicalKey(c - '0'));
            }
        }
    }

    /* 전체 지우기 (조합을 확정한 뒤 Ctrl+N) */
    void clear() {
        tap(KeyEvent.VK_ESCAPE);
        accel(KeyEvent.VK_N);
        robot.delay(120);
    }
}
