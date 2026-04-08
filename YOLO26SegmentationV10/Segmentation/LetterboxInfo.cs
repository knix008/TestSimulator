using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace YOLO26SegmentationV10.Segmentation
{
    internal sealed class LetterboxInfo
    {
        public LetterboxInfo(int netSize, float gain, int padLeft, int padTop, int origWidth, int origHeight)
        {
            NetSize = netSize;
            Gain = gain;
            PadLeft = padLeft;
            PadTop = padTop;
            OrigWidth = origWidth;
            OrigHeight = origHeight;
        }

        public int NetSize { get; }
        public float Gain { get; }
        public int PadLeft { get; }
        public int PadTop { get; }
        public int OrigWidth { get; }
        public int OrigHeight { get; }

        public static LetterboxInfo FromBitmap(Bitmap src, int netSize)
        {
            var w = src.Width;
            var h = src.Height;
            var gain = Math.Min((float)netSize / h, (float)netSize / w);
            var nw = (int)Math.Round(w * gain);
            var nh = (int)Math.Round(h * gain);
            var dw = (netSize - nw) / 2f;
            var dh = (netSize - nh) / 2f;
            var padLeft = (int)Math.Floor(dw);
            var padTop = (int)Math.Floor(dh);
            return new LetterboxInfo(netSize, gain, padLeft, padTop, w, h);
        }

        /// <summary>CHW float tensor [1,3,H,W], RGB 0..1, Ultralytics-style letterbox.</summary>
        public static float[] ToChwTensor(Bitmap src, LetterboxInfo lb)
        {
            var net = lb.NetSize;
            var nw = (int)Math.Round(lb.OrigWidth * lb.Gain);
            var nh = (int)Math.Round(lb.OrigHeight * lb.Gain);

            using (var canvas = new Bitmap(net, net, PixelFormat.Format24bppRgb))
            {
                using (var g = Graphics.FromImage(canvas))
                {
                    g.Clear(Color.FromArgb(114, 114, 114));
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.DrawImage(src, lb.PadLeft, lb.PadTop, nw, nh);
                }

                var rect = new Rectangle(0, 0, net, net);
                var bmpData = canvas.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
                try
                {
                    var stride = bmpData.Stride;
                    var byteCount = Math.Abs(stride) * net;
                    var buffer = new byte[byteCount];
                    Marshal.Copy(bmpData.Scan0, buffer, 0, byteCount);

                    var data = new float[3 * net * net];
                    for (var y = 0; y < net; y++)
                    {
                        var rowOffset = y * stride;
                        for (var x = 0; x < net; x++)
                        {
                            var i = rowOffset + x * 3;
                            var b = buffer[i] / 255f;
                            var gch = buffer[i + 1] / 255f;
                            var r = buffer[i + 2] / 255f;
                            data[0 * net * net + y * net + x] = r;
                            data[1 * net * net + y * net + x] = gch;
                            data[2 * net * net + y * net + x] = b;
                        }
                    }

                    return data;
                }
                finally
                {
                    canvas.UnlockBits(bmpData);
                }
            }
        }
    }
}
