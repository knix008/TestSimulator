using HWP2DocWinV10.Services;

namespace HWP2DocWinV10;

sealed partial class LlmSettingsDialog : Form
{
    private readonly Dictionary<LlmProcessingTargets, CheckBox> _targetChecks = new();

    public LlmSettingsDialog()
    {
        InitializeComponent();
        cboModel.Text = AppUserSettings.LlmModel;
        BuildTargetCheckboxes();
    }

    private void BuildTargetCheckboxes()
    {
        LlmProcessingTargets saved = AppUserSettings.LlmProcessingTargets;

        foreach (LlmProcessingTargetCatalog.Entry entry in LlmProcessingTargetCatalog.Entries)
        {
            var chk = new CheckBox
            {
                AutoSize = true,
                Checked = saved.HasFlag(entry.Flag),
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.FromArgb(31, 35, 40),
                Margin = new Padding(0, 0, 0, 6),
                Tag = entry.Flag,
                Text = $"{entry.Label} — {entry.Description}",
                UseVisualStyleBackColor = true,
                Width = flpTargets.ClientSize.Width - 8,
            };
            _targetChecks[entry.Flag] = chk;
            flpTargets.Controls.Add(chk);
        }
    }

    private async void btnTest_Click(object? sender, EventArgs e)
    {
        btnTest.Enabled = false;
        lblTestResult.Text = "연결 확인 중...";
        lblTestResult.ForeColor = Color.FromArgb(100, 116, 139);
        string previousText = cboModel.Text;

        try
        {
            List<string> models = await OllamaClient.GetModelsAsync();
            cboModel.Items.Clear();
            cboModel.Items.AddRange(models.ToArray());
            cboModel.Text = string.IsNullOrWhiteSpace(previousText) && models.Count > 0
                ? models[0]
                : previousText;

            lblTestResult.Text = models.Count > 0
                ? $"연결 성공 ({models.Count}개 모델)"
                : "연결 성공 (설치된 모델 없음)";
            lblTestResult.ForeColor = Color.FromArgb(22, 163, 74);
        }
        catch
        {
            lblTestResult.Text = "연결 실패 (Ollama가 실행 중인지 확인하세요)";
            lblTestResult.ForeColor = Color.FromArgb(220, 38, 38);
        }
        finally
        {
            btnTest.Enabled = true;
        }
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        LlmProcessingTargets targets = LlmProcessingTargets.None;
        foreach ((LlmProcessingTargets flag, CheckBox check) in _targetChecks)
        {
            if (check.Checked)
                targets |= flag;
        }

        if (targets == LlmProcessingTargets.None)
        {
            MessageBox.Show(
                this,
                "LLM 처리 대상을 하나 이상 선택하세요.",
                "처리 대상 필요",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        AppUserSettings.SetLlmModel(cboModel.Text);
        AppUserSettings.SetLlmProcessingTargets(targets);
        DialogResult = DialogResult.OK;
    }
}
