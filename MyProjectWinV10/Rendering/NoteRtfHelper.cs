using MyProject.Models;
using System.Runtime.InteropServices;
using System.Text;

namespace MyProject.Rendering
{
    public static class NoteRtfHelper
    {
        private const int WM_USER = 0x0400;
        private const int EM_FORMATRANGE = WM_USER + 57;

        public static bool HasFormattedContent(ProjectNote note) =>
            !string.IsNullOrWhiteSpace(note.BodyRtf);

        public static string GetPlainText(string? rtf, string? fallbackPlain = "")
        {
            if (string.IsNullOrWhiteSpace(rtf))
                return fallbackPlain ?? "";

            try
            {
                using var rtb = CreateMeasureBox();
                rtb.Rtf = rtf;
                return rtb.Text;
            }
            catch
            {
                return fallbackPlain ?? "";
            }
        }

        public static void ApplyToRichTextBox(RichTextBox rtb, string? rtf, string? plainFallback)
        {
            if (!string.IsNullOrWhiteSpace(rtf))
            {
                try
                {
                    rtb.Rtf = rtf;
                    ClearRichTextBackgroundHighlights(rtb, NoteRenderer.NoteEditorBack);
                    return;
                }
                catch
                {
                    // fall through to plain text
                }
            }

            rtb.Text = plainFallback ?? "";
            ClearRichTextBackgroundHighlights(rtb, NoteRenderer.NoteEditorBack);
        }

        public static string GetRtfFromRichTextBox(RichTextBox rtb)
        {
            if (string.IsNullOrWhiteSpace(rtb.Text))
                return "";

            ClearRichTextBackgroundHighlights(rtb, NoteRenderer.NoteEditorBack);

            try
            {
                return rtb.Rtf ?? "";
            }
            catch
            {
                return "";
            }
        }

        /// <summary>
        /// RichTextBox RTF often embeds white character backgrounds; strip them so note
        /// rendering shows the UML gradient instead of opaque boxes under the text.
        /// </summary>
        public static void ClearRichTextBackgroundHighlights(RichTextBox rtb, Color backColor)
        {
            rtb.BackColor = backColor;
            if (rtb.TextLength <= 0)
                return;

            int selStart = rtb.SelectionStart;
            int selLength = rtb.SelectionLength;
            try
            {
                rtb.SelectAll();
                rtb.SelectionBackColor = backColor;
            }
            finally
            {
                int textLength = rtb.TextLength;
                rtb.SelectionStart = Math.Min(selStart, textLength);
                rtb.SelectionLength = Math.Min(selLength, Math.Max(0, textLength - rtb.SelectionStart));
            }
        }

        public static void DrawNoteContent(Graphics graphics, ProjectNote note, RectangleF bounds, bool isSelected)
        {
            if (HasFormattedContent(note))
            {
                DrawRtf(graphics, note.BodyRtf, Rectangle.Round(bounds), NoteRenderer.NoteEditorBack);
                return;
            }

            DrawPlainText(graphics, note, bounds, isSelected);
        }

        private static void DrawPlainText(Graphics g, ProjectNote note, RectangleF bounds, bool isSelected)
        {
            string text = note.Body;
            if (string.IsNullOrWhiteSpace(text))
                text = string.IsNullOrWhiteSpace(note.Title) ? "Note" : note.Title.Trim();

            text = text.Replace('\r', '\n');
            if (text.Length > 120)
                text = text[..120] + "…";

            using var brush = new SolidBrush(isSelected ? Color.FromArgb(32, 33, 36) : Color.FromArgb(32, 32, 32));
            using var format = new StringFormat
            {
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.LineLimit
            };

            g.DrawString(text, NoteRenderer.NoteEditorFont, brush, bounds, format);
        }

