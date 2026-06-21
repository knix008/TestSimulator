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
    }

    public IReadOnlyList<string> Categories =>
        categoriesListBox.Items.Cast<string>().ToList();

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
            MessageBox.Show(this, "Enter a category name.", "Add Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryEditTextBox.Focus();
            return;
        }

        if (ContainsCategory(category))
        {
            MessageBox.Show(this, "That category already exists.", "Add Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            MessageBox.Show(this, "Select a category to update.", "Update Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string category = categoryEditTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(category))
        {
            MessageBox.Show(this, "Enter a category name.", "Update Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
            categoryEditTextBox.Focus();
            return;
        }

        int selectedIndex = categoriesListBox.SelectedIndex;
        string current = categoriesListBox.Items[selectedIndex]?.ToString() ?? string.Empty;
        if (!string.Equals(current, category, StringComparison.OrdinalIgnoreCase)
            && ContainsCategory(category))
        {
            MessageBox.Show(this, "That category already exists.", "Update Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        categoriesListBox.Items[selectedIndex] = category;
        SelectCategory(category);
    }

    private void RemoveCategoryButton_Click(object? sender, EventArgs e)
    {
        if (categoriesListBox.SelectedIndex < 0)
        {
            MessageBox.Show(this, "Select a category to remove.", "Remove Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (categoriesListBox.Items.Count <= 1)
        {
            MessageBox.Show(this, "At least one category is required.", "Remove Category", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            MessageBox.Show(this, "Add at least one category.", "Commit Categories", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
