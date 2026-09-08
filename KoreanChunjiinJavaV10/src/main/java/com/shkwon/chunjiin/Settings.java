/*
 * Settings.java - 설정 읽기/쓰기
 *
 * 원본 C 판은 레지스트리 HKCU\Software\Chunjiin 에 저장했고,
 * 자바스크립트 판은 localStorage 를 썼다.
 * 여기서는 java.util.prefs 를 쓴다. 윈도우에서는 결국 레지스트리로 가고,
 * macOS · 리눅스에서는 사용자 홈 아래 파일로 가므로 원본과 성격이 같다.
 */
package com.shkwon.chunjiin;

import com.shkwon.chunjiin.engine.Mode;

import java.util.prefs.Preferences;

public final class Settings {

    public static final int[] FONT_CHOICES = {16, 18, 21, 24, 28, 32};
    public static final int[] TAP_CHOICES = {400, 600, 800, 1000, 1500, 2000};

    /* 기본값 */
    public static final int DEFAULT_THEME = 0;
    public static final int DEFAULT_FONT_SIZE = 21;   /* 편집 영역 글꼴 높이(px) */
    public static final int DEFAULT_MULTITAP_MS = 800; /* 연타 순환이 유지되는 시간 */

    public int theme = DEFAULT_THEME;
    public int fontSize = DEFAULT_FONT_SIZE;
    public int multitapMs = DEFAULT_MULTITAP_MS;
    public int startMode = Mode.HANGUL.index();
    public boolean showToolbar = true;
    public boolean showStatus = true;

    private static Preferences store() {
        return Preferences.userRoot().node("com/shkwon/chunjiin");
    }

    private static int clamp(int v, int lo, int hi) {
        return v < lo ? lo : Math.min(v, hi);
    }

    public Settings copy() {
        Settings s = new Settings();
        s.theme = theme;
        s.fontSize = fontSize;
        s.multitapMs = multitapMs;
        s.startMode = startMode;
        s.showToolbar = showToolbar;
        s.showStatus = showStatus;
        return s;
    }

    public static Settings load() {
        Settings s = new Settings();

        try {
            Preferences p = store();
            s.theme = p.getInt("theme", DEFAULT_THEME);
            s.fontSize = p.getInt("fontSize", DEFAULT_FONT_SIZE);
            s.multitapMs = p.getInt("multitapMs", DEFAULT_MULTITAP_MS);
            s.startMode = p.getInt("startMode", Mode.HANGUL.index());
            s.showToolbar = p.getBoolean("showToolbar", true);
            s.showStatus = p.getBoolean("showStatus", true);
        } catch (Exception e) {
            /* 저장소를 못 읽으면 기본값 그대로 쓴다 */
        }

        s.theme = clamp(s.theme, 0, Theme.THEME_COUNT - 1);
        s.fontSize = clamp(s.fontSize, 14, 36);
        s.multitapMs = clamp(s.multitapMs, 300, 3000);
        s.startMode = clamp(s.startMode, 0, Mode.COUNT - 1);
        return s;
    }

    public void save() {
        try {
            Preferences p = store();
            p.putInt("theme", theme);
            p.putInt("fontSize", fontSize);
            p.putInt("multitapMs", multitapMs);
            p.putInt("startMode", startMode);
            p.putBoolean("showToolbar", showToolbar);
            p.putBoolean("showStatus", showStatus);
            p.flush();
        } catch (Exception e) {
            /* 저장 못 해도 동작에는 지장이 없다 */
        }
    }

    /* 설정을 어디에 두는지. 프로그램 정보 창에 보여 준다. */
    public static String storeLocation() {
        return "java.util.prefs · " + store().absolutePath();
    }
}
