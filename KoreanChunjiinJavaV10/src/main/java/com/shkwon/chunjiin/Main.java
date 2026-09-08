/*
 * Main.java - 데스크톱(Windows · macOS · Linux) 진입점
 *
 * 하는 일은 창을 띄우는 것뿐이다.
 * 메뉴 막대는 두지 않는다 - 명령은 모두 툴바와 단축키에 있고,
 * 화면을 한 줄이라도 넓게 쓰는 편이 낫다.
 */
package com.shkwon.chunjiin;

import com.shkwon.chunjiin.ui.MainFrame;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;

public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        /* macOS 는 메뉴 막대가 화면 위에 따로 있으므로 이름만 일러 준다 */
        System.setProperty("apple.laf.useScreenMenuBar", "false");
        System.setProperty("apple.awt.application.name", Version.APP_NAME);

        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception e) {
            /* 못 바꾸면 기본 룩앤필로 그대로 간다. 색은 어차피 테마가 칠한다. */
        }

        /*
         * 어디서도 붙잡지 못한 오류는 여기서 받는다.
         * 조용히 사라지는 것보다 무엇이 틀어졌는지 보여 주는 편이 낫다.
         */
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> e.printStackTrace(System.err));

        SwingUtilities.invokeLater(() -> new MainFrame().setVisible(true));
    }
}
