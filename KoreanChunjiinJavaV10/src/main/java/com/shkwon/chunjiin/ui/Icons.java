/*
 * Icons.java - 툴바·기능 버튼 아이콘
 *
 * 원본 C 판은 Segoe MDL2 Assets 글꼴 글리프를 썼다. 그 글꼴은 윈도우에만
 * 있으므로 자바스크립트 판이 인라인 SVG 로 다시 그렸고, 여기서는 그 SVG
 * 경로 문자열을 **그대로** 가져와 Java2D 로 그린다.
 *
 * 경로 데이터를 손으로 도형으로 옮겨 적지 않고 작은 파서를 둔 까닭은,
 * 그래야 웹판과 그림이 한 획도 어긋나지 않기 때문이다.
 * 지원하는 명령은 아이콘들이 실제로 쓰는 M L H V C A Z (대소문자) 뿐이다.
 */
package com.shkwon.chunjiin.ui;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.Arc2D;
import java.awt.geom.Path2D;
import java.util.HashMap;
import java.util.Map;

public final class Icons {

    private Icons() {
    }

    /* 원본 SVG viewBox 는 0 0 24 24 다 */
    private static final double VIEW = 24.0;

    private static final Map<String, String> PATHS = new HashMap<>();

    static {
        PATHS.put("new", "M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13 3v6h6");
        PATHS.put("open", "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");
        PATHS.put("save", "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v6h7V3M8 21v-6h8v6");
        PATHS.put("copy", "M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"
            + "M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1");
        PATHS.put("paste", "M9 4h6v3H9zM7 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2");
        PATHS.put("trash", "M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v7M14 10v7");
        PATHS.put("keyboard", "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10");
        PATHS.put("palette", "M12 3a9 9 0 1 0 0 18c1 0 1.5-.6 1.5-1.3 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 "
            + "0-.8.6-1.4 1.4-1.4H16a5 5 0 0 0 5-5c0-4.1-4-8.3-9-8.3zM7.5 12a1 1 0 1 0 0-.01"
            + "M10 8a1 1 0 1 0 0-.01M15 8.5a1 1 0 1 0 0-.01");
        PATHS.put("gear", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8"
            + "l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4"
            + "a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3"
            + "a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1"
            + "a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3"
            + "l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1"
            + "a1.6 1.6 0 0 0-1.5 1z");
        PATHS.put("info", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01");
        PATHS.put("help", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3M12 17h.01");
        PATHS.put("left", "M15 5l-7 7 7 7");
        PATHS.put("right", "M9 5l7 7-7 7");
        PATHS.put("enter", "M20 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4");
        PATHS.put("backspace", "M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7zM17 9l-6 6M11 9l6 6");
    }

    /* 이름 하나를 (x, y) 자리에 size 크기로 그린다. 없는 이름이면 아무것도 안 한다. */
    public static void draw(Graphics2D g, String name, int x, int y, int size, Color color) {
        String d = PATHS.get(name);
        if (d == null) return;

        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g2.translate(x, y);
        double scale = size / VIEW;
        g2.scale(scale, scale);
        g2.setColor(color);
        g2.setStroke(new BasicStroke(1.7f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g2.draw(parse(d));
        g2.dispose();
    }

    /* ------------------------------------------------------------------ */
    /* 아주 작은 SVG 경로 파서                                             */
    /* ------------------------------------------------------------------ */

    /* 그림이 바뀌지 않으므로 한 번 만든 것을 그대로 다시 쓴다 */
    private static final Map<String, Path2D.Double> CACHE = new HashMap<>();

    private static synchronized Path2D.Double parse(String d) {
        return CACHE.computeIfAbsent(d, Icons::build);
    }

    private static Path2D.Double build(String d) {
        Path2D.Double path = new Path2D.Double();
        Cursor c = new Cursor(d);

        double cx = 0;      /* 현재 점 */
        double cy = 0;
        double sx = 0;      /* 지금 부분 경로의 시작점 (Z 가 돌아갈 곳) */
        double sy = 0;
        char cmd = 0;

        while (c.skipSeparators()) {
            char ch = c.peek();
            if (Character.isLetter(ch)) {
                cmd = ch;
                c.next();
            } else if (cmd == 'M') {
                cmd = 'L';      /* M 뒤에 좌표가 이어지면 L 로 친다 (SVG 규칙) */
            } else if (cmd == 'm') {
                cmd = 'l';
            }

            boolean rel = Character.isLowerCase(cmd);
            double bx = rel ? cx : 0;
            double by = rel ? cy : 0;

            switch (Character.toUpperCase(cmd)) {
                case 'M': {
                    cx = c.num() + bx;
                    cy = c.num() + by;
                    path.moveTo(cx, cy);
                    sx = cx;
                    sy = cy;
                    break;
                }
                case 'L': {
                    cx = c.num() + bx;
                    cy = c.num() + by;
                    path.lineTo(cx, cy);
                    break;
                }
                case 'H': {
                    cx = c.num() + bx;
                    path.lineTo(cx, cy);
                    break;
                }
                case 'V': {
                    cy = c.num() + by;
                    path.lineTo(cx, cy);
                    break;
                }
                case 'C': {
                    double x1 = c.num() + bx;
                    double y1 = c.num() + by;
                    double x2 = c.num() + bx;
                    double y2 = c.num() + by;
                    cx = c.num() + bx;
                    cy = c.num() + by;
                    path.curveTo(x1, y1, x2, y2, cx, cy);
                    break;
                }
                case 'A': {
                    double rx = c.num();
                    double ry = c.num();
                    double rot = c.num();
                    boolean largeArc = c.num() != 0;
                    boolean sweep = c.num() != 0;
                    double x = c.num() + bx;
                    double y = c.num() + by;
                    arcTo(path, cx, cy, rx, ry, rot, largeArc, sweep, x, y);
                    cx = x;
                    cy = y;
                    break;
                }
                case 'Z': {
                    path.closePath();
                    cx = sx;
                    cy = sy;
                    break;
                }
                default:
                    return path;    /* 모르는 명령이면 거기서 멈춘다 */
            }
        }
        return path;
    }

    /*
     * SVG 의 끝점 표기 호(arc)를 중심점 표기로 바꿔 Java2D 에 넘긴다.
     * SVG 1.1 부록 F.6.5 의 셈법 그대로다.
     */
    private static void arcTo(Path2D.Double path, double x0, double y0,
                              double rx, double ry, double rotDeg,
                              boolean largeArc, boolean sweep, double x, double y) {
        if (rx == 0 || ry == 0) {
            path.lineTo(x, y);
            return;
        }
        rx = Math.abs(rx);
        ry = Math.abs(ry);

        double phi = Math.toRadians(rotDeg % 360.0);
        double cosPhi = Math.cos(phi);
        double sinPhi = Math.sin(phi);

        /* 1) 시작점과 끝점의 중점을 원점으로 옮긴 좌표 */
        double dx2 = (x0 - x) / 2.0;
        double dy2 = (y0 - y) / 2.0;
        double x1 = cosPhi * dx2 + sinPhi * dy2;
        double y1 = -sinPhi * dx2 + cosPhi * dy2;

        /* 2) 반지름이 모자라면 늘린다 */
        double lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
        if (lambda > 1) {
            double s = Math.sqrt(lambda);
            rx *= s;
            ry *= s;
        }

        /* 3) 중심 구하기 */
        double sign = largeArc == sweep ? -1 : 1;
        double num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
        double den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
        double coef = sign * Math.sqrt(Math.max(0, num / den));
        double cx1 = coef * (rx * y1 / ry);
        double cy1 = coef * (-ry * x1 / rx);

        double cxc = cosPhi * cx1 - sinPhi * cy1 + (x0 + x) / 2.0;
        double cyc = sinPhi * cx1 + cosPhi * cy1 + (y0 + y) / 2.0;

        /* 4) 시작각과 벌림각 */
        double ux = (x1 - cx1) / rx;
        double uy = (y1 - cy1) / ry;
        double vx = (-x1 - cx1) / rx;
        double vy = (-y1 - cy1) / ry;

        double startAngle = angle(1, 0, ux, uy);
        double sweepAngle = angle(ux, uy, vx, vy);

        if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
        else if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

        /*
         * Java2D 의 각은 화면 좌표와 반대 방향(위쪽이 양수)이므로 부호를 뒤집는다.
         * 회전이 있으면 그만큼 다시 돌려 준다.
         */
        Arc2D.Double arc = new Arc2D.Double(
            cxc - rx, cyc - ry, rx * 2, ry * 2,
            Math.toDegrees(-startAngle), Math.toDegrees(-sweepAngle), Arc2D.OPEN);

        AffineTransform at = AffineTransform.getRotateInstance(phi, cxc, cyc);
        path.append(at.createTransformedShape(arc).getPathIterator(null), true);
    }

    private static double angle(double ux, double uy, double vx, double vy) {
        double dot = ux * vx + uy * vy;
        double len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        double a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        return (ux * vy - uy * vx) < 0 ? -a : a;
    }

    /* 경로 문자열을 앞에서부터 숫자·명령으로 잘라 읽는다. */
    private static final class Cursor {
        private final String s;
        private int i;

        Cursor(String s) {
            this.s = s;
        }

        /* 남은 것이 있으면 true. 구분자(공백, 쉼표)는 건너뛴다. */
        boolean skipSeparators() {
            while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == ',' || s.charAt(i) == '\n')) i++;
            return i < s.length();
        }

        char peek() {
            return s.charAt(i);
        }

        void next() {
            i++;
        }

        /*
         * 숫자 하나. "-.01" 이나 "1.5e-3" 같은 모양도 받는다.
         *
         * 소수점은 하나만 받는다. SVG 는 "-.6.3" 을 -0.6 과 0.3 두 개로 읽으므로
         * 두 번째 점을 만나면 거기서 끊어야 한다.
         */
        double num() {
            skipSeparators();
            int start = i;
            boolean dot = false;
            if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
            while (i < s.length()) {
                char ch = s.charAt(i);
                if (Character.isDigit(ch)) {
                    i++;
                } else if (ch == '.' && !dot) {
                    dot = true;
                    i++;
                } else {
                    break;
                }
            }
            if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                i++;
                if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                while (i < s.length() && Character.isDigit(s.charAt(i))) i++;
            }
            if (start == i) return 0;
            return Double.parseDouble(s.substring(start, i));
        }
    }
}
