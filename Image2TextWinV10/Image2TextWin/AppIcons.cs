namespace Image2TextWin;

/// <summary>
/// 프로그램에서 사용하는 모든 아이콘을 GDI+로 생성하는 정적 클래스.
/// </summary>
public static class AppIcons
{
    private static readonly Dictionary<string, Bitmap> _cache = new();

    public static Bitmap Get(string key, int size = 16)
    {
        string cacheKey = $"{key}_{size}";
        if (_cache.TryGetValue(cacheKey, out var cached)) return cached;
        var bmp = Create(key, size);
        _cache[cacheKey] = bmp;
        return bmp;
    }

    // 아이콘 적용은 Image2TextForm.InitializeIcons()에서 직접 호출

    private static Bitmap Create(string key, int size) => key switch
    {
        "open-image"    => DrawOpenImage(size),
        "open-text"     => DrawOpenText(size),
        "save"          => DrawSave(size),
        "export"        => DrawExport(size),
        "export-html"   => DrawExportHtml(size),
        "export-pdf"    => DrawExportPdf(size),
        "export-word"   => DrawExportWord(size),
        "export-image"  => DrawExportImage(size),
        "exit"          => DrawExit(size),
        "copy"          => DrawCopy(size),
        "select-all"    => DrawSelectAll(size),
        "edit-mode"     => DrawEditMode(size),
        "convert"       => DrawConvert(size),
        "redraw"        => DrawRedraw(size),
        "zoom-in"       => DrawZoom(size, '+'),
        "zoom-out"      => DrawZoom(size, '-'),
        "zoom-reset"    => DrawZoom(size, '='),
        "charset-next"  => DrawCharsetNext(size),
        _               => DrawFallback(size),
    };

    // ── 공통 헬퍼 ─────────────────────────────────────────────────────────

    private static (Bitmap bmp, Graphics g) NewBitmap(int size)
    {
        var bmp = new Bitmap(size, size);
        var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        return (bmp, g);
    }

    private static Font ScaledFont(string name, int size, FontStyle style = FontStyle.Bold)
        => new Font(name, Math.Max(5f, size * 0.48f), style);

    private static void DrawLabel(Graphics g, string text, int size,
        Color fg, Color bg, Font? font = null)
    {
        float pad = size * 0.08f;
        var rect = new RectangleF(pad, pad, size - pad * 2, size - pad * 2);
        using var bgBrush = new SolidBrush(bg);
        g.FillRectangle(bgBrush, rect);
        using var fgBrush = new SolidBrush(fg);
        var f = font ?? ScaledFont("Arial", size);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString(text, f, fgBrush, rect, sf);
    }

    // ── 개별 아이콘 ───────────────────────────────────────────────────────

