/*
 * Version.java - 앱 이름과 판
 *
 * 빌드 시각은 빌드 스크립트가 build-stamp.txt 로 넣어 준다.
 * 없으면 "개발 중" 으로 나온다.
 */
package com.shkwon.chunjiin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class Version {

    private Version() {
    }

    public static final String APP_NAME = "천지인 한글 입력기";
    public static final String APP_VERSION = "1.0.0";
    public static final String BUILD_STAMP = readStamp();

    private static String readStamp() {
        try (InputStream in = Version.class.getResourceAsStream("/build-stamp.txt")) {
            if (in == null) return "개발 중";
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line = r.readLine();
                return line == null || line.isBlank() ? "개발 중" : line.trim();
            }
        } catch (Exception e) {
            return "개발 중";
        }
    }
}
