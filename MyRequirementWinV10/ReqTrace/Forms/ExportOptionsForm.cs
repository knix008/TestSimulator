using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Persistence;
using ReqTrace.Reporting;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class ExportOptionsForm : Form
{
    private readonly ProjectData _project;
    private readonly AppSettings _settings;

    public ExportOptionsForm(ProjectData project, AppSettings settings)
    {
        _project = project;
        _settings = settings;
        InitializeComponent();
        txtFolder.Text = string.IsNullOrWhiteSpace(settings.LastExportFolder)
            ? Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
            : settings.LastExportFolder;
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnExport);
        ApplyLocalization();
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_ExportReport");
        lblFormats.Text = Loc.T("Export_Formats");
        chkExcel.Text = Loc.T("Export_Excel");
        chkWord.Text = Loc.T("Export_Word");
        chkMarkdown.Text = Loc.T("Export_Markdown");
        chkPdf.Text = Loc.T("Export_Pdf");
        lblScope.Text = Loc.T("Export_Scope");
        radioAll.Text = Loc.T("Export_AllRequirements");
        radioWithTests.Text = Loc.T("Export_OnlyWithTests");
        chkIncludeHistory.Text = Loc.T("Export_IncludeHistory");
        lblOutputFolder.Text = Loc.T("Export_OutputFolder");
        btnBrowse.Text = Loc.T("Common_Browse");
        btnExport.Text = Loc.T("Common_Export");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void btnBrowse_Click(object? sender, EventArgs e)
    {
        using var fbd = new FolderBrowserDialog { SelectedPath = txtFolder.Text };
        if (fbd.ShowDialog(this) == DialogResult.OK)
            txtFolder.Text = fbd.SelectedPath;
    }

    private void btnExport_Click(object? sender, EventArgs e)
    {
        if (!chkExcel.Checked && !chkWord.Checked && !chkMarkdown.Checked && !chkPdf.Checked)
        {
            MessageBox.Show(this, Loc.T("Msg_ExportSelectFormat"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
            return;
        }

        if (!Directory.Exists(txtFolder.Text))
        {
            MessageBox.Show(this, Loc.T("Msg_ExportFolderMissing"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
            return;
        }

        var scope = radioWithTests.Checked ? ExportScope.OnlyWithTestCases : ExportScope.All;
        var reportData = ReportDataBuilder.Build(_project, scope, chkIncludeHistory.Checked);

        var exporters = new List<IReportExporter>();
        if (chkExcel.Checked) exporters.Add(new ExcelReportExporter());
        if (chkWord.Checked) exporters.Add(new WordReportExporter());
        if (chkMarkdown.Checked) exporters.Add(new MarkdownReportExporter());
        if (chkPdf.Checked) exporters.Add(new PdfReportExporter());

        var baseName = $"{_project.ProjectName}_Traceability_{DateTime.Now:yyyyMMdd_HHmm}";
        var writtenFiles = new List<string>();
        foreach (var exporter in exporters)
        {
            var path = Path.Combine(txtFolder.Text, baseName + exporter.DefaultFileExtension);
            try
            {
                exporter.Export(reportData, path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                ErrorDialog.Show(this, Loc.T("Msg_ExportFailed"),
                    new IOException(Loc.T("Msg_ExportWriteFailed", path), ex));
                DialogResult = DialogResult.None;
                return;
            }
            writtenFiles.Add(path);
        }

        _settings.LastExportFolder = txtFolder.Text;

        var result = MessageBox.Show(this, Loc.T("Msg_ExportComplete", writtenFiles.Count, txtFolder.Text),
            Loc.T("Msg_ExportCompleteTitle"), MessageBoxButtons.YesNo, MessageBoxIcon.Information);
        if (result == DialogResult.Yes)
            System.Diagnostics.Process.Start("explorer.exe", txtFolder.Text);
    }
}
