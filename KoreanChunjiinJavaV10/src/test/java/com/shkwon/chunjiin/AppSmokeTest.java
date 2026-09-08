/*
 * AppSmokeTest.java - 창까지 띄워 보는 시험
 *
 * KoreanChunJiinMultiOSV10 의 `npm run test:app` (scripts/probe.js) 에 해당한다.
 * 엔진 시험(EngineTest)은 화면 없이 오토마타만 보지만, 여기서는 실제로 창을
 * 띄우고 java.awt.Robot 으로 키를 눌러 화면 쪽 배선까지 확인한다.
 *
 *   화면이 없는 자리(CI, 원격 셸)에서는 조용히 건너뛴다.
 *
 *   ./test.sh --app        엔진 시험 뒤에 이것도 돌린다
 *   java -cp out/test-classes com.shkwon.chunjiin.AppSmokeTest
 */
package com.shkwon.chunjiin;

import com.shkwon.chunjiin.ui.MainFrame;

import java.awt.Dialog;
import java.awt.GraphicsEnvironment;
import java.awt.Window;
import java.awt.event.KeyEvent;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

public final class AppSmokeTest {

    private AppSmokeTest() {
    }

    private static int pass;
    private static int fail;
    private static MainFrame frame;

    private static void check(String name, Object got, Object want) {
        boolean ok = String.valueOf(got).equals(String.valueOf(want));
        if (ok) {
            pass++;
            System.out.println("  [PASS] " + name + "  -> " + show(got));
        } else {
            fail++;
            System.out.println("  [FAIL] " + name + "  -> " + show(got) + "   기대: " + show(want));
        }
    }

    private static String show(Object o) {
        return String.valueOf(o).replace("\n", "\\n");
    }

    /* F3 을 눌러 테마가 실제로 바뀔 때까지 기다린다. 바뀌었으면 true. */
    private static boolean cycleTheme(UiDriver ui, String from) {
        ui.tap(KeyEvent.VK_F3);
        for (int i = 0; i < 20; i++) {
            if (!frame.themeNameNow().equals(from)) return true;
            ui.robot.delay(100);
        }
        return false;
    }

