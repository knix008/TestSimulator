namespace MyGitWinV10.App.Dialogs;

using MyGitWinV10.App.Services;

public sealed class NamePromptDialog : Form
{
    private readonly TextBox _textBox;

    public NamePromptDialog(string title, string prompt, string defaultName = "")
    {
        Text = title;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(250, 250, 251);
        Font = new Font("Segoe UI", 9F);
        ClientSize = new Size(420, 132);

        var promptLabel = new Label
        {
            AutoSize = true,
            Location = new Point(20, 20),
            Text = prompt
        };

        _textBox = new TextBox
        {
            Location = new Point(20, 44),
            Size = new Size(380, 23),
            Text = defaultName
        };

        var okButton = new Button
        {
            DialogResult = DialogResult.OK,
            FlatStyle = FlatStyle.Flat,
            Location = new Point(244, 84),
            Size = new Size(75, 28),
            Text = Localization.T("Common.OK"),
            TextAlign = ContentAlignment.MiddleCenter
        };

        var cancelButton = new Button
        {
            DialogResult = DialogResult.Cancel,
            FlatStyle = FlatStyle.Flat,
            Location = new Point(325, 84),
            Size = new Size(75, 28),
            Text = Localization.T("Common.Cancel"),
            TextAlign = ContentAlignment.MiddleCenter
        };

        AcceptButton = okButton;
        CancelButton = cancelButton;
        Controls.Add(promptLabel);
        Controls.Add(_textBox);
        Controls.Add(okButton);
        Controls.Add(cancelButton);
    }

    public string EnteredName => _textBox.Text.Trim();

    public static string? Show(IWin32Window owner, string title, string prompt, string defaultName = "")
    {
        using var dialog = new NamePromptDialog(title, prompt, defaultName);
        return dialog.ShowDialog(owner) == DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.EnteredName)
            ? dialog.EnteredName
            : null;
    }
}
