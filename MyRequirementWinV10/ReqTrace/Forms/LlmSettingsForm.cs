using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Persistence;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class LlmSettingsForm : Form
{
    private readonly AppSettings? _settings;
    private bool _loadingModels;
    private List<string> _installedModels = [];

    private bool IsUiAvailable => !IsDisposed && IsHandleCreated;

    private IWin32Window? MessageOwner => IsUiAvailable ? this : null;

    public LlmSettingsForm()
    {
        InitializeComponent();
    }

    public LlmSettingsForm(AppSettings settings) : this()
    {
        _settings = settings;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        txtOllamaUrl.Text = settings.OllamaBaseUrl;
        chkUseForExcelImport.Checked = settings.UseLlmForExcelImport;

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();
        AdjustLayout();

        Shown += async (_, _) => await LoadModelsAsync(settings.OllamaModel);
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_LlmSettings");
        lblDescription.Text = Loc.T("Llm_Description");
        lblOllamaUrl.Text = Loc.T("Llm_OllamaUrl");
        lblOllamaModel.Text = Loc.T("Llm_OllamaModel");
        btnRefreshModels.Text = Loc.T("Llm_RefreshModels");
        chkUseForExcelImport.Text = Loc.T("Llm_UseForExcelImport");
        btnTestConnection.Text = Loc.T("Llm_TestConnection");
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
            var labels = new[] { lblOllamaUrl, lblOllamaModel };
            var labelColumnWidth = labels.Max(l => TextRenderer.MeasureText(l.Text, Font).Width) + 24;
            layoutTable.ColumnStyles[0].Width = Math.Max(120, labelColumnWidth);

            var refreshWidth = TextRenderer.MeasureText(btnRefreshModels.Text, btnRefreshModels.Font).Width + 28;
            layoutTable.ColumnStyles[2].Width = Math.Max(100, refreshWidth);

            var contentWidth = Math.Max(360, ClientSize.Width - (int)layoutTable.ColumnStyles[0].Width
                - (int)layoutTable.ColumnStyles[2].Width - layoutTable.Padding.Horizontal - 8);
            var descriptionHeight = TextRenderer.MeasureText(
                lblDescription.Text,
                lblDescription.Font,
                new Size(contentWidth, int.MaxValue),
                TextFormatFlags.WordBreak).Height + 8;
            layoutTable.RowStyles[0].Height = Math.Max(40, descriptionHeight);

            var controlHeight = Math.Max(
                txtOllamaUrl.PreferredSize.Height,
                cboOllamaModel.PreferredSize.Height);
            if (controlHeight <= 0)
                controlHeight = TextRenderer.MeasureText("Ay", Font).Height + 6;

            const int verticalPad = 4;
            var fieldHeight = controlHeight + verticalPad * 2;
            layoutTable.RowStyles[1].Height = fieldHeight;
            layoutTable.RowStyles[2].Height = fieldHeight;

            var checkHeight = chkUseForExcelImport.PreferredSize.Height;
            var checkRowHeight = checkHeight + verticalPad * 2;
            layoutTable.RowStyles[3].Height = checkRowHeight;
            var checkVerticalMargin = Math.Max(0, (int)Math.Floor((checkRowHeight - checkHeight) / 2.0));

            var actionButtonHeight = Math.Max(
                Math.Max(btnRefreshModels.PreferredSize.Height, btnTestConnection.PreferredSize.Height),
                28) + verticalPad * 2;
            layoutTable.RowStyles[4].Height = actionButtonHeight;

            var buttonRowHeight = Math.Max(btnOk.Height, btnCancel.Height) + buttonPanel.Padding.Top + 12;
            layoutTable.RowStyles[5].Height = buttonRowHeight;

            foreach (var label in labels)
            {
                label.Dock = DockStyle.Fill;
                label.TextAlign = ContentAlignment.MiddleRight;
                label.Margin = new Padding(0, 0, 10, 0);
            }

            lblDescription.Dock = DockStyle.Fill;
            lblDescription.Margin = new Padding(0, 0, 0, 4);
            lblDescription.TextAlign = ContentAlignment.TopLeft;

            txtOllamaUrl.Dock = DockStyle.Fill;
            txtOllamaUrl.Margin = new Padding(0, verticalPad, 0, verticalPad);

            cboOllamaModel.Dock = DockStyle.Fill;
            cboOllamaModel.Margin = new Padding(0, verticalPad, 8, verticalPad);

            btnRefreshModels.AutoSize = false;
            btnRefreshModels.Dock = DockStyle.Fill;
            btnRefreshModels.Margin = new Padding(0, verticalPad, 0, verticalPad);
            btnRefreshModels.MinimumSize = Size.Empty;

            chkUseForExcelImport.AutoSize = true;
            chkUseForExcelImport.Dock = DockStyle.None;
            chkUseForExcelImport.Anchor = AnchorStyles.Left | AnchorStyles.Top;
            chkUseForExcelImport.Margin = new Padding(0, checkVerticalMargin, 0, checkVerticalMargin);

            btnTestConnection.AutoSize = true;
            btnTestConnection.Dock = DockStyle.Left;
            btnTestConnection.Margin = new Padding(0, verticalPad, 0, 0);

            buttonPanel.Dock = DockStyle.Fill;
            buttonPanel.WrapContents = false;

            var minWidth = (int)layoutTable.ColumnStyles[0].Width
                + (int)layoutTable.ColumnStyles[2].Width
                + 280
                + layoutTable.Padding.Horizontal;
            var minHeight = (int)(layoutTable.RowStyles[0].Height
                + fieldHeight * 2
                + layoutTable.RowStyles[3].Height
                + actionButtonHeight
                + buttonRowHeight
                + layoutTable.Padding.Vertical + 4);
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

    private async void btnRefreshModels_Click(object? sender, EventArgs e) =>
        await LoadModelsAsync(GetSelectedModelName());

    private async void btnTestConnection_Click(object? sender, EventArgs e)
    {
        btnTestConnection.Enabled = false;
        btnRefreshModels.Enabled = false;
        try
        {
            var baseUrl = GetOllamaBaseUrl();
            using var client = new OllamaClient(baseUrl);
            if (!await client.IsAvailableAsync().ConfigureAwait(true))
            {
                if (!IsUiAvailable)
                    return;

                MessageBox.Show(MessageOwner,
                    Loc.T("Msg_LlmConnectionFailed", baseUrl),
                    Loc.T("Dlg_LlmSettings"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            await LoadModelsAsync(GetSelectedModelName()).ConfigureAwait(true);
            if (!IsUiAvailable)
                return;

            var modelList = _installedModels.Count == 0
                ? Loc.T("Llm_NoModelsInstalled")
                : string.Join(", ", _installedModels.Take(8)) + (_installedModels.Count > 8 ? "..." : string.Empty);

            MessageBox.Show(MessageOwner,
                Loc.T("Msg_LlmConnectionOk", baseUrl, modelList),
                Loc.T("Dlg_LlmSettings"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (ObjectDisposedException)
        {
            // The dialog was closed (and disposed by the caller's `using`) while this
            // await was still pending - there is no UI left to report to, so the race
            // is expected and safe to ignore rather than crash the app.
        }
        catch (Exception ex)
        {
            if (IsUiAvailable)
                ErrorDialog.Show(MessageOwner, Loc.T("Dlg_LlmSettings"), ex);
        }
        finally
        {
            if (IsUiAvailable)
            {
                btnTestConnection.Enabled = true;
                btnRefreshModels.Enabled = true;
            }
        }
    }

    private async Task LoadModelsAsync(string? preferredModel)
    {
        if (_loadingModels)
            return;

        _loadingModels = true;
        if (IsUiAvailable)
        {
            btnRefreshModels.Enabled = false;
            cboOllamaModel.Enabled = false;
        }

        var previousCursor = IsUiAvailable ? Cursor : Cursors.Default;
        if (IsUiAvailable)
            Cursor = Cursors.WaitCursor;

        try
        {
            using var client = new OllamaClient(GetOllamaBaseUrl());
            if (!await client.IsAvailableAsync().ConfigureAwait(true))
            {
                if (IsUiAvailable)
                    PopulateModelCombo([], preferredModel);
                return;
            }

            var models = await client.ListModelsAsync().ConfigureAwait(true);
            if (!IsUiAvailable)
                return;

            PopulateModelCombo(models, preferredModel);
        }
        catch (ObjectDisposedException)
        {
            // Dialog closed while this await was pending; nothing left to update.
        }
        catch (Exception ex)
        {
            if (!IsUiAvailable)
                return;

            PopulateModelCombo([], preferredModel);
            MessageBox.Show(MessageOwner,
                Loc.T("Msg_LlmModelsLoadFailed", ex.Message),
                Loc.T("Dlg_LlmSettings"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        finally
        {
            try
            {
                if (IsUiAvailable)
                {
                    Cursor = previousCursor;
                    UpdateModelSelectionState();
                    btnRefreshModels.Enabled = true;
                }
            }
            catch (ObjectDisposedException)
            {
            }

            _loadingModels = false;
        }
    }

    private void PopulateModelCombo(IReadOnlyList<string> models, string? preferredModel)
    {
        _installedModels = models
            .Where(m => !string.IsNullOrWhiteSpace(m))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
            .ToList();

        cboOllamaModel.Items.Clear();
        foreach (var model in _installedModels)
            cboOllamaModel.Items.Add(model);

        SelectModel(preferredModel);
        UpdateModelSelectionState();
    }

    private void SelectModel(string? modelName)
    {
        if (_installedModels.Count == 0)
        {
            cboOllamaModel.SelectedIndex = -1;
            return;
        }

        if (!string.IsNullOrWhiteSpace(modelName))
        {
            for (var i = 0; i < _installedModels.Count; i++)
            {
                if (string.Equals(_installedModels[i], modelName, StringComparison.OrdinalIgnoreCase))
                {
                    cboOllamaModel.SelectedIndex = i;
                    return;
                }
            }
        }

        cboOllamaModel.SelectedIndex = 0;
    }

    private void UpdateModelSelectionState()
    {
        var hasModels = _installedModels.Count > 0;
        cboOllamaModel.Enabled = hasModels;
        btnOk.Enabled = hasModels;
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (_settings is null)
            return;

        var selected = GetSelectedModelName();
        if (string.IsNullOrWhiteSpace(selected)
            || !_installedModels.Any(m => string.Equals(m, selected, StringComparison.OrdinalIgnoreCase)))
        {
            MessageBox.Show(this,
                Loc.T("Msg_LlmModelRequired"),
                Loc.T("Common_Validation"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
            return;
        }

        _settings.OllamaBaseUrl = GetOllamaBaseUrl();
        _settings.OllamaModel = selected;
        _settings.UseLlmForExcelImport = chkUseForExcelImport.Checked;
        AppSettingsService.Save(_settings);
    }

    private string GetSelectedModelName()
    {
        if (cboOllamaModel.SelectedIndex < 0 || cboOllamaModel.SelectedItem is null)
            return string.Empty;

        return cboOllamaModel.SelectedItem.ToString()?.Trim() ?? string.Empty;
    }

    private string GetOllamaBaseUrl() =>
        string.IsNullOrWhiteSpace(txtOllamaUrl.Text)
            ? "http://localhost:11434"
            : txtOllamaUrl.Text.Trim();
}
