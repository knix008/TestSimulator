using System;
using OpenCvSharp;

namespace Yolo26Detection1._0
{
    /// <summary>
    /// 검출 인스턴스 순번마다 서로 다른 박스·라벨 배경 색(BGR)을 쓰고, 라벨 글자는 배경 대비로 읽기 쉽게 맞춥니다.
    /// </summary>
    internal static class DetectionColors
    {
        internal static void GetForInstance(int instanceIndex, out Scalar boxBgr, out Scalar labelBgBgr, out Scalar labelTextBgr)
        {
            double hBox = (instanceIndex * 137.508) % 360.0;
            boxBgr = HsvToBgr(hBox, 0.78, 0.92);
            labelBgBgr = HsvToBgr(hBox, 0.62, 0.42);
            labelTextBgr = ContrastingTextBgr(labelBgBgr);
        }

        private static Scalar ContrastingTextBgr(Scalar labelBgBgr)
        {
            double b = labelBgBgr.Val0, g = labelBgBgr.Val1, r = labelBgBgr.Val2;
            double lum = 0.299 * r + 0.587 * g + 0.114 * b;
            return lum > 140
                ? new Scalar(16, 16, 16)
                : new Scalar(255, 255, 255);
        }

        private static Scalar HsvToBgr(double hDeg, double s, double v)
        {
            s = Clamp01(s);
            v = Clamp01(v);
            double h = hDeg % 360.0;
            if (h < 0) h += 360.0;
            double c = v * s;
            double x = c * (1 - Math.Abs((h / 60.0 % 2) - 1));
            double m = v - c;
            double rp = 0, gp = 0, bp = 0;
            int hi = (int)(h / 60.0);
            if (hi >= 6) hi = 5;
            switch (hi)
            {
                case 0: rp = c; gp = x; bp = 0; break;
                case 1: rp = x; gp = c; bp = 0; break;
                case 2: rp = 0; gp = c; bp = x; break;
                case 3: rp = 0; gp = x; bp = c; break;
                case 4: rp = x; gp = 0; bp = c; break;
                default: rp = c; gp = 0; bp = x; break;
            }
            return new Scalar(
                (byte)Math.Round((bp + m) * 255),
                (byte)Math.Round((gp + m) * 255),
                (byte)Math.Round((rp + m) * 255));
        }

        private static double Clamp01(double x)
        {
            if (x < 0) return 0;
            if (x > 1) return 1;
            return x;
        }
    }
}
