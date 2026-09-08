/*
 * SettingsDialog.java - 설정 창 (F4)
 *
 * 원본과 같이 고르는 즉시 화면에 적용되고, 확인을 누르면 저장,
 * 취소하면 열기 전 상태로 되돌린다.
 */
package com.shkwon.chunjiin.ui;

import com.shkwon.chunjiin.Settings;
import com.shkwon.chunjiin.Theme;
import com.shkwon.chunjiin.engine.Mode;

import java.awt.Component;
import java.awt.Dimension;
import java.awt.Window;
import java.util.function.Consumer;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;

public final class SettingsDialog extends ModalDialog {

    private static final String[] MODE_NAMES = {"한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#"};

    /* 취소했을 때 되돌릴 값 */
    private final Settings original;
    private final Settings working;
    private final Consumer<Settings> onPreview;
    private final Consumer<Settings> onAccept;

    public SettingsDialog(Window owner, Theme theme, Settings settings,
                          Consumer<Settings> onPreview, Consumer<Settings> onAccept) {
        super(owner, theme, "설정", false);

        this.original = settings.copy();
        this.working = settings.copy();
        this.onPreview = onPreview;
        this.onAccept = onAccept;

        String[] themeNames = new String[Theme.THEME_COUNT];
        for (int i = 0; i < Theme.THEME_COUNT; i++) themeNames[i] = Theme.THEMES[i].name;

        String[] fontNames = new String[Settings.FONT_CHOICES.length];
        for (int i = 0; i < fontNames.length; i++) {
            int v = Settings.FONT_CHOICES[i];
            fontNames[i] = v + " px" + (v == Settings.DEFAULT_FONT_SIZE ? "  (기본)" : "");
        }

        String[] tapNames = new String[Settings.TAP_CHOICES.length];
        for (int i = 0; i < tapNames.length; i++) {
            int v = Settings.TAP_CHOICES[i];
            tapNames[i] = String.format("%.1f 초%s", v / 1000.0,
                v == Settings.DEFAULT_MULTITAP_MS ? "  (기본)" : "");
        }

        String[] modeNames = new String[Mode.COUNT];
        System.arraycopy(MODE_NAMES, 0, modeNames, 0, Mode.COUNT);

        addBody(row("테마", themeNames, working.theme, i -> {
            working.theme = i;
            preview();
        }));
        addBody(Box.createVerticalStrut(10));

        addBody(row("글꼴 크기", fontNames, indexOf(Settings.FONT_CHOICES, working.fontSize), i -> {
            working.fontSize = Settings.FONT_CHOICES[i];
            preview();
        }));
        addBody(Box.createVerticalStrut(10));

        addBody(row("연타 유지 시간", tapNames, indexOf(Settings.TAP_CHOICES, working.multitapMs), i -> {
            working.multitapMs = Settings.TAP_CHOICES[i];
            preview();
        }));
        addBody(Box.createVerticalStrut(10));

        addBody(row("시작 입력 모드", modeNames, working.startMode, i -> {
            working.startMode = i;
            preview();
        }));
        addBody(Box.createVerticalStrut(14));

        addBody(check("툴바 보이기", working.showToolbar, v -> {
            working.showToolbar = v;
            preview();
        }));
        addBody(Box.createVerticalStrut(6));

        addBody(check("상태줄 보이기", working.showStatus, v -> {
            working.showStatus = v;
            preview();
        }));

        addButton("취소", false, this::onCancel);
        addButton("확인", true, () -> {
            onAccept.accept(working.copy());
            dispose();
        });

        ready(owner);
    }

    private void preview() {
        onPreview.accept(working.copy());
    }

    @Override
    protected void onCancel() {
        onPreview.accept(original.copy());
        dispose();
    }

    private static int indexOf(int[] arr, int v) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == v) return i;
        }
        return 0;
    }

    /* 왼쪽에 이름, 오른쪽에 고르는 칸 */
    private JPanel row(String name, String[] items, int selected, java.util.function.IntConsumer onPick) {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.X_AXIS));
        p.setAlignmentX(Component.LEFT_ALIGNMENT);

        JLabel label = new JLabel(name);
        label.setFont(Fonts.ui(14));
        label.setForeground(theme.text);
        label.setPreferredSize(new Dimension(120, 28));

        JComboBox<String> box = new JComboBox<>(items);
        box.setSelectedIndex(Math.max(0, Math.min(items.length - 1, selected)));
        box.setFont(Fonts.ui(14));
        box.setMaximumSize(new Dimension(Integer.MAX_VALUE, 28));
        box.addActionListener(e -> onPick.accept(box.getSelectedIndex()));

        p.add(label);
        p.add(Box.createHorizontalStrut(10));
        p.add(box);
        p.setMaximumSize(new Dimension(Integer.MAX_VALUE, 30));
        return p;
    }

    private JCheckBox check(String name, boolean value, Consumer<Boolean> onToggle) {
        JCheckBox cb = new JCheckBox(name, value);
        cb.setOpaque(false);
        cb.setFont(Fonts.ui(14));
        cb.setForeground(theme.text);
        cb.setFocusPainted(false);
        cb.setAlignmentX(Component.LEFT_ALIGNMENT);
        cb.addActionListener(e -> onToggle.accept(cb.isSelected()));
        return cb;
    }
}
