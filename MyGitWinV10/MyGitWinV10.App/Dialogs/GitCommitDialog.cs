using LibGit2Sharp;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitCommitDialog : Form
{
    private readonly Repository _repo;
    private readonly AppSettingsStore _settings;
    private readonly List<string> _stagedPaths;

    public GitCommitDialog(Repository repo, IReadOnlyList<string> stagedPaths, AppSettingsStore settings)
    {
        _repo = repo;
        _settings = settings;
        _stagedPaths = stagedPaths.ToList();
        InitializeComponent();
        LoadCategories(preserveText: null);
        PopulateStagedPaths();
        ApplyLocalizedText();

        categoryComboBox.TextChanged += (_, _) => UpdatePreview();
        categoryComboBox.SelectedIndexChanged += (_, _) => UpdatePreview();
        subjectTextBox.TextChanged += (_, _) => UpdatePreview();
        bodyTextBox.TextChanged += (_, _) => UpdatePreview();

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged()
    {
        ApplyLocalizedText();
        UpdateStagedSummary();
    }

    private void ApplyLocalizedText()
    {
        Text = Localization.T("GitCommit.Title");
        categoryLabel.Text = Localization.T("GitCommit.Category");
        subjectLabel.Text = Localization.T("GitCommit.Subject");
        bodyLabel.Text = Localization.T("GitCommit.BodyOptional");
        previewLabel.Text = Localization.T("GitCommit.Preview");
        manageCategoriesButton.Text = Localization.T("GitCommit.ManageCategories");
        commitButton.Text = Localization.T("GitCommit.Commit");
        cancelButton.Text = Localization.T("Common.Cancel");
        removeFromCommitButton.Text = Localization.T("GitCommit.RemoveSelected");
        removePathContextMenuItem.Text = Localization.T("GitCommit.RemoveSelected");
        stagedPathColumnHeader.Text = Localization.T("GitCommit.StagedPath");
    }

    public string? CommitMessage { get; private set; }

    public IReadOnlyList<string> RemainingStagedPaths => _stagedPaths;

    private void PopulateStagedPaths()
    {
        stagedFilesListView.BeginUpdate();
        try
        {
            stagedFilesListView.Items.Clear();
            foreach (string path in _stagedPaths)
            {
                stagedFilesListView.Items.Add(new ListViewItem(path) { Tag = path });
            }
        }
        finally
        {
            stagedFilesListView.EndUpdate();
        }

        UpdateStagedSummary();
    }

    private void UpdateStagedSummary()
    {
        int count = _stagedPaths.Count;
        stagedFilesLabel.Text = count switch
        {
            0 => Localization.T("GitCommit.StagedNone"),
            1 => Localization.T("GitCommit.StagedOne"),
            _ => Localization.Tf("GitCommit.StagedMany", count)
        };
        commitButton.Enabled = count > 0;
        removeFromCommitButton.Enabled = count > 0 && stagedFilesListView.SelectedItems.Count > 0;
    }

    private void LoadCategories(string? preserveText)
    {
        categoryComboBox.BeginUpdate();
        try
        {
            categoryComboBox.Items.Clear();
            foreach (string category in _settings.GetCommitCategories())
            {
                categoryComboBox.Items.Add(category);
            }
        }
        finally
        {
            categoryComboBox.EndUpdate();
        }

        if (!string.IsNullOrWhiteSpace(preserveText))
        {
            categoryComboBox.Text = preserveText;
            return;
        }

        if (categoryComboBox.Items.Count > 0)
        {
            categoryComboBox.SelectedIndex = 0;
        }
    }

    private string GetCategoryText() => categoryComboBox.Text.Trim();

    private void UpdatePreview()
    {
        string category = GetCategoryText();
        string subject = subjectTextBox.Text;
        string body = bodyTextBox.Text;

        if (string.IsNullOrWhiteSpace(subject))
        {
            previewTextBox.Text = string.IsNullOrWhiteSpace(category)
                ? string.Empty
                : $"[{category}] ";
            return;
        }

        try
        {
            previewTextBox.Text = CommitMessageFormatter.Format(category, subject, body);
        }
        catch
        {
            previewTextBox.Text = subject;
        }
    }

    private void ManageCategoriesButton_Click(object? sender, EventArgs e)
    {
        string currentCategory = GetCategoryText();
        using var dialog = new CommitCategoriesDialog(_settings.GetCommitCategories());
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _settings.SetCommitCategories(dialog.Categories);
        _settings.Save();
        LoadCategories(currentCategory);
        UpdatePreview();
    }

    private void RemoveFromCommitButton_Click(object? sender, EventArgs e) => RemoveSelectedFromCommit();

    private void StagedFilesListView_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
        {
            return;
        }

        ListViewItem? hitItem = stagedFilesListView.HitTest(e.Location).Item;
        if (hitItem is not null)
        {
            hitItem.Selected = true;
        }
    }

    private void StagedFilesContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e) =>
        removePathContextMenuItem.Enabled = stagedFilesListView.SelectedItems.Count > 0;

    private void RemovePathContextMenuItem_Click(object? sender, EventArgs e) => RemoveSelectedFromCommit();

    private void RemoveSelectedFromCommit()
    {
        if (stagedFilesListView.SelectedItems.Count == 0)
        {
            return;
        }

        var pathsToRemove = stagedFilesListView.SelectedItems
            .Cast<ListViewItem>()
            .Select(item => (string)item.Tag!)
            .ToList();

        GitWorkflowService.UnstagePaths(_repo, pathsToRemove);
        _stagedPaths.RemoveAll(path => pathsToRemove.Contains(path, StringComparer.OrdinalIgnoreCase));
        PopulateStagedPaths();
    }

    private void StagedFilesListView_SelectedIndexChanged(object? sender, EventArgs e) =>
        removeFromCommitButton.Enabled = _stagedPaths.Count > 0 && stagedFilesListView.SelectedItems.Count > 0;

    private void CommitButton_Click(object? sender, EventArgs e)
    {
        if (_stagedPaths.Count == 0)
        {
            MessageBox.Show(this, Localization.T("Msg.GitCommit.NoneRemaining"), Localization.T("GitOp.Commit"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string category = GetCategoryText();
        string subject = subjectTextBox.Text.Trim();
        string body = bodyTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(category))
        {
            MessageBox.Show(this, Localization.T("Msg.GitCommit.EnterCategory"), Localization.T("GitOp.Commit"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryComboBox.Focus();
            return;
        }

        if (string.IsNullOrWhiteSpace(subject))
        {
            MessageBox.Show(this, Localization.T("Msg.GitCommit.EnterMessage"), Localization.T("GitOp.Commit"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            subjectTextBox.Focus();
            return;
        }

        _settings.RecordCommitCategory(category);
        _settings.Save();
        LoadCategories(category);

        CommitMessage = CommitMessageFormatter.Format(category, subject, body);
        DialogResult = DialogResult.OK;
        Close();
    }

    private void CancelButton_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}
