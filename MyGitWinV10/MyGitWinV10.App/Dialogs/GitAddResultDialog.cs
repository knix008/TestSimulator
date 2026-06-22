using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitAddResultDialog : Form
{
    public GitAddResultDialog(
        IReadOnlyList<GitStatusEntry> entries,
        IReadOnlyDictionary<string, GitStatusEntry> beforeSnapshot,
        string? scopeLabel = null)
    {
        InitializeComponent();
        Text = string.IsNullOrWhiteSpace(scopeLabel)
            ? "Git Add Complete"
            : $"Git Add Complete — {scopeLabel}";

        summaryLabel.Text = entries.Count == 1
            ? "1 path was staged."
            : $"{entries.Count} paths were staged.";

        addListView.Items.AddRange(entries.Select(entry => CreateListItem(entry, beforeSnapshot)).ToArray());
        if (addListView.Items.Count > 0)
        {
            addListView.Items[0].Selected = true;
        }
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
        if (GitWorkflowService.WasUntrackedBeforeStage(beforeSnapshot, entry))
        {
            return "U";
        }

        return entry.Staged switch
        {
            "Deleted" => "D",
            "Renamed" => "R",
            _ => "A"
        };
    }

    private void CloseButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.OK;
        Close();
    }
}
