using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitStatusDialog : Form
{
    public GitStatusDialog(IReadOnlyList<GitStatusEntry> entries, string? scopeLabel = null)
    {
        InitializeComponent();
        Text = string.IsNullOrWhiteSpace(scopeLabel)
            ? "Git Status"
            : $"Git Status — {scopeLabel}";

        summaryLabel.Text = entries.Count == 0
            ? "Working tree clean."
            : $"{entries.Count} changed path(s)";

        statusListView.Items.AddRange(entries.Select(CreateListItem).ToArray());
        if (statusListView.Items.Count > 0)
        {
            statusListView.Items[0].Selected = true;
        }
    }

    private static ListViewItem CreateListItem(GitStatusEntry entry)
    {
        var item = new ListViewItem(entry.FilePath);
        item.SubItems.Add(string.IsNullOrEmpty(entry.Staged) ? "-" : entry.Staged);
        item.SubItems.Add(string.IsNullOrEmpty(entry.WorkTree) ? "-" : entry.WorkTree);
        return item;
    }

    private void CloseButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.OK;
        Close();
    }
}
