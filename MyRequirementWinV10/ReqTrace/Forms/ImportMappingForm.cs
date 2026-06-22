using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class ImportMappingForm : Form
{
    private readonly string _filePath;
    private Dictionary<string, ComboBox> _fieldCombos = null!;

    public List<Requirement> ImportedRequirements { get; private set; } = new();
    public List<string> Warnings { get; private set; } = new();
    public int RowsProcessed { get; private set; }
    public int RowsSkipped { get; private set; }
    public bool GeneratedTestCases { get; private set; }
    public Func<IEnumerable<string>>? GetReservedRequirementCodes { get; set; }
    public Func<IEnumerable<string>>? GetReservedTestCaseCodes { get; set; }

    public ImportMappingForm(string filePath)
    {
        _filePath = filePath;
        InitializeComponent();
        InitializeFieldCombos();

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnImport);
        ApplyLocalization();

        foreach (var sheet in ExcelRequirementImporter.GetSheetNames(filePath))
            cboSheet.Items.Add(sheet);

        if (cboSheet.Items.Count > 0)
            cboSheet.SelectedIndex = 0;
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_ImportExcel", Path.GetFileName(_filePath));
        lblSheet.Text = Loc.T("Import_Sheet");
        lblHeaderRow.Text = Loc.T("Import_HeaderRow");
        lblPreview.Text = Loc.T("Import_Preview");
        lblColumnMapping.Text = Loc.T("Import_ColumnMapping");
        lblCode.Text = Loc.T("Import_Code");
        lblTitle.Text = Loc.T("Import_Title");
        lblDescription.Text = Loc.T("Import_Description");
        lblCategory.Text = Loc.T("Import_Category");
        lblPriority.Text = Loc.T("Import_Priority");
        lblStatus.Text = Loc.T("Import_Status");
        lblSource.Text = Loc.T("Import_Source");
        lblParentCode.Text = Loc.T("Import_ParentCode");
        chkGenerateIds.Text = Loc.T("Import_GenerateIds");
        chkGenerateTestCases.Text = Loc.T("Import_GenerateTestCases");
        btnImport.Text = Loc.T("Common_Import");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void InitializeFieldCombos()
    {
        _fieldCombos = new Dictionary<string, ComboBox>
        {
            ["Code"] = cboCode,
            ["Title"] = cboTitle,
            ["Description"] = cboDescription,
            ["Category"] = cboCategory,
            ["Priority"] = cboPriority,
            ["Status"] = cboStatus,
            ["Source"] = cboSource,
            ["ParentCode"] = cboParentCode
        };
    }

    private void cboSheet_SelectedIndexChanged(object? sender, EventArgs e) => ReloadPreviewAndMapping();

    private void numHeaderRow_ValueChanged(object? sender, EventArgs e) => ReloadPreviewAndMapping();

    private void ReloadPreviewAndMapping()
    {
        if (cboSheet.SelectedItem is not string sheetName)
            return;

        ColumnMappingEditor.Reload(
            _filePath,
            sheetName,
            (int)numHeaderRow.Value,
            _fieldCombos,
            previewGrid);
    }

    private void btnImport_Click(object? sender, EventArgs e)
    {
        DialogResult = DialogResult.None;

        if (cboSheet.SelectedItem is not string sheetName)
            return;

        try
        {
            var headerRow = (int)numHeaderRow.Value;
            ExcelRequirementImporter.ReadHeaderRow(_filePath, sheetName, headerRow);

            var mapping = ColumnMappingEditor.BuildMapping(
                _fieldCombos,
                chkGenerateIds.Checked,
                chkGenerateTestCases.Checked);

            if (mapping.TitleColumn is null)
            {
                MessageBox.Show(this, Loc.T("Msg_TitleColumnRequired"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var importResult = ProgressDialogRunner.Run(
                this,
                Loc.T("Dlg_ProgressImportTitle"),
                Loc.T("Dlg_ProgressImportMessage", Path.GetFileName(_filePath)),
                progress => ExcelRequirementImporter.Import(
                    _filePath,
                    sheetName,
                    headerRow,
                    mapping,
                    progress,
                    GetReservedRequirementCodes?.Invoke(),
                    GetReservedTestCaseCodes?.Invoke()));

            ImportedRequirements = importResult.Requirements.ToList();
            Warnings = importResult.Warnings.ToList();
            RowsProcessed = importResult.RowsProcessed;
            RowsSkipped = importResult.RowsSkipped;
            GeneratedTestCases = mapping.GenerateTestCases;

            DialogResult = DialogResult.OK;
        }
        catch (Exception ex)
        {
            var root = ex is AggregateException aggregate ? aggregate.GetBaseException() : ex;
            if (root is IOException or UnauthorizedAccessException)
            {
                ErrorDialog.Show(this, Loc.T("Msg_ImportFailed"),
                    new IOException(Loc.T("Msg_ImportReadFailed", Path.GetFileName(_filePath)), root));
            }
            else
            {
                ErrorDialog.Show(this, Loc.T("Msg_ImportFailed"), root);
            }
        }
    }
}
