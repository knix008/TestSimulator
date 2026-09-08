/*
 * Screenshots.java - 문서에 쓸 그림을 찍는다.
 *
 * KoreanChunJiinMultiOSV10 의 scripts/shot.cjs 에 해당한다.
 * 창을 띄우고 글을 조금 쳐 넣은 뒤 테마 4종을 돌아가며 찍어
 * docs/images 에 넣는다. README 와 UsersGuide 의 그림이 모두 이것으로 만든 것이다.
 *
 *   java -cp out/test-classes com.shkwon.chunjiin.Screenshots
 */
package com.shkwon.chunjiin;

import java.awt.Dialog;
import java.awt.GraphicsEnvironment;
import java.awt.Rectangle;
import java.awt.Window;
import java.awt.event.KeyEvent;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;

public final class Screenshots {

    private Screenshots() {
    }

    private static final String OUT_DIR = "docs/images";

    /* 파일 이름은 웹판과 같게 둔다. 문서의 그림 링크가 그대로 맞는다. */
    private static final String[] FILE_NAMES = {"light", "dark", "sepia", "contrast"};

    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8));

        if (GraphicsEnvironment.isHeadless()) {
            System.out.println("화면이 없어 건너뜁니다 (headless).");
            return;
        }

        File dir = new File(OUT_DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) {
            System.err.println(OUT_DIR + " 을 만들지 못했습니다.");
            System.exit(1);
        }

        UiDriver ui = UiDriver.launch();

        try {
            /* "안녕하세요" 를 쳐 넣고 조합 중인 "ㄱ·" 를 남겨 둔다 */
            ui.type("a014|4110a77017100|a112");
            ui.robot.delay(950);
            ui.type("31");
            ui.robot.delay(300);
            System.out.println("찍을 글   \"" + ui.frame.editorText() + "\"");

            /* 라이트에서 시작하도록 테마를 맞춘다 */
            for (int i = 0; i < Theme.THEME_COUNT && !ui.frame.themeNameNow().equals(Theme.THEMES[0].name); i++) {
                ui.tap(KeyEvent.VK_F3);
                ui.robot.delay(150);
            }

            for (int i = 0; i < Theme.THEME_COUNT; i++) {
                ui.robot.delay(400);
                Rectangle bounds = ui.frame.getBounds();
                BufferedImage shot = ui.robot.createScreenCapture(bounds);

                File out = new File(dir, FILE_NAMES[i] + ".png");
                ImageIO.write(shot, "png", out);
                System.out.println("찍음 -> " + out.getPath() + "   (" + ui.frame.themeNameNow() + ")");

                ui.tap(KeyEvent.VK_F3);
            }

            /* 대화상자도 한 장씩. 스크롤바 없이 다 보이는지 눈으로 볼 수 있어야 한다. */
            shootDialog(ui, dir, KeyEvent.VK_F4, "settings");
            shootDialog(ui, dir, KeyEvent.VK_F1, "help");
        } finally {
            ui.close();
        }

        System.out.println();
        System.out.println("다 됐습니다.  " + OUT_DIR + "/");
        System.exit(0);
    }

    /* 키 하나로 대화상자를 열고 찍은 뒤 Esc 로 닫는다. */
    private static void shootDialog(UiDriver ui, File dir, int key, String name) throws Exception {
        ui.tap(key);
        ui.robot.delay(900);

        Dialog dialog = null;
        for (Window w : Window.getWindows()) {
            if (w instanceof Dialog d && d.isShowing()) dialog = d;
        }
        if (dialog == null) {
            System.out.println("대화상자가 뜨지 않았습니다 (" + name + ")");
            return;
        }

        File out = new File(dir, name + ".png");
        ImageIO.write(ui.robot.createScreenCapture(dialog.getBounds()), "png", out);
        System.out.println("찍음 -> " + out.getPath()
            + "   (" + dialog.getWidth() + " x " + dialog.getHeight() + ")");

        ui.robot.keyPress(KeyEvent.VK_ESCAPE);
        ui.robot.keyRelease(KeyEvent.VK_ESCAPE);
        ui.robot.delay(600);
    }
}
