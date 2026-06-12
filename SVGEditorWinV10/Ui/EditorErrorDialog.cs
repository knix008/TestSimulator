using System.Text;

namespace SVGEditorWinV10.Ui;

public static class EditorErrorDialog
{
    public static void Show(IWin32Window? owner, string title, Exception exception, string? summary = null)
    {
        Show(owner, title, summary ?? exception.Message, FormatException(exception));
    }

    public static void Show(IWin32Window? owner, string title, string summary, string detail)
    {
        using var form = CreateForm(title, summary, detail);
        if (owner is null)
            form.StartPosition = FormStartPosition.CenterScreen;

        form.ShowDialog(owner);
    }

    public static string FormatException(Exception exception)
    {
        var builder = new StringBuilder();
        var current = exception;
        var depth = 0;

        while (current is not null)
        {
            if (depth > 0)
                builder.AppendLine().AppendLine($"-- 내부 예외 #{depth} --").AppendLine();

            builder.AppendLine($"[{current.GetType().FullName}]");
            builder.AppendLine(current.Message);

            if (!string.IsNullOrWhiteSpace(current.StackTrace))
            {
                builder.AppendLine();
                builder.AppendLine(current.StackTrace);
            }

            current = current.InnerException;
            depth++;
        }

        return builder.ToString().TrimEnd();
    }

    private static Form CreateForm(string title, string summary, string detail)
    {
        var body = string.IsNullOrWhiteSpace(summary) || string.Equals(summary.Trim(), detail.Trim(), StringComparison.Ordinal)
            ? detail
            : $"{summary.TrimEnd()}{Environment.NewLine}{Environment.NewLine}{detail}";

        var form = new Form
        {
            Text = title,
            ClientSize = new Size(640, 420),
            MinimumSize = new Size(480, 300),
            FormBorderStyle = FormBorderStyle.Sizable,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = true,
            MinimizeBox = false,
            ShowInTaskbar = false,
            Font = ModernTheme.UiFont,
            BackColor = ModernTheme.PanelBackground
        };

        var iconBox = new PictureBox
        {
            Location = new Point(12, 12),
            Size = new Size(32, 32),
            SizeMode = PictureBoxSizeMode.CenterImage,
            Image = SystemIcons.Error.ToBitmap()
        };

        var summaryLabel = new Label
        {
            Location = new Point(52, 12),
            Size = new Size(576, 44),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            Text = summary,
            AutoEllipsis = true,
            ForeColor = ModernTheme.TextPrimary,
            BackColor = ModernTheme.PanelBackground
        };

        var detailBox = new TextBox
        {
            Location = new Point(12, 64),
            Size = new Size(616, 308),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            HideSelection = false,
            ShortcutsEnabled = true,
            TabStop = true,
            Font = ModernTheme.ResolveMonoFont(),
            ForeColor = ModernTheme.TextPrimary,
            BackColor = ModernTheme.PanelBackground,
            BorderStyle = BorderStyle.FixedSingle,
            Text = body
        };

        var copyButton = new Button
        {
            Text = "오류 내용 복사",
            Size = new Size(120, 30),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right
        };
        ModernTheme.StyleSecondaryButton(copyButton);

        var closeButton = new Button
        {
            Text = "닫기",
            DialogResult = DialogResult.OK,
            Size = new Size(80, 30),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right
        };
        ModernTheme.StyleSecondaryButton(closeButton);

        void LayoutControls()
        {
            var clientWidth = form.ClientSize.Width;
            var clientHeight = form.ClientSize.Height;
            var bottom = clientHeight - 12;

            closeButton.Location = new Point(clientWidth - 12 - closeButton.Width, bottom - closeButton.Height);
            copyButton.Location = new Point(closeButton.Left - 8 - copyButton.Width, bottom - copyButton.Height);
            summaryLabel.Width = clientWidth - 64;
            detailBox.Width = clientWidth - 24;
            detailBox.Height = copyButton.Top - detailBox.Top - 8;
        }

        form.Resize += (_, _) => LayoutControls();
        LayoutControls();

        copyButton.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(detailBox.Text);
                copyButton.Text = "복사됨";
            }
            catch
            {
                copyButton.Text = "복사 실패";
                detailBox.Focus();
                detailBox.SelectAll();
            }
        };

        form.Controls.AddRange([iconBox, summaryLabel, detailBox, copyButton, closeButton]);
        form.AcceptButton = closeButton;
        form.CancelButton = closeButton;
        form.Shown += (_, _) =>
        {
            detailBox.Focus();
            detailBox.Select(0, 0);
        };

        return form;
    }
}
