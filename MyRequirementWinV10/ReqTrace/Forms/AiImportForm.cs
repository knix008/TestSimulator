using System.ComponentModel;
using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Persistence;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class AiImportForm : Form
{
    private sealed class AiImportPreviewRow
    {
        public string Code { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
    }

    private readonly string _filePath;
    private readonly AppSettings _settings;
    private readonly BindingList<AiImportPreviewRow> _previewRows = new();
    private Dictionary<string, ComboBox> _fieldCombos = null!;
    private bool _conversionReady;

    public List<Requirement> ImportedRequirements { get; private set; } = new();
    public List<string> Warnings { get; private set; } = new();
    public int RowsProcessed { get; private set; }
    public int RowsSkipped { get; private set; }
    public bool GeneratedTestCases { get; private set; }
    public bool WasCancelled { get; private set; }
    public Func<IEnumerable<string>>? GetReservedRequirementCodes { get; set; }
    public Func<IEnumerable<string>>? GetReservedTestCaseCodes { get; set; }

    public AiImportForm(string filePath, AppSettings settings)
    {
        _filePath = filePath;
        _settings = settings;
        InitializeComponent();
        InitializeFieldCombos();
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnConvert);
        ApplyLocalization();
        SetupResultGrid();

        AcceptButton = btnConvert;

        foreach (var sheet in ExcelRequirementImporter.GetSheetNames(filePath))
            cboSheet.Items.Add(sheet);

        if (cboSheet.Items.Count > 0)
            cboSheet.SelectedIndex = 0;

        lblOllamaInfo.Text = Loc.T("AiImport_OllamaInfo", _settings.OllamaBaseUrl, GetModelDisplay());
        ResetConvertButton();
    }

    private string GetModelDisplay() =>
        string.IsNullOrWhiteSpace(_settings.OllamaModel)
            ? Loc.T("AiImport_ModelNotConfigured")
            : _settings.OllamaModel;

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

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_AiImportExcel", Path.GetFileName(_filePath));
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
        lblResults.Text = Loc.T("AiImport_ResultPreview");
        lblHint.Text = Loc.T("AiImport_Hint");
        chkGenerateIds.Text = Loc.T("Import_GenerateIds");
        chkGenerateTestCases.Text = Loc.T("Import_GenerateTestCases");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void SetupResultGrid()
    {
        resultGrid.AutoGenerateColumns = false;
        resultGrid.Columns.Clear();
        resultGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Code", DataPropertyName = "Code", HeaderText = Loc.T("Col_Code"), FillWeight = 70 });
        resultGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Category", DataPropertyName = "Category", HeaderText = Loc.T("Col_Category"), FillWeight = 100 });
        resultGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", DataPropertyName = "Title", HeaderText = Loc.T("Col_Title"), FillWeight = 120 });
        resultGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Description", DataPropertyName = "Description", HeaderText = Loc.T("Col_Description"), FillWeight = 200 });
        resultGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        resultGrid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        resultGrid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        resultGrid.RowTemplate.Height = 28;
        resultGrid.ReadOnly = true;
        resultGrid.AllowUserToAddRows = false;
        resultGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        resultGrid.DataSource = _previewRows;
    }

    private void cboSheet_SelectedIndexChanged(object? sender, EventArgs e)
    {
        ClearConversionResults();
        ReloadPreviewAndMapping();
    }

    private void numHeaderRow_ValueChanged(object? sender, EventArgs e)
    {
        ClearConversionResults();
        ReloadPreviewAndMapping();
    }

    private void MappingCombo_SelectedIndexChanged(object? sender, EventArgs e) =>
        ClearConversionResults();

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

    private ColumnMapping BuildMapping() =>
        ColumnMappingEditor.BuildMapping(_fieldCombos, chkGenerateIds.Checked, chkGenerateTestCases.Checked);

    private void ClearConversionResults()
    {
        ImportedRequirements = [];
        Warnings = [];
        RowsProcessed = 0;
        RowsSkipped = 0;
        WasCancelled = false;
        _previewRows.Clear();
        ResetConvertButton();
    }

    private void ResetConvertButton()
    {
        _conversionReady = false;
        btnConvert.Text = Loc.T("AiImport_Convert");
        btnConvert.Enabled = true;
        ModernTheme.MakePrimary(btnConvert);
    }

    private void SetConversionReady()
    {
        _conversionReady = true;
        btnConvert.Text = Loc.T("Common_OK");
        btnConvert.Enabled = ImportedRequirements.Count > 0;
        ModernTheme.MakePrimary(btnConvert);
    }

    private TimeSpan _lastConversionElapsed;

    private void btnConvert_Click(object? sender, EventArgs e)
    {
        if (_conversionReady)
        {
            ConfirmAndClose();
            return;
        }

        if (cboSheet.SelectedItem is not string sheetName)
            return;

        if (string.IsNullOrWhiteSpace(_settings.OllamaModel))
        {
            MessageBox.Show(this,
                Loc.T("Msg_AiImportModelNotConfigured"),
                Loc.T("Msg_AiImportFailed"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var mapping = BuildMapping();
        var headerRow = (int)numHeaderRow.Value;

        btnConvert.Enabled = false;
        btnCancel.Enabled = false;
        ClearConversionResults();

        try
        {
            var reservedCodes = GetReservedRequirementCodes?.Invoke();
            var reservedTestCaseCodes = GetReservedTestCaseCodes?.Invoke();

            var dialogResult = ProgressDialogRunner.Run(
                this,
                Loc.T("Dlg_ProgressAiImportTitle"),
                Loc.T("Dlg_ProgressAiImportMessage", Path.GetFileName(_filePath)),
                (progress, cancellationToken) => OllamaRequirementImporter.ImportAsync(
                    _filePath,
                    sheetName,
                    _settings.OllamaBaseUrl,
                    string.IsNullOrWhiteSpace(_settings.OllamaModel) ? null : _settings.OllamaModel,
                    chkGenerateIds.Checked,
                    chkGenerateTestCases.Checked,
                    headerRow,
                    mapping,
                    progress,
                    onRequirementAdded: null,
                    reservedCodes,
                    reservedTestCaseCodes,
                    cancellationToken));

            _lastConversionElapsed = dialogResult.Elapsed;
            var importResult = dialogResult.Value;

            ImportedRequirements = importResult.Requirements.ToList();
            Warnings = importResult.Warnings.ToList();
            RowsProcessed = importResult.RowsProcessed;
            RowsSkipped = importResult.RowsSkipped;
            WasCancelled = importResult.WasCancelled;
            GeneratedTestCases = chkGenerateTestCases.Checked;

            if (ImportedRequirements.Count > 0)
                RebuildPreviewRows();

            if (ImportedRequirements.Count == 0)
            {
                MessageBox.Show(this,
                    BuildConversionSummary(),
                    Loc.T("Msg_AiImportFailed"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            SetConversionReady();

            var title = WasCancelled
                ? Loc.T("Msg_AiImportCancelledPartialTitle")
                : Loc.T("Msg_AiImportConvertDoneTitle");
            var icon = WasCancelled ? MessageBoxIcon.Warning : MessageBoxIcon.Information;

            MessageBox.Show(this,
                BuildConversionSummary(),
                title,
                MessageBoxButtons.OK,
                icon);
        }
        catch (Exception ex) when (IsCancellation(ex))
        {
            MessageBox.Show(this,
                Loc.T("Msg_AiImportCancelled"),
                Loc.T("Dlg_ProgressAiImportTitle"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            HandleConversionError(ex);
        }
        finally
        {
            if (!_conversionReady)
                btnConvert.Enabled = true;

            btnCancel.Enabled = true;
        }
    }

    private void ConfirmAndClose()
    {
        if (ImportedRequirements.Count == 0)
        {
            MessageBox.Show(this, Loc.T("Msg_AiImportConvertFirst"), Loc.T("Msg_AiImportFailed"),
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
    }

    private string BuildConversionSummary()
    {
        var elapsedText = ElapsedTimeFormatter.FormatDuration(_lastConversionElapsed);
        var summaryKey = WasCancelled
            ? "Msg_AiImportConvertSummaryPartial"
            : "Msg_AiImportConvertSummary";
        var summary = Loc.T(summaryKey,
            ImportedRequirements.Count,
            RowsProcessed,
            RowsSkipped,
            elapsedText);
        if (Warnings.Count == 0)
            return summary;

        return summary + Environment.NewLine + Environment.NewLine
            + Loc.T("Msg_ImportWarnings", Warnings.Count, string.Join("\n", Warnings.Take(10)));
    }

    private void RebuildPreviewRows()
    {
        _previewRows.Clear();
        foreach (var requirement in ImportedRequirements)
        {
            _previewRows.Add(new AiImportPreviewRow
            {
                Code = requirement.Code,
                Title = requirement.Title,
                Category = requirement.Category,
                Description = requirement.Description
            });
        }
    }

    private static bool IsCancellation(Exception ex)
    {
        if (ex is OperationCanceledException)
            return true;

        return ex is AggregateException aggregate
               && aggregate.InnerException is OperationCanceledException;
    }

    private void HandleConversionError(Exception ex)
    {
        var root = ex is AggregateException aggregate ? aggregate.GetBaseException() : ex;
        if (root is IOException or UnauthorizedAccessException)
        {
            ErrorDialog.Show(this, Loc.T("Msg_ImportFailed"),
                new IOException(Loc.T("Msg_ImportReadFailed", Path.GetFileName(_filePath)), root));
        }
        else if (root.Message.Contains("Ollama", StringComparison.OrdinalIgnoreCase)
                 || root is HttpRequestException)
        {
            ErrorDialog.Show(this, Loc.T("Msg_AiImportFailed"),
                new InvalidOperationException(Loc.T("Msg_AiImportOllamaUnavailable", _settings.OllamaBaseUrl), root));
        }
        else
        {
            ErrorDialog.Show(this, Loc.T("Msg_AiImportFailed"), root);
        }
    }
}
