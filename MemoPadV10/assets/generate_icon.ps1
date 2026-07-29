# 모던한 3D 느낌의 메모 아이콘(app.ico)을 생성합니다.
# 입체 카드 스택 + 세로 그라디언트 + 광택 하이라이트 + 소프트 그림자로 3D처럼 보이게 그립니다.
# 사용법: powershell -ExecutionPolicy Bypass -File assets\generate_icon.ps1
Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class IconGen
{
    static GraphicsPath Rounded(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = radius * 2f;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static void DrawCard(Graphics g, float s, float ox, float oy, Color c1, bool gradient, Color c2)
    {
        var rect = new RectangleF(ox * s, oy * s, 176f * s, 196f * s);
        using (var path = Rounded(rect, 30f * s))
        {
            if (gradient)
            {
                using (var br = new LinearGradientBrush(rect, c1, c2, LinearGradientMode.Vertical))
                    g.FillPath(br, path);

                float hh = rect.Height * 0.52f;
                var glossRect = new RectangleF(rect.X, rect.Y, rect.Width, hh);
                using (var hp = Rounded(rect, 30f * s))
                using (var hb = new LinearGradientBrush(
                    new RectangleF(rect.X, rect.Y, rect.Width, hh + 1f),
                    Color.FromArgb(85, 255, 255, 255),
                    Color.FromArgb(0, 255, 255, 255),
                    LinearGradientMode.Vertical))
                {
                    var st = g.Save();
                    g.SetClip(hp);
                    g.FillRectangle(hb, glossRect);
                    g.Restore(st);
                }
            }
            else
            {
                using (var br = new SolidBrush(c1))
                    g.FillPath(br, path);
            }
        }
    }

    public static Bitmap Draw(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            float s = size / 256f;

            for (int i = 8; i >= 1; i--)
            {
                var sr = new RectangleF((30f + i * 1.4f) * s, (16f + i * 2.0f) * s, 176f * s, 196f * s);
                using (var sp = Rounded(sr, 30f * s))
                using (var sb = new SolidBrush(Color.FromArgb(9, 20, 24, 60)))
                    g.FillPath(sb, sp);
            }

            DrawCard(g, s, 40f, 44f, Color.FromArgb(255, 205, 160, 45), false, Color.Empty);
            DrawCard(g, s, 31f, 30f, Color.FromArgb(255, 232, 190, 70), false, Color.Empty);
            DrawCard(g, s, 22f, 16f, Color.FromArgb(255, 255, 236, 150), true, Color.FromArgb(255, 245, 203, 70));

            float fx = 48f * s;
            float fyTop = 66f * s;
            float baseW = 108f * s;
            float[] widths = { 1.0f, 0.82f, 0.94f, 0.66f };
            for (int i = 0; i < widths.Length; i++)
            {
                var lr = new RectangleF(fx, fyTop + i * 27f * s, baseW * widths[i], 13f * s);
                using (var lp = Rounded(lr, 6.5f * s))
                using (var lb = new SolidBrush(i == 0
                        ? Color.FromArgb(255, 214, 90, 40)
                        : Color.FromArgb(210, 120, 90, 35)))
                    g.FillPath(lb, lp);
            }
        }
        return bmp;
    }

    static byte[] ToDib(Bitmap bmp)
    {
        int w = bmp.Width, h = bmp.Height;
        int xorSize = w * h * 4;
        int andStride = ((w + 31) / 32) * 4;
        int andSize = andStride * h;

        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write(40);              // biSize
            bw.Write(w);               // biWidth
            bw.Write(h * 2);           // biHeight (XOR + AND)
            bw.Write((short)1);        // planes
            bw.Write((short)32);       // bpp
            bw.Write(0);               // compression (BI_RGB)
            bw.Write(xorSize + andSize); // biSizeImage
            bw.Write(0); bw.Write(0);  // resolution
            bw.Write(0); bw.Write(0);  // colors

            var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int stride = data.Stride;
            byte[] buf = new byte[stride * h];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, buf, 0, buf.Length);
            bmp.UnlockBits(data);

            for (int y = h - 1; y >= 0; y--) // bottom-up
                bw.Write(buf, y * stride, w * 4);
            bw.Write(new byte[andSize]);     // AND mask (unused; alpha handles transparency)

            bw.Flush();
            return ms.ToArray();
        }
    }

    public static void Generate(string outPath)
    {
        int[] sizes = { 16, 24, 32, 48, 64, 128, 256 };
        var dibs = new List<byte[]>();
        foreach (var sz in sizes)
            using (var b = Draw(sz))
                dibs.Add(ToDib(b));

        using (var fs = new FileStream(outPath, FileMode.Create))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((short)0);
            bw.Write((short)1);
            bw.Write((short)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                int sz = sizes[i];
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((short)1);
                bw.Write((short)32);
                bw.Write(dibs[i].Length);
                bw.Write(offset);
                offset += dibs[i].Length;
            }
            foreach (var d in dibs) bw.Write(d);
        }
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$out = Join-Path $PSScriptRoot 'app.ico'
[IconGen]::Generate($out)
Write-Host "Created $out"
