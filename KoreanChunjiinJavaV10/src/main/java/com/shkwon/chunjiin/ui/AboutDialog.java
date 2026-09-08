/*
 * AboutDialog.java - 프로그램 정보
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Platform;
import com.shkwon.chunjiin.Settings;
import com.shkwon.chunjiin.Theme;
import com.shkwon.chunjiin.Version;

import java.awt.Component;
import java.awt.Dimension;
import java.awt.Window;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;

public final class AboutDialog extends ModalDialog {

    public AboutDialog(Window owner, Theme theme, String themeName, Runnable onHelp) {
        super(owner, theme, "프로그램 정보", false);

        JLabel lead = new JLabel("<html><b>" + Version.APP_NAME + "</b><br>"
            + "12키 천지인 자판으로 한글을 조합하는 프로그램입니다.<br>"
            + "Windows · macOS · Linux 에서 같은 코드, 같은 엔진으로 돕니다.</html>");
        lead.setFont(Fonts.ui(14));
        lead.setForeground(theme.text);
        lead.setAlignmentX(Component.LEFT_ALIGNMENT);
        addBody(lead);
        addBody(Box.createVerticalStrut(14));

        String[][] rows = {
            {"만든이", "SHKWON  (knix008@naver.com)"},
            {"판", "v" + Version.APP_VERSION},
            {"빌드", Version.BUILD_STAMP},
            {"실행 환경", "Java " + System.getProperty("java.version") + " · Swing · " + Platform.platformName()},
            {"조합 엔진", "engine/Chunjiin.java · Input.java (C 원본을 그대로 옮김)"},
            {"현재 테마", themeName},
            {"설정 저장 위치", Settings.storeLocation()},
        };

        for (String[] r : rows) {
            addBody(row(r[0], r[1]));
            addBody(Box.createVerticalStrut(4));
        }

        addButton("사용법 (F1)", false, () -> {
            dispose();
            onHelp.run();
        });
        addButton("확인", true, this::dispose);
        ready(owner);
    }

    private JPanel row(String key, String value) {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.X_AXIS));
        p.setAlignmentX(Component.LEFT_ALIGNMENT);

        JLabel k = new JLabel(key);
        k.setFont(Fonts.ui(13));
        k.setForeground(theme.muted);
        k.setPreferredSize(new Dimension(110, 20));
        k.setMinimumSize(new Dimension(110, 20));
        k.setMaximumSize(new Dimension(110, 20));

        JLabel v = new JLabel(value);
        v.setFont(Fonts.ui(13));
        v.setForeground(theme.text);

        p.add(k);
        p.add(Box.createHorizontalStrut(8));
        p.add(v);
        p.add(Box.createHorizontalGlue());
        p.setMaximumSize(new Dimension(Integer.MAX_VALUE, 22));
        return p;
    }
}
