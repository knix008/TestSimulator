using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class CommitCategoriesDialog : Form
{
    public CommitCategoriesDialog(IReadOnlyList<string> categories)
    {
        InitializeComponent();
        foreach (string category in categories)
        {
            categoriesListBox.Items.Add(category);
        }

        if (categoriesListBox.Items.Count > 0)
        {
            categoriesListBox.SelectedIndex = 0;
        }

        ApplyLocalizedText();
        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    public IReadOnlyList<string> Categories =>
        categoriesListBox.Items.Cast<string>().ToList();

    private void OnLanguageChanged() => ApplyLocalizedText();

    private void ApplyLocalizedText()
    {
        Text = Localization.T("Categories.Title");
        categoriesLabel.Text = Localization.T("Categories.ListLabel");
        categoryEditLabel.Text = Localization.T("Categories.EditLabel");
        addCategoryButton.Text = Localization.T("Categories.Add");
        updateCategoryButton.Text = Localization.T("Categories.Update");
        removeCategoryButton.Text = Localization.T("Categories.Remove");
        resetDefaultsButton.Text = Localization.T("Categories.Defaults");
        okButton.Text = Localization.T("Common.OK");
        cancelButton.Text = Localization.T("Common.Cancel");
    }

    private void CategoriesListBox_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (categoriesListBox.SelectedItem is string category)
        {
            categoryEditTextBox.Text = category;
        }
    }

    private void AddCategoryButton_Click(object? sender, EventArgs e)
    {
        string category = categoryEditTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(category))
        {
            MessageBox.Show(this, Localization.T("Categories.EnterName"), Localization.T("Categories.AddTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryEditTextBox.Focus();
            return;
        }

        if (ContainsCategory(category))
        {
            MessageBox.Show(this, Localization.T("Categories.AlreadyExists"), Localization.T("Categories.AddTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            SelectCategory(category);
            return;
        }

        categoriesListBox.Items.Add(category);
        SelectCategory(category);
    }

    private void UpdateCategoryButton_Click(object? sender, EventArgs e)
    {
        if (categoriesListBox.SelectedIndex < 0)
        {
            MessageBox.Show(this, Localization.T("Categories.SelectToUpdate"), Localization.T("Categories.UpdateTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string category = categoryEditTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(category))
        {
            MessageBox.Show(this, Localization.T("Categories.EnterName"), Localization.T("Categories.UpdateTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryEditTextBox.Focus();
            return;
        }

        int selectedIndex = categoriesListBox.SelectedIndex;
        string current = categoriesListBox.Items[selectedIndex]?.ToString() ?? string.Empty;
        if (!string.Equals(current, category, StringComparison.OrdinalIgnoreCase)
            && ContainsCategory(category))
        {
            MessageBox.Show(this, Localization.T("Categories.AlreadyExists"), Localization.T("Categories.UpdateTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        categoriesListBox.Items[selectedIndex] = category;
        SelectCategory(category);
    }

    private void RemoveCategoryButton_Click(object? sender, EventArgs e)
    {
        if (categoriesListBox.SelectedIndex < 0)
        {
            MessageBox.Show(this, Localization.T("Categories.SelectToRemove"), Localization.T("Categories.RemoveTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (categoriesListBox.Items.Count <= 1)
        {
            MessageBox.Show(this, Localization.T("Categories.OneRequired"), Localization.T("Categories.RemoveTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        int selectedIndex = categoriesListBox.SelectedIndex;
        categoriesListBox.Items.RemoveAt(selectedIndex);
        categoriesListBox.SelectedIndex = Math.Min(selectedIndex, categoriesListBox.Items.Count - 1);
    }

    private void ResetDefaultsButton_Click(object? sender, EventArgs e)
    {
        categoriesListBox.Items.Clear();
        foreach (string category in CommitMessageFormatter.DefaultCategories)
        {
            categoriesListBox.Items.Add(category);
        }

        categoriesListBox.SelectedIndex = 0;
    }

    private void OkButton_Click(object? sender, EventArgs e)
    {
        if (categoriesListBox.Items.Count == 0)
        {
            MessageBox.Show(this, Localization.T("Categories.NeedOne"), Localization.T("Categories.Title"), MessageBoxButtons.OK, MessageBoxIcon.Information);
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

    private bool ContainsCategory(string category) =>
        categoriesListBox.Items.Cast<string>().Any(existing =>
            string.Equals(existing, category, StringComparison.OrdinalIgnoreCase));

    private void SelectCategory(string category)
    {
        for (int i = 0; i < categoriesListBox.Items.Count; i++)
        {
            if (string.Equals(categoriesListBox.Items[i]?.ToString(), category, StringComparison.OrdinalIgnoreCase))
            {
                categoriesListBox.SelectedIndex = i;
                categoryEditTextBox.Text = category;
                return;
            }
        }
    }
}
