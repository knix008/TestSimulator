using ReqTrace.Localization;
using ReqTrace.Persistence;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class OptionsForm : Form
{
    private readonly AppSettings? _settings;

    /// <summary>Designer-only constructor.</summary>
    public OptionsForm()
    {
        InitializeComponent();
    }

    public OptionsForm(AppSettings settings) : this()
    {
        _settings = settings;
        FormBorderStyle = FormBorderStyle.FixedDialog;

        radioKorean.Checked = !LocalizationService.IsEnglish;
        radioEnglish.Checked = LocalizationService.IsEnglish;
        txtImportFolder.Text = settings.LastImportFolder;
        txtExportFolder.Text = settings.LastExportFolder;
        txtProjectFolder.Text = settings.LastProjectFolder;

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();
        AdjustLayout();
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_Options");
        lblLanguage.Text = Loc.T("Options_Language");
        radioKorean.Text = Loc.T("Menu_LanguageKorean");
        radioEnglish.Text = Loc.T("Menu_LanguageEnglish");
        lblImportFolder.Text = Loc.T("Options_ImportFolder");
        lblExportFolder.Text = Loc.T("Options_ExportFolder");
        lblProjectFolder.Text = Loc.T("Options_ProjectFolder");
        btnBrowseImport.Text = Loc.T("Common_Browse");
        btnBrowseExport.Text = Loc.T("Common_Browse");
        btnBrowseProject.Text = Loc.T("Common_Browse");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void AdjustLayout()
    {
        if (layoutTable.ColumnCount < 3)
            return;

        SuspendLayout();
        layoutTable.SuspendLayout();

        try
        {
            var labels = new[] { lblLanguage, lblImportFolder, lblExportFolder, lblProjectFolder };
            var browseButtons = new[] { btnBrowseImport, btnBrowseExport, btnBrowseProject };
            var folderTextBoxes = new[] { txtImportFolder, txtExportFolder, txtProjectFolder };

            var labelColumnWidth = labels.Max(l => TextRenderer.MeasureText(l.Text, Font).Width) + 20;
            layoutTable.ColumnStyles[0].Width = Math.Max(165, labelColumnWidth);

            var browseWidth = browseButtons.Max(b => TextRenderer.MeasureText(b.Text, b.Font).Width + 24);
            layoutTable.ColumnStyles[2].Width = Math.Max(105, browseWidth);

            var textBoxHeight = folderTextBoxes[0].PreferredSize.Height;
            if (textBoxHeight <= 0)
                textBoxHeight = TextRenderer.MeasureText("Ay", Font).Height + 6;

            const int verticalPad = 2;
            var fieldHeight = textBoxHeight + verticalPad * 2;

            for (var i = 0; i < 4; i++)
                layoutTable.RowStyles[i].Height = fieldHeight;

            var buttonRowHeight = Math.Max(btnOk.Height, btnCancel.Height) + buttonPanel.Padding.Top + 12;
            layoutTable.RowStyles[4].Height = buttonRowHeight;

            foreach (var label in labels)
            {
                label.Dock = DockStyle.Fill;
                label.TextAlign = ContentAlignment.MiddleRight;
                label.Margin = new Padding(0, 0, 10, 0);
            }

            foreach (var textBox in folderTextBoxes)
            {
                textBox.Dock = DockStyle.Fill;
                textBox.Margin = new Padding(0, verticalPad, 8, verticalPad);
                textBox.MinimumSize = Size.Empty;
            }

            foreach (var button in browseButtons)
            {
                button.AutoSize = false;
                button.Dock = DockStyle.Fill;
                button.Margin = new Padding(0, verticalPad, 0, verticalPad);
                button.MinimumSize = Size.Empty;
            }

            languagePanel.Dock = DockStyle.Fill;
            languagePanel.WrapContents = false;
            languagePanel.FlowDirection = FlowDirection.LeftToRight;
            languagePanel.Padding = new Padding(0, Math.Max(0, (int)(fieldHeight - radioKorean.Height) / 2), 0, 0);

            MaximumSize = new Size(0, 0);

            var minWidth = (int)layoutTable.ColumnStyles[0].Width
                + (int)layoutTable.ColumnStyles[2].Width
                + 360
                + layoutTable.Padding.Horizontal;
            var minHeight = (int)(fieldHeight * 4 + buttonRowHeight + layoutTable.Padding.Vertical + 4);
            MinimumSize = new Size(minWidth, minHeight);

            if (ClientSize.Width < minWidth || ClientSize.Height < minHeight)
            {
                ClientSize = new Size(
                    Math.Max(ClientSize.Width, minWidth),
                    Math.Max(ClientSize.Height, minHeight));
            }
        }
        finally
        {
            layoutTable.ResumeLayout(true);
            ResumeLayout(true);
        }
    }

    private void btnBrowseImport_Click(object? sender, EventArgs e) =>
        BrowseFolder(txtImportFolder);

    private void btnBrowseExport_Click(object? sender, EventArgs e) =>
        BrowseFolder(txtExportFolder);

    private void btnBrowseProject_Click(object? sender, EventArgs e) =>
        BrowseFolder(txtProjectFolder);

    private void BrowseFolder(TextBox target)
    {
        using var dialog = new FolderBrowserDialog();
        if (!string.IsNullOrWhiteSpace(target.Text) && Directory.Exists(target.Text))
            dialog.SelectedPath = target.Text;

        if (dialog.ShowDialog(this) == DialogResult.OK)
            target.Text = dialog.SelectedPath;
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (_settings is null)
            return;

        var language = radioEnglish.Checked
            ? LocalizationService.EnglishLanguage
            : LocalizationService.DefaultLanguage;
        LocalizationService.SetLanguage(language, _settings);

        _settings.LastImportFolder = txtImportFolder.Text.Trim();
        _settings.LastExportFolder = txtExportFolder.Text.Trim();
        _settings.LastProjectFolder = txtProjectFolder.Text.Trim();
        AppSettingsService.Save(_settings);
    }
}
