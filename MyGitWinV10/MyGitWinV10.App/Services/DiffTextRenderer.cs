namespace MyGitWinV10.App.Services;

public static class DiffTextRenderer
{
    private const int ColoredRenderMaxChars = 120_000;

    public static void Render(RichTextBox box, string patchText)
    {
        box.Clear();
        if (string.IsNullOrEmpty(patchText))
        {
            return;
        }

        if (patchText.Length > ColoredRenderMaxChars)
        {
            box.ForeColor = Color.FromArgb(40, 40, 45);
            box.BackColor = Color.White;
            box.Text = patchText;
            return;
        }

        foreach (var rawLine in patchText.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            var (foreColor, backColor) = line switch
            {
                _ when line.StartsWith("+++") || line.StartsWith("---") => (Color.FromArgb(120, 120, 130), Color.White),
                _ when line.StartsWith("@@") => (Color.FromArgb(124, 58, 237), Color.FromArgb(245, 243, 255)),
                _ when line.StartsWith('+') => (Color.FromArgb(6, 95, 70), Color.FromArgb(230, 250, 240)),
                _ when line.StartsWith('-') => (Color.FromArgb(153, 27, 27), Color.FromArgb(254, 232, 232)),
                _ => (Color.FromArgb(40, 40, 45), Color.White)
            };
            AppendLine(box, line, foreColor, backColor);
        }
    }

    private static void AppendLine(RichTextBox box, string text, Color foreColor, Color backColor)
    {
        int start = box.TextLength;
        box.AppendText(text + Environment.NewLine);
        box.Select(start, text.Length);
        box.SelectionColor = foreColor;
        box.SelectionBackColor = backColor;
        box.SelectionLength = 0;
    }
}
