using MyWorkspace.Core.Models;
using MyWorkspace.Core.Templates;

namespace MyWorkspace.Win.Forms;

public partial class NewPageForm : Form
{
    private PageTemplate? _selectedTemplate;

    public string PageTitle => txtTitle.Text.Trim();

    public PageTemplate SelectedTemplate =>
        _selectedTemplate ?? PageTemplateProvider.All.First();

    public string PageContent => PageTemplateProvider.BuildContent(SelectedTemplate, PageTitle);

    public NewPageForm(string? defaultTitle = null)
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        if (!string.IsNullOrWhiteSpace(defaultTitle))
            txtTitle.Text = defaultTitle;
    }

    private void NewPageForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        ReloadTemplateList();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.NewPageTitle);
        lblTitle.Text = Localization.Get(K.LabelTitle);
        lblTemplate.Text = Localization.Get(K.LabelTemplate);
        btnReloadTemplates.Text = Localization.Get(K.ButtonReload);
        btnOpenTemplateFolder.Text = Localization.Get(K.ButtonOpenTemplateFolder);
        lblTemplateDesc.Text = Localization.Get(K.LabelTemplateDesc);
        lblPreview.Text = Localization.Get(K.LabelPreview);
        btnOk.Text = Localization.Get(K.ButtonCreate);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void ReloadTemplateList()
    {
        PageTemplateProvider.Reload();

        var selectedId = (_selectedTemplate ?? lstTemplates.SelectedItem as PageTemplate)?.Id;
        lstTemplates.DisplayMember = nameof(PageTemplate.Name);
        lstTemplates.Items.Clear();

        foreach (var template in PageTemplateProvider.All)
            lstTemplates.Items.Add(template);

        lblTemplateFolder.Text = $"{Localization.Get(K.LabelTemplateFolderPrefix)} {AppConfig.UserTemplateDirectory}";

        if (PageTemplateProvider.All.Count == 0)
        {
            MessageBox.Show(
                Localization.Get(K.NoTemplates),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var index = 0;
        if (!string.IsNullOrEmpty(selectedId))
        {
            for (var i = 0; i < lstTemplates.Items.Count; i++)
            {
                if (lstTemplates.Items[i] is PageTemplate t &&
                    string.Equals(t.Id, selectedId, StringComparison.OrdinalIgnoreCase))
                {
                    index = i;
                    break;
                }
            }
        }

        lstTemplates.SelectedIndex = index;
        UpdatePreview();
    }

    private void lstTemplates_SelectedIndexChanged(object sender, EventArgs e) => UpdatePreview();

    private void txtTitle_TextChanged(object sender, EventArgs e) => UpdatePreview();

    private void UpdatePreview()
    {
        if (lstTemplates.SelectedItem is PageTemplate template)
        {
            _selectedTemplate = template;
            var source = Localization.Get(template.IsUserDefined ? K.TemplateSourceUser : K.TemplateSourceBuiltIn);
            lblTemplateDesc.Text = $"[{source}] {template.Description}";
        }

        if (_selectedTemplate == null)
            return;

        var title = string.IsNullOrWhiteSpace(txtTitle.Text)
            ? Localization.Get(K.DefaultNewPageTitle)
            : txtTitle.Text.Trim();
        txtPreview.Text = PageTemplateProvider.BuildContent(_selectedTemplate, title);
    }

    private void btnReloadTemplates_Click(object sender, EventArgs e) => ReloadTemplateList();

    private void btnOpenTemplateFolder_Click(object sender, EventArgs e)
    {
        Directory.CreateDirectory(AppConfig.UserTemplateDirectory);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = AppConfig.UserTemplateDirectory,
            UseShellExecute = true
        });
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (PageTemplateProvider.All.Count == 0)
        {
            MessageBox.Show(Localization.Get(K.NoTemplatesShort), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(txtTitle.Text))
        {
            MessageBox.Show(Localization.Get(K.EnterPageTitle), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            txtTitle.Focus();
            return;
        }

        if (lstTemplates.SelectedItem is PageTemplate template)
            _selectedTemplate = template;

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}
