using HWP2DocWinV10.Services;

namespace HWP2DocWinV10;

sealed partial class ConvertOptionsDialog : Form
{
    private readonly Dictionary<HwpConversionEngine, RadioButton> _engineRadios = new();

    public HwpConversionEngine SelectedEngine { get; private set; }
    public bool UseLlm { get; private set; }
    public bool UseLlmFastMode { get; private set; }

    public ConvertOptionsDialog()
    {
        InitializeComponent();
        BuildEngineOptions();
        chkUseLlm.Checked = AppUserSettings.LlmEnabled;
        chkLlmFastMode.Checked = AppUserSettings.LlmFastMode;
        chkLlmFastMode.Enabled = chkUseLlm.Checked;
        chkUseLlm.CheckedChanged += (_, _) => chkLlmFastMode.Enabled = chkUseLlm.Checked;
        UpdateModelHint();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        AdjustDialogSize();
    }

    private void BuildEngineOptions()
    {
        RhwpLocator.Refresh();
        Hwp2MdRobocoLocator.Refresh();
        Hwp2MdHephaexLocator.Refresh();

        HwpConversionEngine preferred = HwpConversionEngineCatalog.ResolveDefault(AppUserSettings.ConversionEngine);
        RadioButton? preferredRadio = null;

        foreach (HwpConversionEngineCatalog.Entry entry in HwpConversionEngineCatalog.Entries)
        {
            bool available = entry.IsAvailable();
            var radio = new RadioButton
            {
                AutoSize = true,
                Enabled = available,
                Font = new Font("Segoe UI", 9F),
                ForeColor = available
                    ? Color.FromArgb(31, 35, 40)
                    : Color.FromArgb(148, 163, 184),
                Margin = new Padding(0, 0, 0, 4),
                Tag = entry.Engine,
                Text = entry.Label,
                UseVisualStyleBackColor = true,
                Width = flpEngines.ClientSize.Width - 8,
            };

            string tooltip = available
                ? entry.Description
                : $"{entry.Description}\n\n필요 파일: {entry.MissingToolHint}";
            toolTip.SetToolTip(radio, tooltip);

            if (entry.Engine == preferred && available)
            {
                radio.Checked = true;
                preferredRadio = radio;
            }

            _engineRadios[entry.Engine] = radio;
            flpEngines.Controls.Add(radio);
        }

        if (preferredRadio == null)
        {
            foreach (RadioButton radio in _engineRadios.Values)
            {
                if (!radio.Enabled)
                    continue;

                radio.Checked = true;
                break;
            }
        }

        UpdateEngineHint();
        foreach (RadioButton radio in _engineRadios.Values)
            radio.CheckedChanged += (_, _) => UpdateEngineHint();
    }

    private void AdjustDialogSize()
    {
        mainLayout.PerformLayout();
        engineLayout.PerformLayout();
        llmLayout.PerformLayout();
        llmFooterLayout.PerformLayout();

        int width = 520;
        var preferred = mainLayout.GetPreferredSize(new Size(width - mainLayout.Padding.Horizontal, 0));
        int height = preferred.Height + mainLayout.Padding.Vertical + 8;

        ClientSize = new Size(width, height);
        MinimumSize = new Size(width, height);
    }

    private HwpConversionEngine? GetSelectedEngine()
    {
        foreach ((HwpConversionEngine engine, RadioButton radio) in _engineRadios)
        {
            if (radio.Checked)
                return engine;
        }

        return null;
    }

    private void UpdateEngineHint()
    {
        HwpConversionEngine? selected = GetSelectedEngine();
        if (selected is null)
        {
            lblEngineHint.Text = "● 사용 가능한 엔진을 선택하세요.";
            lblEngineHint.ForeColor = Color.FromArgb(180, 83, 9);
            return;
        }

        HwpConversionEngineCatalog.Entry entry = HwpConversionEngineCatalog.Get(selected.Value);
        if (!entry.IsAvailable())
        {
            lblEngineHint.Text = $"● {entry.Label} — 도구 없음";
            lblEngineHint.ForeColor = Color.FromArgb(180, 83, 9);
            toolTip.SetToolTip(lblEngineHint, entry.MissingToolHint);
            return;
        }

        lblEngineHint.Text = $"● {entry.Label} 선택";
        lblEngineHint.ForeColor = Color.FromArgb(22, 163, 74);

        if (selected.Value == HwpConversionEngine.Unhwp)
        {
            toolTip.SetToolTip(lblEngineHint, entry.Description);
            return;
        }

        string path = selected.Value switch
        {
            HwpConversionEngine.Rhwp when RhwpLocator.TryGetExecutablePath(out string rhwpPath) => rhwpPath,
            HwpConversionEngine.Hwp2MdRoboco => Hwp2MdRobocoLocator.GetExecutablePath(),
            HwpConversionEngine.Hwp2MdHephaex => Hwp2MdHephaexLocator.GetExecutablePath(),
            _ => entry.Description,
        };
        toolTip.SetToolTip(lblEngineHint, $"{entry.Description}\n{path}");
    }

    private void UpdateModelHint()
    {
        string targets = LlmProcessingTargetCatalog.FormatSummary(AppUserSettings.LlmProcessingTargets);
        lblModelHint.Text = string.IsNullOrWhiteSpace(AppUserSettings.LlmModel)
            ? $"모델: (미설정) · 대상: {targets}"
            : $"모델: {AppUserSettings.LlmModel} · 대상: {targets}";
        toolTip.SetToolTip(
            lblModelHint,
            string.IsNullOrWhiteSpace(AppUserSettings.LlmModel)
                ? "LLM 설정에서 모델 이름과 처리 대상을 지정하세요."
                : $"{AppUserSettings.LlmModel}\n처리 대상: {targets}");
    }

    private void btnLlmSettings_Click(object? sender, EventArgs e)
    {
        using var dialog = new LlmSettingsDialog();
        dialog.ShowDialog(this);
        UpdateModelHint();
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        HwpConversionEngine? selected = GetSelectedEngine();
        if (selected is null)
        {
            MessageBox.Show(
                this,
                "변환 엔진을 선택하세요.",
                "엔진 선택 필요",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        HwpConversionEngineCatalog.Entry entry = HwpConversionEngineCatalog.Get(selected.Value);
        if (!entry.IsAvailable())
        {
            MessageBox.Show(
                this,
                $"{entry.Label} 엔진을 사용할 수 없습니다.\n\n{entry.MissingToolHint} 파일을 배치하거나 다른 엔진을 선택하세요.",
                "엔진 사용 불가",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        if (chkUseLlm.Checked && string.IsNullOrWhiteSpace(AppUserSettings.LlmModel))
        {
            MessageBox.Show(
                this,
                "LLM을 사용하려면 먼저 LLM 설정에서 모델 이름을 입력하세요.",
                "LLM 설정 필요",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        SelectedEngine = selected.Value;
        UseLlm = chkUseLlm.Checked;
        UseLlmFastMode = chkLlmFastMode.Checked;
        AppUserSettings.SetConversionEngine(SelectedEngine);
        AppUserSettings.SetLlmEnabled(UseLlm);
        AppUserSettings.SetLlmFastMode(UseLlmFastMode);
        DialogResult = DialogResult.OK;
    }
}
