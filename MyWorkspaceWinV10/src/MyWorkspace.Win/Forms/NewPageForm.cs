using MyWorkspace.Core.Models;
using MyWorkspace.Core.Templates;

namespace MyWorkspace.Win.Forms;

public partial class NewPageForm : Form
{
    private PageTemplate? _selectedTemplate;
    private string? _initialTitleOverride;
    private bool _suppressTitleChange;

    public string PageTitle => txtTitle.Text.Trim();

    public PageTemplate SelectedTemplate =>
        _selectedTemplate ?? PageTemplateProvider.All.First();

    public string PageContent => PageTemplateProvider.BuildContent(SelectedTemplate, PageTitle);

    public NewPageForm(string? defaultTitle = null)
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        Shown += (_, _) => LayoutTemplateToolbarButtons();
        Resize += (_, _) => LayoutTemplateToolbarButtons();
        AppTheme.Changed += OnAppThemeChanged;
        FormClosed += (_, _) => AppTheme.Changed -= OnAppThemeChanged;
        _initialTitleOverride = defaultTitle;
    }

    private void NewPageForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        ReloadTemplateList();
        LayoutTemplateToolbarButtons();
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
        LayoutTemplateToolbarButtons();
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
        ApplyTitleForSelectedTemplate(preferInitialOverride: true);
        UpdatePreview();
    }

    private void lstTemplates_SelectedIndexChanged(object sender, EventArgs e)
    {
        ApplyTitleForSelectedTemplate(preferInitialOverride: false);
        UpdatePreview();
    }

    private void ApplyTitleForSelectedTemplate(bool preferInitialOverride)
    {
        if (preferInitialOverride && !string.IsNullOrWhiteSpace(_initialTitleOverride))
        {
            SetTitleText(_initialTitleOverride);
            _initialTitleOverride = null;
            return;
        }

        if (lstTemplates.SelectedItem is PageTemplate template)
            SetTitleText(template.DefaultTitle);
    }

    private void SetTitleText(string title)
    {
        _suppressTitleChange = true;
        txtTitle.Text = title;
        _suppressTitleChange = false;
    }

    private void txtTitle_TextChanged(object sender, EventArgs e)
    {
        if (!_suppressTitleChange)
            UpdatePreview();
    }

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
            ? _selectedTemplate.DefaultTitle
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

    private void OnAppThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(LayoutTemplateToolbarButtons);
            return;
        }

        LayoutTemplateToolbarButtons();
    }

    private void LayoutTemplateToolbarButtons()
    {
        if (!IsHandleCreated)
            return;

        AppTheme.FitButtonSize(btnReloadTemplates);
        AppTheme.FitButtonSize(btnOpenTemplateFolder);

        const int rightPadding = 12;
        const int gap = 8;
        var right = ClientSize.Width - rightPadding;

        btnOpenTemplateFolder.Location = new Point(
            Math.Max(12, right - btnOpenTemplateFolder.Width),
            btnOpenTemplateFolder.Top);
        btnReloadTemplates.Location = new Point(
            Math.Max(12, btnOpenTemplateFolder.Left - gap - btnReloadTemplates.Width),
            btnReloadTemplates.Top);
    }
}
