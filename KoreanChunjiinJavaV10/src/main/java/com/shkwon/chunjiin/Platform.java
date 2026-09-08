/*
 * Platform.java - 운영체제에 닿는 것들을 한자리에 모은다.
 *
 * 웹판의 platform.js 에 해당한다. 파일 열기/저장과 클립보드가 여기에 있다.
 * UI 쪽은 이 클래스만 부르고 java.awt.datatransfer 나 JFileChooser 를 직접
 * 만지지 않는다. 그래야 실패했을 때 오류 창으로 흘려보내기 쉽다.
 */
package com.shkwon.chunjiin;

import java.awt.Toolkit;
import java.awt.datatransfer.Clipboard;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.StringSelection;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.swing.JFileChooser;
import javax.swing.filechooser.FileNameExtensionFilter;

public final class Platform {

    private Platform() {
    }

    /* 열어 온 파일 하나. 사용자가 취소하면 null 을 돌려준다. */
    public static final class TextFile {
        public final String text;
        public final String name;

        TextFile(String text, String name) {
            this.text = text;
            this.name = name;
        }
    }

    /* 어느 운영체제인지 */
    public static String platformName() {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) return "Windows";
        if (os.contains("mac")) return "macOS";
        if (os.contains("nux") || os.contains("nix")) return "Linux";
        return System.getProperty("os.name", "알 수 없음");
    }

    /* Ctrl 대신 ⌘ 를 쓰는 자리인지 */
    public static final boolean IS_MAC = platformName().equals("macOS");

    /* ------------------------------------------------------------------ */
    /* 파일                                                                */
    /* ------------------------------------------------------------------ */

    /* 마지막으로 쓴 폴더를 기억해 둔다. 이어서 여닫을 때 편하다. */
    private static File lastDir;

    private static JFileChooser chooser(String title) {
        JFileChooser fc = new JFileChooser(lastDir);
        fc.setDialogTitle(title);
        fc.setAcceptAllFileFilterUsed(true);
        fc.setFileFilter(new FileNameExtensionFilter("텍스트 파일 (*.txt)", "txt"));
        return fc;
    }

    /*
     * 텍스트 파일을 연다. 성공하면 TextFile, 사용자가 취소하면 null.
     * UTF-8 BOM 이 있으면 걷어낸다 (원본 열기와 같은 규칙).
     */
    public static TextFile openTextFile(java.awt.Component parent) throws IOException {
        JFileChooser fc = chooser("열기");
        if (fc.showOpenDialog(parent) != JFileChooser.APPROVE_OPTION) return null;

        File file = fc.getSelectedFile();
        lastDir = file.getParentFile();

        String text = Files.readString(file.toPath(), StandardCharsets.UTF_8);
        return new TextFile(stripBom(text), file.getName());
    }

    /*
     * 텍스트를 UTF-8(BOM 포함) 파일로 저장한다.
     * 저장했으면 파일 이름, 취소하면 null.
     */
    public static String saveTextFile(java.awt.Component parent, String text) throws IOException {
        JFileChooser fc = chooser("저장");
        fc.setSelectedFile(new File(lastDir, "무제.txt"));
        if (fc.showSaveDialog(parent) != JFileChooser.APPROVE_OPTION) return null;

        File file = fc.getSelectedFile();
        if (!file.getName().contains(".")) file = new File(file.getParentFile(), file.getName() + ".txt");
        lastDir = file.getParentFile();

        Path path = file.toPath();
        Files.writeString(path, "﻿" + text, StandardCharsets.UTF_8);
        return file.getName();
    }

    private static String stripBom(String s) {
        return !s.isEmpty() && s.charAt(0) == '﻿' ? s.substring(1) : s;
    }

    /* ------------------------------------------------------------------ */
    /* 클립보드                                                            */
    /* ------------------------------------------------------------------ */

    public static boolean copyToClipboard(String text) {
        try {
            Clipboard cb = Toolkit.getDefaultToolkit().getSystemClipboard();
            cb.setContents(new StringSelection(text), null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /* 읽을 수 없으면 null */
    public static String readClipboard() {
        try {
            Clipboard cb = Toolkit.getDefaultToolkit().getSystemClipboard();
            if (!cb.isDataFlavorAvailable(DataFlavor.stringFlavor)) return null;
            return (String) cb.getData(DataFlavor.stringFlavor);
        } catch (Exception e) {
            return null;
        }
    }
}
