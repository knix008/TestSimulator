/*
 * HelpDialog.java - 사용법 (F1)
 *
 * 원본 main.c 의 HELP_TEXT 를 옮긴 것이다. 단축키 표기만 운영체제에 맞춘다.
 *
 * 스크롤바를 두지 않는다. 한 단으로 세우면 90줄이 넘어 어느 화면에도 안 들어가므로
 * 두 단으로 나눠 나란히 놓는다. 나누는 자리는 뜻이 끊기는 곳이다 -
 * 왼쪽은 자판과 조합 규칙, 오른쪽은 키보드와 다른 입력 모드.
 *
 * 표는 공백으로 자리를 맞추지 않는다. 한글 글자 폭이 공백의 딱 두 배가 아니어서
 * (굴림체 13 대 7, Monospaced 13 대 8) 줄이 갈수록 어긋난다.
 * 그 대신 열마다 글상자를 따로 두고 나란히 세운다. 그러면 글꼴이 무엇이든 맞는다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Theme;

import java.awt.Component;
import java.awt.Dimension;
import java.awt.Window;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextArea;

public final class HelpDialog extends ModalDialog {

    public HelpDialog(Window owner, Theme theme, String mod) {
        super(owner, theme, "천지인 한글 입력기 - 사용법", true);

        JPanel both = new JPanel();
        both.setOpaque(false);
        both.setLayout(new BoxLayout(both, BoxLayout.X_AXIS));
        both.setAlignmentX(Component.LEFT_ALIGNMENT);

        both.add(left());
        both.add(Box.createHorizontalStrut(30));
        both.add(right(mod));

        addBody(both);
        addButton("닫기", true, this::dispose);
        ready(owner);
    }

    /* ------------------------------------------------------------------ */
    /* 왼쪽 단 - 자판과 조합 규칙                                          */
    /* ------------------------------------------------------------------ */

    private JPanel left() {
        JPanel c = column();

        add(c, heading("키패드"));
        add(c, indent(columns(18,
            block("ㅣ\nㄱㅋ\nㅂㅍ\n. ,"),
            block("·\nㄴㄹ\nㅅㅎ\nㅇㅁ"),
            block("ㅡ\nㄷㅌ\nㅈㅊ\n? !"))));
        gap(c, 16);

        add(c, heading("모음"));
        add(c, para("ㅣ 와 · 와 ㅡ 를 이어서 모든 모음을 만듭니다."));
        gap(c, 6);
        add(c, indent(columns(22,
            block("ㅏ = ㅣ+·\nㅓ = ·+ㅣ\nㅗ = ·+ㅡ\nㅜ = ㅡ+·\nㅡ = ㅡ\nㅘ = ㅚ+·"),
            block("ㅑ = ㅣ+·+·\nㅕ = ·+·+ㅣ\nㅛ = ·+·+ㅡ\nㅠ = ㅡ+·+·\nㅣ = ㅣ\nㅙ = ㅘ+ㅣ"),
            block("ㅐ = ㅏ+ㅣ\nㅔ = ㅓ+ㅣ\nㅚ = ㅗ+ㅣ\nㅟ = ㅜ+ㅣ\nㅢ = ㅡ+ㅣ\nㅝ = ㅠ+ㅣ"))));
        gap(c, 16);

        add(c, heading("자음"));
        add(c, para("같은 키를 연달아 누르면 순환합니다."));
        gap(c, 6);
        add(c, indent(columns(24,
            block("ㄱ → ㅋ → ㄲ\nㅂ → ㅍ → ㅃ\nㅈ → ㅊ → ㅉ\nㅇ → ㅁ"),
            block("ㄷ → ㅌ → ㄸ\nㅅ → ㅎ → ㅆ\nㄴ → ㄹ"))));
        gap(c, 10);
        add(c, para("""
            받침 뒤에 모음을 누르면 자동으로 연음됩니다.
              간 + ㅏ → 가나

            겹받침은 자음을 이어 누르면 합쳐집니다.
              값 = ㄱ ㅏ ㅂ ㅅ

            첫 타에 안 붙는 겹받침은 한 번 더 누르면 합쳐집니다.
              만 → 만ㅅ → 많"""));
        gap(c, 16);

        add(c, heading("같은 키를 연달아 써야 할 때"));
        add(c, para("""
            "안녕" 처럼 ㄴ 을 두 번 눌러야 하면 사이에
            오른쪽 화살표 키를 누르거나 잠시 기다리세요.
            순환이 끊기고 새 글자가 시작됩니다.

            받침이 이어져야 하는 자리("글" 의 ㄹ)에는
            화살표를 쓸 수 없습니다. 화살표는 조합을
            확정하면서 커서를 옮기기 때문입니다."""));

        c.add(Box.createVerticalGlue());
        return c;
    }

    /* ------------------------------------------------------------------ */
    /* 오른쪽 단 - 키보드와 다른 입력 모드                                 */
    /* ------------------------------------------------------------------ */

    private JPanel right(String mod) {
        JPanel c = column();

        add(c, heading("물리 키보드"));
        add(c, para("한글 모드에서 숫자열이 키패드에 대응합니다."));
        gap(c, 6);
        add(c, indent(columns(14,
            block("1 2 3\n4 5 6\n7 8 9\n- 0 ="),
            block("=\n=\n=\n="),
            block("ㅣ · ㅡ\nㄱㅋ ㄴㄹ ㄷㅌ\nㅂㅍ ㅅㅎ ㅈㅊ\n. ,  ㅇㅁ  ? !"))));
        gap(c, 8);
        add(c, para("숫자패드 7 8 9 / 4 5 6 / 1 2 3 / 0 도 같은 순서입니다."));
        gap(c, 12);

        add(c, indent(columns(16,
            block("Space\nBackspace\nEnter\nEsc\n← →\nHome End"),
            block("띄어쓰기\n한 단계 지우기\n줄바꿈\n조합 확정\n커서 이동\n글 맨 앞 · 맨 뒤"))));
        gap(c, 12);

        add(c, indent(columns(16,
            block("F1\nF3\n" + mod + "+N\n" + mod + "+S\n" + mod + "+C"),
            block("도움말\n테마\n새로 만들기\n저장\n복사"),
            block("F2\nF4\n" + mod + "+O\n\n" + mod + "+V"),
            block("입력 모드\n설정\n열기\n\n붙여넣기"))));
        gap(c, 16);

        add(c, heading("영문 · 숫자 · 기호"));
        add(c, para("""
            모드 버튼(F2)으로 한글, 영문 abc, 영문 ABC,
            숫자, 기호 순으로 바뀝니다.
            영문·숫자·기호 모드에서는 물리 키보드로
            그냥 타이핑해도 됩니다."""));
        gap(c, 8);
        add(c, indent(columns(20,
            block("abc  def  ghi\njkl  mno  pqr\nstu  vwx  yz\n.,?  !'\"  -:@"),
            block("알파벳 26자가\n위 3x3 아홉 키에\n들어갑니다. 마지막 줄\n세 키는 자주 쓰는 기호."))));
        gap(c, 8);
        add(c, para("나머지 기호는 기호 모드에 36개가 있습니다."));
        gap(c, 16);

        add(c, heading("설정"));
        add(c, para("""
            설정(F4) 에서 테마, 글꼴 크기, 연타 유지 시간,
            시작 입력 모드, 툴바 · 상태줄 표시를
            바꿀 수 있습니다."""));
        gap(c, 16);

        add(c, heading("창"));
        add(c, para("""
            제목줄을 끌면 창이 옮겨지고, 두 번 누르면
            최대화됩니다. 창 가장자리나 오른쪽 아래
            손잡이를 끌면 크기가 바뀝니다."""));

        c.add(Box.createVerticalGlue());
        return c;
    }

    /* ------------------------------------------------------------------ */
    /* 부품 만들기                                                         */
    /* ------------------------------------------------------------------ */

    private JPanel column() {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.Y_AXIS));
        p.setAlignmentY(Component.TOP_ALIGNMENT);
        return p;
    }

    private static void add(JPanel column, JComponent c) {
        c.setAlignmentX(Component.LEFT_ALIGNMENT);
        column.add(c);
    }

    private static void gap(JPanel column, int px) {
        Box.Filler f = (Box.Filler) Box.createVerticalStrut(px);
        f.setAlignmentX(Component.LEFT_ALIGNMENT);
        column.add(f);
    }

    private JLabel heading(String text) {
        JLabel l = new JLabel("[ " + text + " ]");
        l.setFont(Fonts.uiBold(13));
        l.setForeground(theme.role(Theme.Role.PRIMARY).bg);
        l.setBorder(BorderFactory.createEmptyBorder(0, 0, 6, 0));
        return l;
    }

    private JTextArea para(String text) {
        return block(text);
    }

    /* 글 한 덩이. 줄 간격과 색만 맞춰 둔다. */
    private JTextArea block(String text) {
        JTextArea a = new JTextArea(text);
        a.setEditable(false);
        a.setFont(Fonts.ui(13));
        a.setBackground(theme.card);
        a.setForeground(theme.text);
        a.setCaretColor(theme.card);
        a.setBorder(BorderFactory.createEmptyBorder());
        a.setAlignmentY(Component.TOP_ALIGNMENT);
        a.setMaximumSize(a.getPreferredSize());
        return a;
    }

    /* 여러 덩이를 나란히. 열마다 따로 두므로 글꼴이 무엇이든 세로줄이 맞는다. */
    private static JPanel columns(int gap, JComponent... parts) {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.X_AXIS));
        p.setAlignmentY(Component.TOP_ALIGNMENT);
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) p.add(Box.createHorizontalStrut(gap));
            p.add(parts[i]);
        }
        p.add(Box.createHorizontalGlue());
        p.setMaximumSize(new Dimension(Integer.MAX_VALUE, p.getPreferredSize().height));
        return p;
    }

    /* 본문보다 한 칸 들여쓴다 */
    private static JComponent indent(JComponent c) {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.X_AXIS));
        p.add(Box.createHorizontalStrut(14));
        p.add(c);
        p.setMaximumSize(new Dimension(Integer.MAX_VALUE, c.getPreferredSize().height));
        return p;
    }
}
