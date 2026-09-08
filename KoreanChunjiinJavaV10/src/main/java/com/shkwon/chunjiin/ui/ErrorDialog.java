/*
 * ErrorDialog.java - 오류를 구체적으로 보여 주는 창
 *
 * 무엇을 하다가 어디서 어떻게 틀어졌는지를 그대로 보여 주고,
 * 그 내용을 통째로 클립보드에 복사할 수 있게 한다.
 * 본문은 드래그해서 일부만 골라 복사해도 된다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Platform;
import com.shkwon.chunjiin.Theme;

import java.awt.Component;
import java.awt.Window;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.JLabel;
import javax.swing.JTextArea;
import javax.swing.Timer;

public final class ErrorDialog extends ModalDialog {

    /* 오류 하나가 담고 있는 것. 상태줄에도 같은 것을 남겨 두었다가 다시 연다. */
    public static final class Info {
        public final String what;
        public final String when;
        public final String where;
        public final String message;
        public final String detail;

        public Info(String what, String when, String where, String message, String detail) {
            this.what = what;
            this.when = when;
            this.where = where;
            this.message = message;
            this.detail = detail;
        }
    }

    /*
     * 화면에 보이는 그대로가 복사되는 글이 되도록 한 곳에서 만든다.
     * 붙여넣어 보고할 때 앞뒤 사정이 남아 있어야 쓸모가 있다.
     */
    public static String format(Info err) {
        StringBuilder sb = new StringBuilder();
        sb.append("무엇을 하다가   ").append(err.what).append('\n');
        sb.append("언제            ").append(err.when).append('\n');
        sb.append("어디서          ").append(err.where).append('\n');
        sb.append('\n');
        sb.append("오류            ").append(err.message);
        if (err.detail != null && !err.detail.isEmpty()) {
            sb.append("\n\n자세한 내용\n").append(err.detail);
        }
        return sb.toString();
    }

    public ErrorDialog(Window owner, Theme theme, Info error) {
        super(owner, theme, "오류", true);

        String text = format(error);

        JLabel lead = new JLabel(error.what + " 중에 문제가 생겼습니다.");
        lead.setFont(Fonts.uiBold(15));
        lead.setForeground(theme.text);
        lead.setAlignmentX(Component.LEFT_ALIGNMENT);
        addBody(lead);
        addBody(Box.createVerticalStrut(6));

        JLabel msg = new JLabel("<html>" + escape(error.message) + "</html>");
        msg.setFont(Fonts.ui(13));
        msg.setForeground(theme.muted);
        msg.setAlignmentX(Component.LEFT_ALIGNMENT);
        addBody(msg);
        addBody(Box.createVerticalStrut(10));

        /*
         * 스크롤바를 두지 않는다. 자국이 길면 창이 그만큼 길어지고,
         * 화면을 넘어설 것 같으면 ModalDialog 가 화면 안으로 맞춘다.
         * 다만 쌓인 자국이 아주 길 수도 있으므로 보여 줄 줄 수는 끊는다.
         * 잘린 것까지 통째로 담기는 것은 `전체 복사` 쪽이다.
         */
        JTextArea detail = new JTextArea(headLines(text, 40));
        detail.setEditable(false);
        detail.setFont(Fonts.mono(12));
        detail.setBackground(theme.wnd);
        detail.setForeground(theme.text);
        detail.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(theme.border),
            BorderFactory.createEmptyBorder(8, 8, 8, 8)));
        detail.setCaretPosition(0);
        detail.setAlignmentX(Component.LEFT_ALIGNMENT);
        addBody(detail);
        addBody(Box.createVerticalStrut(8));

        JLabel hint = new JLabel("<html>위 글을 그대로 복사해 두면 무엇이 잘못됐는지 알아보기 쉽습니다."
            + "<br>본문을 드래그해서 일부만 복사해도 됩니다.</html>");
        hint.setFont(Fonts.ui(12));
        hint.setForeground(theme.muted);
        hint.setAlignmentX(Component.LEFT_ALIGNMENT);
        addBody(hint);

        KeyButton copy = addButton("전체 복사", false, null);
        copy.onClick(() -> {
            if (Platform.copyToClipboard(text)) {
                copy.label("복사했습니다");
                Timer t = new Timer(2000, e -> copy.label("전체 복사"));
                t.setRepeats(false);
                t.start();
            }
        });
        addButton("닫기", true, this::dispose);

        ready(owner);
    }

    /* 앞에서 max 줄까지만. 더 있으면 몇 줄이 남았는지 알려 준다. */
    private static String headLines(String s, int max) {
        String[] lines = s.split("\n", -1);
        if (lines.length <= max) return s;

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < max; i++) sb.append(lines[i]).append('\n');
        sb.append("... ").append(lines.length - max).append("줄 더 있습니다 (전체 복사에는 다 들어갑니다)");
        return sb.toString();
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
