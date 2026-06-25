using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitStatusDialog : Form
{
    private readonly string? _scopeLabel;
    private readonly int _entryCount;

    public GitStatusDialog(IReadOnlyList<GitStatusEntry> entries, string? scopeLabel = null)
    {
        _scopeLabel = scopeLabel;
        _entryCount = entries.Count;
        InitializeComponent();
        statusListView.Items.AddRange(entries.Select(CreateListItem).ToArray());
        if (statusListView.Items.Count > 0)
        {
            statusListView.Items[0].Selected = true;
        }

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged() => ApplyLocalizedText();

    private void ApplyLocalizedText()
    {
        Text = string.IsNullOrWhiteSpace(_scopeLabel)
            ? Localization.T("GitStatus.Title")
            : Localization.Tf("GitStatus.TitleScope", _scopeLabel);

        summaryLabel.Text = _entryCount == 0
            ? Localization.T("GitStatus.Clean")
            : Localization.Tf("GitStatus.ChangedCount", _entryCount);

        pathColumnHeader.Text = Localization.T("Column.GitStatus.Path");
        stagedColumnHeader.Text = Localization.T("Column.GitStatus.Staged");
        workTreeColumnHeader.Text = Localization.T("Column.GitStatus.WorkTree");
        closeButton.Text = Localization.T("Common.Close");
    }

    private void CloseButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.OK;
        Close();
    }

    private static ListViewItem CreateListItem(GitStatusEntry entry)
    {
        var item = new ListViewItem(entry.FilePath);
        item.SubItems.Add(entry.Staged);
        item.SubItems.Add(entry.WorkTree);
        return item;
    }
}
