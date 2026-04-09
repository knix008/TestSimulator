using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace YOLO26V10
{
    internal static class PreviewPlaceholders
    {
        public static Bitmap Create(string title, string subtitle)
        {
            const int w = 960;
            const int h = 540;
            var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
                g.Clear(UiTheme.Canvas);
                using (var border = new Pen(UiTheme.BorderSubtle, 1))
                    g.DrawRectangle(border, 0, 0, w - 1, h - 1);

                using (var titleFont = new Font(SystemFonts.MessageBoxFont.FontFamily, 20f, FontStyle.Bold))
                using (var subFont = new Font(SystemFonts.MessageBoxFont.FontFamily, 11f))
                using (var titleBrush = new SolidBrush(UiTheme.TextPrimary))
                using (var subBrush = new SolidBrush(UiTheme.TextSecondary))
                {
                    var titleSize = g.MeasureString(title, titleFont);
                    var subSize = g.MeasureString(subtitle, subFont);
                    var y = (h - titleSize.Height - subSize.Height - 10f) / 2;
                    g.DrawString(title, titleFont, titleBrush, (w - titleSize.Width) / 2, y);
                    g.DrawString(subtitle, subFont, subBrush, (w - subSize.Width) / 2, y + titleSize.Height + 10f);
                }
            }

            return bmp;
        }
    }
}