        public static void DrawRtf(Graphics graphics, string rtf, Rectangle bounds, Color backColor)
        {
            if (string.IsNullOrWhiteSpace(rtf) || bounds.Width <= 0 || bounds.Height <= 0)
                return;

            using var rtb = CreateMeasureBox();
            rtb.BackColor = backColor;
            try
            {
                rtb.Rtf = rtf;
            }
            catch
            {
                return;
            }

            ClearRichTextBackgroundHighlights(rtb, backColor);

            float dpiX = graphics.DpiX;
            float dpiY = graphics.DpiY;

            var rect = new RECT
            {
                Left = ToTwips(bounds.Left, dpiX),
                Top = ToTwips(bounds.Top, dpiY),
                Right = ToTwips(bounds.Right, dpiX),
                Bottom = ToTwips(bounds.Bottom, dpiY)
            };

            var fmt = new FORMATRANGE
            {
                chrg = new CHARFORMATRANGE { cpMin = 0, cpMax = -1 },
                rc = rect,
                rcPage = rect
            };

            IntPtr hdc = graphics.GetHdc();
            try
            {
                fmt.hdc = hdc;
                fmt.hdcTarget = hdc;
                SendMessage(rtb.Handle, EM_FORMATRANGE, 1, ref fmt);
                SendMessage(rtb.Handle, EM_FORMATRANGE, 0, ref fmt);
            }
            finally
            {
                graphics.ReleaseHdc(hdc);
            }
        }

        public static string ToSimpleHtml(string? rtf, string? plainFallback)
        {
            if (string.IsNullOrWhiteSpace(rtf))
                return EscapeHtml(plainFallback ?? "");

            try
            {
                using var rtb = CreateMeasureBox();
                rtb.Rtf = rtf;
                var sb = new StringBuilder();
                bool bold = false;
                bool italic = false;
                bool underline = false;
                bool strike = false;

                for (int i = 0; i < rtb.TextLength; i++)
                {
                    rtb.Select(i, 1);
                    var font = rtb.SelectionFont ?? rtb.Font;
                    bool b = font.Bold;
                    bool it = font.Italic;
                    bool u = font.Underline;
                    bool s = font.Strikeout;

                    if (b != bold) { CloseTags(sb, bold, italic, underline, strike); bold = b; OpenTags(sb, bold, italic, underline, strike); }
                    if (it != italic) { CloseTags(sb, bold, italic, underline, strike); italic = it; OpenTags(sb, bold, italic, underline, strike); }
                    if (u != underline) { CloseTags(sb, bold, italic, underline, strike); underline = u; OpenTags(sb, bold, italic, underline, strike); }
                    if (s != strike) { CloseTags(sb, bold, italic, underline, strike); strike = s; OpenTags(sb, bold, italic, underline, strike); }

                    char ch = rtb.Text[i];
                    if (ch == '\n')
                        sb.Append("<br/>");
                    else
                        sb.Append(EscapeHtml(ch.ToString()));
                }

                CloseTags(sb, bold, italic, underline, strike);
                return sb.ToString();
            }
            catch
            {
                return EscapeHtml(plainFallback ?? "");
            }
        }

        private static void OpenTags(StringBuilder sb, bool bold, bool italic, bool underline, bool strike)
        {
            if (bold) sb.Append("<strong>");
            if (italic) sb.Append("<em>");
            if (underline) sb.Append("<u>");
            if (strike) sb.Append("<s>");
        }

        private static void CloseTags(StringBuilder sb, bool bold, bool italic, bool underline, bool strike)
        {
            if (strike) sb.Append("</s>");
            if (underline) sb.Append("</u>");
            if (italic) sb.Append("</em>");
            if (bold) sb.Append("</strong>");
        }

        private static string EscapeHtml(string text)
        {
            if (string.IsNullOrEmpty(text))
                return "";

            return text
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;");
        }

        private static RichTextBox CreateMeasureBox() =>
            new()
            {
                BorderStyle = BorderStyle.None,
                ScrollBars = RichTextBoxScrollBars.None,
                DetectUrls = false,
                BackColor = NoteRenderer.NoteEditorBack,
                Size = new Size(1, 1)
            };

        private static int ToTwips(float pixels, float dpi) =>
            (int)(pixels / dpi * 1440f);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, ref FORMATRANGE lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CHARFORMATRANGE
        {
            public int cpMin;
            public int cpMax;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct FORMATRANGE
        {
            public IntPtr hdc;
            public IntPtr hdcTarget;
            public RECT rc;
            public RECT rcPage;
            public CHARFORMATRANGE chrg;
        }
    }
}
