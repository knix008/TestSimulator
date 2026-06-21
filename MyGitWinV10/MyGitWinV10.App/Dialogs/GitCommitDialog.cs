using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class GitCommitDialog : Form
{
    private readonly AppSettingsStore _settings;

    public GitCommitDialog(IReadOnlyList<string> stagedPaths, AppSettingsStore settings)
    {
        _settings = settings;
        InitializeComponent();
        LoadCategories(preserveText: null);

        foreach (string path in stagedPaths)
        {
            stagedFilesListBox.Items.Add(path);
        }

        UpdatePreview();
        categoryComboBox.TextChanged += (_, _) => UpdatePreview();
        categoryComboBox.SelectedIndexChanged += (_, _) => UpdatePreview();
        subjectTextBox.TextChanged += (_, _) => UpdatePreview();
        bodyTextBox.TextChanged += (_, _) => UpdatePreview();
    }

    public string? CommitMessage { get; private set; }

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

    private void CommitButton_Click(object? sender, EventArgs e)
    {
        string category = GetCategoryText();
        string subject = subjectTextBox.Text.Trim();
        string body = bodyTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(category))
        {
            MessageBox.Show(this, "Enter or select a commit category.", "Git Commit", MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryComboBox.Focus();
            return;
        }

        if (string.IsNullOrWhiteSpace(subject))
        {
            MessageBox.Show(this, "Enter a commit message.", "Git Commit", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