    private static Bitmap DrawOpenImage(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;

        // 폴더 (노란색)
        var folder = new[]
        {
            new PointF(s, s*5), new PointF(s, s*13), new PointF(s*15, s*13),
            new PointF(s*15, s*6), new PointF(s*7, s*6), new PointF(s*5.5f, s*5)
        };
        using var folderBrush = new SolidBrush(Color.FromArgb(255, 200, 140, 20));
        g.FillPolygon(folderBrush, folder);
        using var folderPen = new Pen(Color.FromArgb(180, 150, 80), Math.Max(1f, s * 0.6f));
        g.DrawPolygon(folderPen, folder);

        // 이미지 프레임 (흰색 직사각형)
        float fx = s * 3, fy = s * 6.5f, fw = s * 10, fh = s * 5.5f;
        using var frameBrush = new SolidBrush(Color.White);
        g.FillRectangle(frameBrush, fx, fy, fw, fh);
        using var framePen = new Pen(Color.SteelBlue, Math.Max(1f, s * 0.5f));
        g.DrawRectangle(framePen, fx, fy, fw, fh);

        // 산 모양 (초록)
        var mtn = new[] {
            new PointF(fx + 1, fy + fh - 1),
            new PointF(fx + fw * 0.45f, fy + fh * 0.35f),
            new PointF(fx + fw - 1, fy + fh - 1)
        };
        using var mtnBrush = new SolidBrush(Color.FromArgb(180, 60, 160, 60));
        g.FillPolygon(mtnBrush, mtn);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawOpenText(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float dx = s * 2, dy = s * 1, dw = s * 10, dh = s * 13;

        // 접힌 모서리 문서
        float fold = s * 3;
        var doc = new[] {
            new PointF(dx, dy),
            new PointF(dx + dw - fold, dy),
            new PointF(dx + dw, dy + fold),
            new PointF(dx + dw, dy + dh),
            new PointF(dx, dy + dh)
        };
        using var docBrush = new SolidBrush(Color.White);
        g.FillPolygon(docBrush, doc);
        using var foldBrush = new SolidBrush(Color.LightSteelBlue);
        g.FillPolygon(foldBrush, new[] {
            new PointF(dx + dw - fold, dy),
            new PointF(dx + dw, dy + fold),
            new PointF(dx + dw - fold, dy + fold)
        });
        using var docPen = new Pen(Color.SteelBlue, Math.Max(1f, s * 0.5f));
        g.DrawPolygon(docPen, doc);

        // 텍스트 라인들
        using var lineBrush = new SolidBrush(Color.FromArgb(80, 80, 180));
        float lx = dx + s, lh2 = Math.Max(1f, s * 0.7f);
        float[] widths = { dw - s * 2, dw * 0.7f, dw - s * 2, dw * 0.55f };
        for (int i = 0; i < 4; i++)
            g.FillRectangle(lineBrush, lx, dy + fold + s * (1.2f + i * 2f), widths[i], lh2);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawSave(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float m = s;

        // 플로피 디스크 외형
        using var bodyBrush = new SolidBrush(Color.FromArgb(60, 100, 160));
        g.FillRectangle(bodyBrush, m, m, size - m * 2, size - m * 2);

        // 상단 슬롯 (밝은 부분)
        using var topBrush = new SolidBrush(Color.FromArgb(200, 220, 240));
        g.FillRectangle(topBrush, m + s, m, size - m * 2 - s * 2, s * 5);

        // 슬롯 안의 레이블 금속
        using var labelBrush = new SolidBrush(Color.FromArgb(170, 190, 220));
        g.FillRectangle(labelBrush, m + s * 2, m + s * 0.5f, s * 5, s * 4);

        // 하단 금속 뚜껑
        using var metalBrush = new SolidBrush(Color.FromArgb(130, 150, 180));
        g.FillRectangle(metalBrush, m + s * 4, m + s * 7, s * 5, s * 5);

        using var pen = new Pen(Color.FromArgb(40, 70, 130), Math.Max(1f, s * 0.5f));
        g.DrawRectangle(pen, m, m, size - m * 2, size - m * 2);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExport(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float cx = size * 0.5f, cy = size * 0.5f;
        float r = size * 0.42f;

        using var circleBrush = new SolidBrush(Color.FromArgb(30, 140, 80));
        g.FillEllipse(circleBrush, cx - r, cy - r, r * 2, r * 2);

        // 위쪽 화살표 → 오른쪽 위
        float aw = s * 3f, ah = s * 3f;
        using var arrowBrush = new SolidBrush(Color.White);
        var arrow = new[] {
            new PointF(cx, cy - s * 0.5f),
            new PointF(cx + aw, cy - s * 0.5f),
            new PointF(cx + aw, cy - ah),
            new PointF(cx + aw + s * 1.5f, cy + s * 0.5f),
            new PointF(cx + aw, cy + ah + s),
            new PointF(cx + aw, cy + s * 0.5f),
            new PointF(cx, cy + s * 0.5f)
        };
        g.FillPolygon(arrowBrush, arrow);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExportHtml(int size)
    {
        var (bmp, g) = NewBitmap(size);
        using var bgBrush = new SolidBrush(Color.FromArgb(230, 90, 30));
        g.FillRectangle(bgBrush, 0, 0, size, size);
        using var font = ScaledFont("Arial", size);
        using var fgBrush = new SolidBrush(Color.White);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("</>", font, fgBrush, new RectangleF(0, 0, size, size), sf);
        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExportPdf(int size)
    {
        var (bmp, g) = NewBitmap(size);
        using var bgBrush = new SolidBrush(Color.FromArgb(200, 30, 30));
        g.FillRectangle(bgBrush, 0, 0, size, size);
        using var font = ScaledFont("Arial", size);
        using var fgBrush = new SolidBrush(Color.White);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("PDF", font, fgBrush, new RectangleF(0, 0, size, size), sf);
        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExportWord(int size)
    {
        var (bmp, g) = NewBitmap(size);
        using var bgBrush = new SolidBrush(Color.FromArgb(30, 80, 180));
        g.FillRectangle(bgBrush, 0, 0, size, size);
        using var font = new Font("Arial", Math.Max(6f, size * 0.60f), FontStyle.Bold);
        using var fgBrush = new SolidBrush(Color.White);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("W", font, fgBrush, new RectangleF(0, 0, size, size), sf);
        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExportImage(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float m = s * 1.5f;

        // 이미지 프레임
        using var bgBrush = new SolidBrush(Color.FromArgb(200, 220, 255));
        g.FillRectangle(bgBrush, m, m, size - m * 2, size - m * 2);
        using var pen = new Pen(Color.SteelBlue, Math.Max(1f, s * 0.7f));
        g.DrawRectangle(pen, m, m, size - m * 2, size - m * 2);

        // 산
        var mtn = new[] {
            new PointF(m + 1, size - m - 1),
            new PointF(size * 0.5f, m + s * 3),
            new PointF(size - m - 1, size - m - 1)
        };
        using var mtnBrush = new SolidBrush(Color.FromArgb(200, 60, 140, 60));
        g.FillPolygon(mtnBrush, mtn);

        // 태양 (작은 원)
        float sr = s * 1.5f;
        using var sunBrush = new SolidBrush(Color.FromArgb(220, 200, 30));
        g.FillEllipse(sunBrush, m + s, m + s, sr * 2, sr * 2);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawExit(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;

        // 문
        using var doorBrush = new SolidBrush(Color.FromArgb(180, 60, 60));
        g.FillRectangle(doorBrush, s * 2, s * 2, s * 8, s * 12);
        using var doorPen = new Pen(Color.DarkRed, Math.Max(1f, s * 0.5f));
        g.DrawRectangle(doorPen, s * 2, s * 2, s * 8, s * 12);

        // 오른쪽 화살표 (나가는 방향)
        float ax = s * 10, ay = size * 0.5f;
        using var arrowBrush = new SolidBrush(Color.DarkRed);
        var arrow = new[] {
            new PointF(ax, ay - s), new PointF(ax + s * 3, ay - s),
            new PointF(ax + s * 3, ay - s * 2.2f), new PointF(ax + s * 5, ay),
            new PointF(ax + s * 3, ay + s * 2.2f), new PointF(ax + s * 3, ay + s),
            new PointF(ax, ay + s)
        };
        g.FillPolygon(arrowBrush, arrow);

        // 문 손잡이
        using var handleBrush = new SolidBrush(Color.Gold);
        g.FillEllipse(handleBrush, s * 7.5f, size * 0.48f, s * 1.5f, s * 1.5f);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawCopy(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;

        // 뒤 문서 (파란색)
        using var backBrush = new SolidBrush(Color.FromArgb(180, 180, 220));
        g.FillRectangle(backBrush, s * 4, s * 1, s * 9, s * 10);
        using var backPen = new Pen(Color.SteelBlue, Math.Max(1f, s * 0.5f));
        g.DrawRectangle(backPen, s * 4, s * 1, s * 9, s * 10);

        // 앞 문서 (흰색)
        using var frontBrush = new SolidBrush(Color.White);
        g.FillRectangle(frontBrush, s * 1.5f, s * 4, s * 9, s * 10);
        using var frontPen = new Pen(Color.SteelBlue, Math.Max(1f, s * 0.5f));
        g.DrawRectangle(frontPen, s * 1.5f, s * 4, s * 9, s * 10);

        // 텍스트 라인
        using var lineBrush = new SolidBrush(Color.FromArgb(100, 100, 180));
        g.FillRectangle(lineBrush, s * 3, s * 6, s * 6, s * 0.8f);
        g.FillRectangle(lineBrush, s * 3, s * 8, s * 5, s * 0.8f);
        g.FillRectangle(lineBrush, s * 3, s * 10, s * 6, s * 0.8f);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawSelectAll(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float m = s * 1.5f;

        // 점선 선택 영역
        using var dashPen = new Pen(Color.FromArgb(50, 120, 200), Math.Max(1f, s * 0.6f));
        dashPen.DashPattern = new[] { 2f, 1.5f };
        g.DrawRectangle(dashPen, m, m, size - m * 2, size - m * 2);

        // 모서리 핸들
        using var handleBrush = new SolidBrush(Color.FromArgb(50, 120, 200));
        float hs = s * 1.2f;
        foreach (var (hx, hy) in new[] { (m, m), (size - m - hs, m), (m, size - m - hs), (size - m - hs, size - m - hs) })
            g.FillRectangle(handleBrush, hx, hy, hs, hs);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawEditMode(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;

        // 연필 모양
        float angle = -45f;
        g.TranslateTransform(size * 0.5f, size * 0.5f);
        g.RotateTransform(angle);
        g.TranslateTransform(-size * 0.5f, -size * 0.5f);

        float px = size * 0.35f, py = s;
        float pw = s * 3f, ph = size - s * 4;

        // 연필 몸통
        using var bodyBrush = new SolidBrush(Color.FromArgb(255, 200, 40));
        g.FillRectangle(bodyBrush, px, py + s * 2, pw, ph - s * 2);

        // 연필 끝 (지우개)
        using var eraserBrush = new SolidBrush(Color.FromArgb(255, 150, 160));
        g.FillRectangle(eraserBrush, px, py, pw, s * 2);

        // 연필 심 (삼각형)
        using var tipBrush = new SolidBrush(Color.FromArgb(50, 40, 30));
        var tip = new[] {
            new PointF(px, py + ph),
            new PointF(px + pw, py + ph),
            new PointF(px + pw * 0.5f, py + ph + s * 2)
        };
        g.FillPolygon(tipBrush, tip);

        using var pen = new Pen(Color.DarkGoldenrod, Math.Max(1f, s * 0.4f));
        g.DrawRectangle(pen, px, py, pw, ph);

        g.ResetTransform();
        g.Dispose(); return bmp;
    }

    private static Bitmap DrawConvert(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float cx = size * 0.5f, cy = size * 0.5f;
        float r = size * 0.44f;

        // 녹색 원
        using var circleBrush = new SolidBrush(Color.FromArgb(30, 160, 60));
        g.FillEllipse(circleBrush, cx - r, cy - r, r * 2, r * 2);

        // 재생 삼각형 (흰색)
        float ts = size * 0.28f;
        var tri = new[] {
            new PointF(cx - ts * 0.4f, cy - ts),
            new PointF(cx + ts, cy),
            new PointF(cx - ts * 0.4f, cy + ts)
        };
        using var triBrush = new SolidBrush(Color.White);
        g.FillPolygon(triBrush, tri);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawRedraw(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float cx = size * 0.5f, cy = size * 0.5f;
        float r = size * 0.40f;
        float sw = Math.Max(2f, size * 0.15f);

        // 순환 화살표 (두 개의 반원 호)
        using var arcPen = new Pen(Color.FromArgb(20, 120, 200), sw);
        arcPen.EndCap = System.Drawing.Drawing2D.LineCap.ArrowAnchor;
        g.DrawArc(arcPen, cx - r, cy - r, r * 2, r * 2, 30f, 130f);
        g.DrawArc(arcPen, cx - r, cy - r, r * 2, r * 2, 210f, 130f);

        // 중앙 텍스트: A/B 기호 변환 암시
        using var font = new Font("Arial", Math.Max(4f, size * 0.25f), FontStyle.Bold);
        using var textBrush = new SolidBrush(Color.FromArgb(20, 120, 200));
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("A→", font, textBrush, new RectangleF(cx - r * 0.7f, cy - r * 0.4f, r * 1.4f, r * 0.8f), sf);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawZoom(int size, char sign)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float r = size * 0.32f;
        float cx = size * 0.42f, cy = size * 0.42f;

        // 돋보기 원
        using var circlePen = new Pen(Color.FromArgb(60, 80, 130), Math.Max(1.5f, s * 0.9f));
        g.DrawEllipse(circlePen, cx - r, cy - r, r * 2, r * 2);

        // 손잡이
        float hx1 = cx + r * 0.7f, hy1 = cy + r * 0.7f;
        float hx2 = size - s * 1.5f, hy2 = size - s * 1.5f;
        using var handlePen = new Pen(Color.FromArgb(60, 80, 130), Math.Max(2f, s * 1.0f));
        handlePen.EndCap = System.Drawing.Drawing2D.LineCap.Round;
        handlePen.StartCap = System.Drawing.Drawing2D.LineCap.Round;
        g.DrawLine(handlePen, hx1, hy1, hx2, hy2);

        // + / - / = 기호
        using var signPen = new Pen(Color.FromArgb(60, 80, 130), Math.Max(1.5f, s * 0.9f));
        float sl = r * 0.55f;
        g.DrawLine(signPen, cx - sl, cy, cx + sl, cy);
        if (sign == '+')
            g.DrawLine(signPen, cx, cy - sl, cx, cy + sl);
        else if (sign == '=')
            g.DrawLine(signPen, cx - sl, cy + s * 0.8f, cx + sl, cy + s * 0.8f);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawCharsetNext(int size)
    {
        var (bmp, g) = NewBitmap(size);
        float s = size / 16f;
        float cx = size * 0.5f, cy = size * 0.5f;

        // 배경
        using var bgBrush = new SolidBrush(Color.FromArgb(40, 30, 100));
        g.FillRectangle(bgBrush, 0, 0, size, size);

        // "A→B" 문자 변환 아이콘
        using var font1 = new Font("Consolas", Math.Max(5f, size * 0.40f), FontStyle.Bold);
        using var brush1 = new SolidBrush(Color.FromArgb(100, 200, 255));
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("@", font1, brush1,
            new RectangleF(0, 0, size * 0.45f, size), sf);

        using var arrowBrush = new SolidBrush(Color.FromArgb(255, 200, 50));
        using var fontArr = new Font("Arial", Math.Max(4f, size * 0.30f), FontStyle.Bold);
        g.DrawString("→", fontArr, arrowBrush,
            new RectangleF(size * 0.38f, 0, size * 0.30f, size), sf);

        using var brush2 = new SolidBrush(Color.FromArgb(100, 255, 180));
        g.DrawString("#", font1, brush2,
            new RectangleF(size * 0.58f, 0, size * 0.42f, size), sf);

        g.Dispose(); return bmp;
    }

    private static Bitmap DrawFallback(int size)
    {
        var (bmp, g) = NewBitmap(size);
        using var brush = new SolidBrush(Color.Gray);
        g.FillRectangle(brush, 2, 2, size - 4, size - 4);
        g.Dispose(); return bmp;
    }

    public static void DisposeAll()
    {
        foreach (var bmp in _cache.Values) bmp?.Dispose();
        _cache.Clear();
    }
}
