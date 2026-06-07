namespace MyUML20WinV10.Controls;

internal static class UmlErrorDialog
{
    public static void Show(IWin32Window owner, string title, Exception ex)
    {
        var detail = $"{ex.GetType().FullName}: {ex.Message}";
        if (ex.InnerException is not null)
            detail += $"\n\n원인: {ex.InnerException.GetType().FullName}: {ex.InnerException.Message}";
        if (ex.StackTrace is not null)
            detail += $"\n\n스택 추적:\n{ex.StackTrace}";

        using var form = new Form
        {
            Text = title,
            FormBorderStyle = FormBorderStyle.Sizable,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(560, 360),
            MinimumSize = new Size(440, 280),
            MinimizeBox = false,
            ShowInTaskbar = false,
        };

        var iconLabel = new Label
        {
            Text = "⚠",
            Font = new Font("Segoe UI", 22f),
            ForeColor = Color.FromArgb(200, 60, 40),
            Location = new Point(12, 12),
            Size = new Size(40, 40),
            TextAlign = ContentAlignment.MiddleCenter,
        };

        var msgLabel = new Label
        {
            Text = ex.Message,
            Font = new Font("Segoe UI", 9f),
            Location = new Point(58, 14),
            Size = new Size(490, 40),
            AutoEllipsis = true,
        };

        var detailBox = new TextBox
        {
            Text = detail,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Font = new Font("Consolas", 8f),
            BackColor = Color.FromArgb(248, 248, 252),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            Location = new Point(12, 62),
            Size = new Size(536, 248),
        };

        var copyBtn = new Button
        {
            Text = "복사",
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
            Location = new Point(368, 318),
            Size = new Size(80, 28),
        };
        copyBtn.Click += (_, _) =>
        {
            Clipboard.SetText(detail);
            copyBtn.Text = "복사됨 ✓";
        };

        var closeBtn = new Button
        {
            Text = "닫기",
            DialogResult = DialogResult.OK,
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
            Location = new Point(456, 318),
            Size = new Size(80, 28),
        };

        form.Controls.AddRange([iconLabel, msgLabel, detailBox, copyBtn, closeBtn]);
        form.AcceptButton = closeBtn;
        form.CancelButton = closeBtn;
        form.ShowDialog(owner);
    }
}
