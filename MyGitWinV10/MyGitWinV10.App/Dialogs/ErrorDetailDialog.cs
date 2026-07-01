using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class ErrorDetailDialog : Form
{
    private readonly string _details;

    public ErrorDetailDialog(string title, string summary, string details)
    {
        InitializeComponent();
        Text = title;
        summaryLabel.Text = summary;
        _details = details;
        DialogIcons.ApplyError(iconPictureBox);
        ApplyLocalizedText();
        LayoutContent();

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
        Resize += (_, _) => LayoutContent();
    }

    public static void Show(IWin32Window? owner, string title, Exception exception)
    {
        using var dialog = new ErrorDetailDialog(
            title,
            ExceptionDetailFormatter.GetSummary(exception),
            ExceptionDetailFormatter.Format(exception));
        dialog.ShowDialog(owner);
    }

    public static void Show(IWin32Window? owner, string title, string summary, string? details = null)
    {
        using var dialog = new ErrorDetailDialog(title, summary, details ?? summary);
        dialog.ShowDialog(owner);
    }

    private void OnLanguageChanged()
    {
        if (copyButton.Text != Localization.T("OpComplete.Copied"))
        {
            ApplyLocalizedText();
            LayoutContent();
        }
    }

    private void ApplyLocalizedText()
    {
        hintLabel.Text = Localization.T("Error.CopyDetailsHint");
        copyButton.Text = Localization.T("OpComplete.CopyDetails");
        okButton.Text = Localization.T("Common.OK");
    }

    private void LayoutContent()
    {
        int contentWidth = Math.Max(200, headerPanel.ClientSize.Width - 40);
        summaryLabel.MaximumSize = new Size(contentWidth, 0);
        hintLabel.MaximumSize = new Size(contentWidth, 0);
        hintLabel.Top = summaryLabel.Bottom + 8;
    }

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_details);
        copyButton.Text = Localization.T("OpComplete.Copied");
    }
}