    /* 지금 화면에 떠 있는 대화상자가 있는지 */
    private static boolean dialogShowing() {
        for (Window w : Window.getWindows()) {
            if (w instanceof Dialog d && d.isShowing()) return true;
        }
        return false;
    }

    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8));

        if (GraphicsEnvironment.isHeadless()) {
            System.out.println("화면이 없어 건너뜁니다 (headless).");
            return;
        }

        System.out.println("천지인 화면 시험");

        UiDriver ui = UiDriver.launch();
        frame = ui.frame;

        try {
            /* 창이 떴는지 */
            check("창이 뜬다", frame.isShowing(), true);
            check("키를 받는다", frame.isActive(), true);
            check("시작 모드", frame.modeNameNow(), "한글");
            check("툴바 보임", frame.toolbarShown(), true);
            check("상태줄 보임", frame.statusShown(), true);

            /* 한글 조합 - "한글" (엔진 시험의 '77014|32|44' 와 같은 차례) */
            ui.type("77014|32|44");
            ui.robot.delay(120);
            check("한글 조합", frame.editorText(), "한글");

            /* 전체 지우기 (Ctrl+N) */
            ui.clear();
            check("전체 지우기", frame.editorText(), "");

            /* 아래아 중간 상태가 눈에 보인다 */
            ui.type("31");
            ui.robot.delay(120);
            check("아래아 표시", frame.editorText(), "ㄱ·");
            ui.clear();

            /* 겹받침 되돌려 붙이기 - 만 -> 만ㅅ -> 많 */
            ui.type("aa01477");
            ui.robot.delay(120);
            check("겹받침 병합", frame.editorText(), "많");
            ui.clear();

            /* 모드 순환 (F2) - 다섯 번이면 제자리 */
            ui.tap(KeyEvent.VK_F2);
            check("모드 1회", frame.modeNameNow(), "영문 abc");

            /* 영문 모드에서는 물리 키보드로 그냥 친다 */
            ui.tap(KeyEvent.VK_H);
            ui.tap(KeyEvent.VK_I);
            ui.robot.delay(120);
            check("영문 직접 입력", frame.editorText(), "hi");

            ui.tap(KeyEvent.VK_F2);
            check("모드 2회", frame.modeNameNow(), "영문 ABC");
            ui.tap(KeyEvent.VK_F2);
            check("모드 3회", frame.modeNameNow(), "숫자 123");
            ui.tap(KeyEvent.VK_F2);
            check("모드 4회", frame.modeNameNow(), "기호 !@#");
            ui.tap(KeyEvent.VK_F2);
            check("모드 5회", frame.modeNameNow(), "한글");

            /*
             * 테마 순환 (F3).
             * 정해진 시간만 기다리면 기계가 바쁠 때 한 타가 아직 처리되지 않은 채로
             * 다음 검사가 지나가 버린다. 그래서 테마 이름이 실제로 바뀔 때까지 기다린다.
             */
            String first = frame.themeNameNow();
            check("테마 바뀜", cycleTheme(ui, first), true);
            boolean roundTrip = true;
            for (int i = 1; i < Theme.THEME_COUNT; i++) {
                roundTrip &= cycleTheme(ui, frame.themeNameNow());
            }
            check("테마 한 바퀴", roundTrip ? frame.themeNameNow() : "(바뀌지 않음)", first);

            /* 백스페이스와 커서 이동 */
            ui.clear();
            ui.type("301401");
            ui.tap(KeyEvent.VK_BACK_SPACE);
            ui.robot.delay(120);
            check("백스페이스", frame.editorText(), "가니");

            ui.tap(KeyEvent.VK_HOME);
            ui.type("701");
            ui.robot.delay(120);
            check("맨 앞 삽입", frame.editorText(), "사가니");

            /* 스페이스와 줄바꿈 */
            ui.tap(KeyEvent.VK_END);
            ui.tap(KeyEvent.VK_SPACE);
            ui.tap(KeyEvent.VK_ENTER);
            ui.type("301");
            ui.robot.delay(120);
            check("공백·줄바꿈", frame.editorText(), "사가니 \n가");

            /* 대화상자 - 열리고 Esc 로 닫히는지 */
            ui.tap(KeyEvent.VK_F4);
            ui.robot.delay(600);
            check("설정 창 열림", dialogShowing(), true);
            ui.tap(KeyEvent.VK_ESCAPE);
            ui.robot.delay(500);
            check("설정 창 닫힘", dialogShowing(), false);

            ui.tap(KeyEvent.VK_F1);
            ui.robot.delay(600);
            check("사용법 창 열림", dialogShowing(), true);
            ui.tap(KeyEvent.VK_ESCAPE);
            ui.robot.delay(500);
            check("사용법 창 닫힘", dialogShowing(), false);

            /*
             * 대화상자를 닫은 뒤에도 키가 통해야 한다.
             * 그 자리에서는 포커스가 부품이 아니라 창 자체로 돌아오는데,
             * 그것을 챙기지 않으면 키가 통째로 무시된다.
             */
            ui.clear();
            ui.type("301");
            ui.robot.delay(120);
            check("대화상자 뒤 입력", frame.editorText(), "가");

            /* 복사 (Ctrl+C) - 클립보드에 그대로 들어가는지 */
            ui.clear();
            ui.type("701");
            ui.type("301");
            ui.type("401");
            ui.tap(KeyEvent.VK_ESCAPE);
            ui.accel(KeyEvent.VK_C);
            ui.robot.delay(300);
            check("복사", Platform.readClipboard(), "사가나");
        } finally {
            ui.close();
        }

        int total = pass + fail;
        System.out.println();
        System.out.println("--------------------------------------------------------");
        System.out.printf("  화면 시험   %d개 중 %d개 통과%n", total, pass);
        System.out.println("  결과   " + (fail == 0 ? " PASS " : " FAIL "));
        System.out.println("--------------------------------------------------------");

        System.exit(fail == 0 ? 0 : 1);
    }
}
