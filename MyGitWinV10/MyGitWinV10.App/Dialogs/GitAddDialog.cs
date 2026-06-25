using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitAddDialog : Form
{
    private readonly List<GitStatusEntry> _entries;
    private readonly string? _scopeLabel;

    public GitAddDialog(IReadOnlyList<GitStatusEntry> candidates, string? scopeLabel = null)
    {
        _scopeLabel = scopeLabel;
        InitializeComponent();
        ApplyLocalizedText();

        _entries = candidates.ToList();
        PopulateList();

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    public IReadOnlyList<string> SelectedPaths =>
        _entries.Select(entry => entry.FilePath).ToList();

    private void OnLanguageChanged()
    {
        ApplyLocalizedText();
        UpdateSummary();
    }

    private void ApplyLocalizedText()
    {
        Text = string.IsNullOrWhiteSpace(_scopeLabel)
            ? Localization.T("GitAdd.Title")
            : Localization.Tf("GitAdd.TitleScope", _scopeLabel);
        removePathContextMenuItem.Text = Localization.T("GitAdd.RemoveSelected");
        removeButton.Text = Localization.T("GitAdd.RemoveSelected");
        pathColumnHeader.Text = Localization.T("Column.GitStatus.Path");
        statusColumnHeader.Text = Localization.T("Column.Status");
        stageButton.Text = Localization.T("GitAdd.Stage");
        cancelButton.Text = Localization.T("Common.Cancel");
    }

    private void PopulateList()
    {
        pathListView.BeginUpdate();
        try
        {
            pathListView.Items.Clear();
            pathListView.Items.AddRange(_entries.Select(CreateListItem).ToArray());
            UpdateSummary();
        }
        finally
        {
            pathListView.EndUpdate();
        }

        if (pathListView.Items.Count > 0)
        {
            pathListView.Items[0].Selected = true;
        }
    }

    private static ListViewItem CreateListItem(GitStatusEntry entry)
    {
        var item = new ListViewItem(entry.FilePath) { Tag = entry.FilePath };
        item.SubItems.Add(FormatCandidateStatus(entry));
        return item;
    }

    internal static string FormatCandidateStatus(GitStatusEntry entry) =>
        entry.WorkTree switch
        {
            "Untracked" => "U",
            "Modified" => "M",
            "Deleted" => "D",
            "Renamed" => "R",
            "Type Changed" => "T",
            _ => entry.WorkTree.Length > 0 ? entry.WorkTree[..1] : "?"
        };

    private void UpdateSummary()
    {
        int count = _entries.Count;
        summaryLabel.Text = count switch
        {
            0 => Localization.T("GitAdd.SummaryNone"),
            1 => Localization.T("GitAdd.SummaryOne"),
            _ => Localization.Tf("GitAdd.SummaryMany", count)
        };
        stageButton.Enabled = count > 0;
        removeButton.Enabled = count > 0 && pathListView.SelectedItems.Count > 0;
    }

    private void RemoveSelectedPaths()
    {
        if (pathListView.SelectedItems.Count == 0)
        {
            return;
        }

        var pathsToRemove = pathListView.SelectedItems
            .Cast<ListViewItem>()
            .Select(item => (string)item.Tag!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        _entries.RemoveAll(entry => pathsToRemove.Contains(entry.FilePath));
        PopulateList();
    }

    private void PathListView_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
        {
            return;
        }

        ListViewItem? hitItem = pathListView.HitTest(e.Location).Item;
        if (hitItem is not null)
        {
            hitItem.Selected = true;
        }
    }

    private void PathListContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e) =>
        removePathContextMenuItem.Enabled = pathListView.SelectedItems.Count > 0;

    private void RemovePathContextMenuItem_Click(object? sender, EventArgs e) => RemoveSelectedPaths();

    private void PathListView_SelectedIndexChanged(object? sender, EventArgs e) =>
        removeButton.Enabled = _entries.Count > 0 && pathListView.SelectedItems.Count > 0;

    private void RemoveButton_Click(object? sender, EventArgs e) => RemoveSelectedPaths();

    private void StageButton_Click(object? sender, EventArgs e)
    {
        if (_entries.Count == 0)
        {
            MessageBox.Show(this, Localization.T("Msg.GitAdd.SelectPath"), Localization.T("GitAdd.Title"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
    }

    private void CancelButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}
