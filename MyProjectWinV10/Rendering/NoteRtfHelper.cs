using MyProject.Models;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace MyProject.Rendering
{
    public static class NoteRtfHelper
    {
        private const int WM_USER = 0x0400;
        private const int EM_SETCHARFORMAT = WM_USER + 55;
        private const int SCF_ALL = 4;
        private const uint CFM_BACKCOLOR = 0x04000000;
        private const uint CFE_AUTOBACKCOLOR = 0x04000000;

        private static readonly Regex RtfBackgroundTagPattern = new(
            @"\\(?:highlight|chcbpat|cb|chshdng|chcfpat|chbghdr|chbgfdiag|chbgdkdiag|chbgcross|chbgdcross|chbghorizontal|chbgvertical)\d*\s?",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

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

            ApplyTransparentNoteTextBackground(rtb);

            try
            {
                return StripRtfBackgroundTags(rtb.Rtf ?? "");
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
            var state = graphics.Save();
            graphics.SetClip(bounds);
            try
            {
                if (HasFormattedContent(note))
                {
                    if (!TryDrawFormattedNoteText(graphics, note.BodyRtf, bounds, isSelected))
                        DrawPlainText(graphics, note, bounds, isSelected);
                    return;
                }

                DrawPlainText(graphics, note, bounds, isSelected);
            }
            finally
            {
                graphics.Restore(state);
            }
        }

        private static bool TryDrawFormattedNoteText(Graphics g, string? rtf, RectangleF bounds, bool isSelected)
        {
            if (string.IsNullOrWhiteSpace(rtf))
                return false;

            using var rtb = CreateMeasureBox();
            rtb.Font = NoteRenderer.NoteEditorFont;
            try
            {
                rtb.Rtf = StripRtfBackgroundTags(rtf);
            }
            catch
            {
                return false;
            }

            if (rtb.TextLength == 0)
                return false;

            ApplyTransparentNoteTextBackground(rtb);

            var runs = BuildTextRuns(rtb);
            if (runs.Count == 0)
                return false;

            try
            {
                DrawTextRuns(g, runs, bounds, isSelected);
                return true;
            }
            finally
            {
                foreach (var run in runs)
                    run.Font.Dispose();
            }
        }

        private sealed class TextRun(string text, Font font, Color color)
        {
            public string Text { get; } = text;
            public Font Font { get; } = font;
            public Color Color { get; } = color;
        }

        private static List<TextRun> BuildTextRuns(RichTextBox rtb)
        {
            var runs = new List<TextRun>();
            if (rtb.TextLength == 0)
                return runs;

            int runStart = 0;
            rtb.Select(0, 1);
            Font runFont = CloneSelectionFont(rtb);
            Color runColor = rtb.SelectionColor;

            for (int i = 1; i <= rtb.TextLength; i++)
            {
                bool atEnd = i == rtb.TextLength;
                Font font = runFont;
                Color color = runColor;

                if (!atEnd)
                {
                    rtb.Select(i, 1);
                    font = CloneSelectionFont(rtb);
                    color = rtb.SelectionColor;
                }

                if (atEnd || !FontsEquivalent(runFont, font) || runColor.ToArgb() != color.ToArgb())
                {
                    string chunk = rtb.Text.Substring(runStart, i - runStart);
                    if (chunk.Length > 0)
                        runs.Add(new TextRun(chunk, runFont, runColor));
                    else
                        runFont.Dispose();

                    runStart = i;
                    if (!atEnd)
                    {
                        runFont = font;
                        runColor = color;
                    }
                }
            }

            return runs;
        }

        private static Font CloneSelectionFont(RichTextBox rtb)
        {
            var source = rtb.SelectionFont ?? rtb.Font;
            return new Font(source.FontFamily, source.SizeInPoints, source.Style, GraphicsUnit.Point);
        }

        private static bool FontsEquivalent(Font a, Font b) =>
            a.FontFamily.Name == b.FontFamily.Name
            && Math.Abs(a.SizeInPoints - b.SizeInPoints) < 0.1f
            && a.Style == b.Style;

        private static void DrawTextRuns(Graphics g, IReadOnlyList<TextRun> runs, RectangleF bounds, bool isSelected)
        {
            float x = bounds.Left;
            float y = bounds.Top;
            float maxY = bounds.Bottom;

            foreach (var run in runs)
            {
                Color textColor = isSelected ? Color.FromArgb(32, 33, 36) : run.Color;
                if (textColor.IsEmpty || textColor == Color.Transparent)
                    textColor = Color.FromArgb(32, 32, 32);

                using var brush = new SolidBrush(textColor);
                float lineHeight = run.Font.GetHeight(g);

                for (int i = 0; i < run.Text.Length; i++)
                {
                    char ch = run.Text[i];
                    if (ch == '\r')
                        continue;

                    if (ch == '\n')
                    {
                        x = bounds.Left;
                        y += lineHeight;
                        if (y + lineHeight > maxY)
                            return;
                        continue;
                    }

                    string token = char.IsWhiteSpace(ch)
                        ? ch.ToString()
                        : ReadWordToken(run.Text, ref i);
                    if (token.Length == 0)
                        continue;

                    var size = g.MeasureString(token, run.Font, int.MaxValue, StringFormat.GenericTypographic);
                    if (x > bounds.Left && x + size.Width > bounds.Right)
                    {
                        x = bounds.Left;
                        y += lineHeight;
                        if (y + lineHeight > maxY)
                            return;
                    }

                    g.DrawString(token, run.Font, brush, x, y, StringFormat.GenericTypographic);
                    x += size.Width;
                }
            }
        }

        private static string ReadWordToken(string text, ref int index)
        {
            int start = index;
            while (index < text.Length
                   && !char.IsWhiteSpace(text[index])
                   && text[index] != '\r'
                   && text[index] != '\n')
            {
                index++;
            }

            return text.Substring(start, index - start);
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

        private static string StripRtfBackgroundTags(string? rtf)
        {
            if (string.IsNullOrWhiteSpace(rtf))
                return rtf ?? "";

            return RtfBackgroundTagPattern.Replace(rtf, "");
        }

        /// <summary>
        /// Gantt note text should show the UML gradient through the characters, not opaque boxes.
        /// </summary>
        private static void ApplyTransparentNoteTextBackground(RichTextBox rtb)
        {
            if (rtb.TextLength <= 0)
                return;

            if (!rtb.IsHandleCreated)
                rtb.CreateControl();

            var cf = new CHARFORMAT2
            {
                cbSize = Marshal.SizeOf<CHARFORMAT2>(),
                dwMask = CFM_BACKCOLOR,
                dwEffects = CFE_AUTOBACKCOLOR
            };
            SendCharFormat(rtb.Handle, cf);
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
                BackColor = NoteRenderer.GradientTop,
                Size = new Size(1, 1)
            };

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, ref CHARFORMAT2 lParam);

        private static void SendCharFormat(IntPtr handle, CHARFORMAT2 cf) =>
            SendMessage(handle, EM_SETCHARFORMAT, SCF_ALL, ref cf);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct CHARFORMAT2
        {
            public int cbSize;
            public uint dwMask;
            public uint dwEffects;
            public int yHeight;
            public int yOffset;
            public int crTextColor;
            public byte bCharSet;
            public byte bPitchAndFamily;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szFaceName;
            public ushort wWeight;
            public ushort sSpacing;
            public int crBackColor;
            public uint lcid;
            public uint dwReserved;
            public short sStyle;
            public ushort wKerning;
            public byte bUnderlineType;
            public byte bAnimation;
            public byte bRevAuthor;
            public byte bReserved1;
        }
    }
}
