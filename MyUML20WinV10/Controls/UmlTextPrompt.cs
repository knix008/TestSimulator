namespace MyUML20WinV10.Controls;

internal static class UmlTextPrompt
{
    public static string? Show(IWin32Window owner, string title, string label, string defaultValue, bool multiline = false)
    {
        var height = multiline ? 220 : 140;
        using var form = new Form
        {
            Text = title,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(380, height),
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = false,
        };

        var lbl = new Label
        {
            Text = label,
            Location = new Point(12, 12),
            AutoSize = true,
        };
        var textBox = new TextBox
        {
            Location = new Point(12, 32),
            Size = new Size(356, multiline ? 120 : 24),
            Multiline = multiline,
            Text = defaultValue,
            ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None,
        };
        var ok = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Location = new Point(212, height - 44),
            Size = new Size(75, 28),
        };
        var cancel = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Location = new Point(293, height - 44),
            Size = new Size(75, 28),
        };

        form.Controls.AddRange([lbl, textBox, ok, cancel]);
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        return form.ShowDialog(owner) == DialogResult.OK ? textBox.Text : null;
    }
}
