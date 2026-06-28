using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitAddResultDialog : Form
{
    private readonly int _entryCount;
    private readonly string? _scopeLabel;

    public GitAddResultDialog(
        IReadOnlyList<GitStatusEntry> entries,
        IReadOnlyDictionary<string, GitStatusEntry> beforeSnapshot,
        string? scopeLabel = null)
    {
        _scopeLabel = scopeLabel;
        _entryCount = entries.Count;
        InitializeComponent();
        ApplyLocalizedText();

        DialogIcons.ApplySuccess(iconPictureBox);

        addListView.Items.AddRange(entries.Select(entry => CreateListItem(entry, beforeSnapshot)).ToArray());
        if (addListView.Items.Count > 0)
        {
            addListView.Items[0].Selected = true;
        }

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged() => ApplyLocalizedText();

    private void ApplyLocalizedText()
    {
        Text = string.IsNullOrWhiteSpace(_scopeLabel)
            ? Localization.T("GitAdd.CompleteTitle")
            : Localization.Tf("GitAdd.CompleteTitleScope", _scopeLabel);
        summaryLabel.Text = _entryCount == 1
            ? Localization.T("GitAdd.CompleteOne")
            : Localization.Tf("GitAdd.CompleteMany", _entryCount);
        pathColumnHeader.Text = Localization.T("Column.GitStatus.Path");
        statusColumnHeader.Text = Localization.T("Column.Status");
        closeButton.Text = Localization.T("Common.Close");
    }

    private static ListViewItem CreateListItem(
        GitStatusEntry entry,
        IReadOnlyDictionary<string, GitStatusEntry> beforeSnapshot)
    {
        var item = new ListViewItem(entry.FilePath);
        item.SubItems.Add(FormatAddResultStatus(entry, beforeSnapshot));
        return item;
    }

    internal static string FormatAddResultStatus(
        GitStatusEntry entry,
        IReadOnlyDictionary<string, GitStatusEntry> beforeSnapshot)
    {
        // This dialog reports the post-stage result, not the live Files-panel status — a file
        // that was untracked a moment ago is now staged as "Added", so it shows "A" here even
        // though the tree's own badge (PathGitStatus.Badge) still uses "U" for untracked.
        if (GitWorkflowService.WasUntrackedBeforeStage(beforeSnapshot, entry))
        {
            return "A";
        }

        return entry.Staged switch
        {
            "Deleted" => "D",
            "Renamed" => "R",
            _ => PathGitStatus.ChangedBadge
        };
    }

    private void CloseButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.OK;
        Close();
    }
}
