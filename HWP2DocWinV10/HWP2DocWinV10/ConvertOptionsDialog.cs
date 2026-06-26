using HWP2DocWinV10.Services;

namespace HWP2DocWinV10;

sealed partial class ConvertOptionsDialog : Form
{
    public bool UseRhwp { get; private set; }
    public bool UseLlm { get; private set; }

    public ConvertOptionsDialog()
    {
        InitializeComponent();
        RefreshRhwpOptionState();
        chkUseLlm.Checked = AppUserSettings.LlmEnabled;
        UpdateModelHint();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        AdjustDialogSize();
    }

    private void AdjustDialogSize()
    {
        mainLayout.PerformLayout();

        const int buttonRowHeight = 42;
        int height = mainLayout.Padding.Vertical + buttonRowHeight + 1;
        height += lblTitle.PreferredSize.Height + lblTitle.Margin.Vertical;
        height += rhwpPanel.PreferredSize.Height + rhwpPanel.Margin.Vertical;
        height += llmPanel.PreferredSize.Height + llmPanel.Margin.Vertical;
        height += dividerPanel.Margin.Vertical;

        ClientSize = new Size(500, height);
        MinimumSize = new Size(500, height);
    }

    private void RefreshRhwpOptionState()
    {
        RhwpLocator.Refresh();
        bool rhwpAvailable = RhwpLocator.IsAvailable();
        chkUseRhwp.Checked = rhwpAvailable && AppUserSettings.RhwpEnabled;
        chkUseRhwp.Enabled = rhwpAvailable;
        UpdateRhwpHint();
    }

    private void UpdateRhwpHint()
    {
        if (RhwpLocator.IsAvailable())
        {
            RhwpLocator.TryGetExecutablePath(out string path);
            lblRhwpHint.Text = "● 사용 가능";
            lblRhwpHint.ForeColor = Color.FromArgb(22, 163, 74);
            toolTip.SetToolTip(lblRhwpHint, path);
            toolTip.SetToolTip(chkUseRhwp, path);
            return;
        }

        lblRhwpHint.Text = "● rhwp.exe 없음 — unhwp만 사용";
        lblRhwpHint.ForeColor = Color.FromArgb(180, 83, 9);
        toolTip.SetToolTip(lblRhwpHint, @"Tools\rhwp\rhwp.exe");
        toolTip.SetToolTip(chkUseRhwp, null);
    }

    private void UpdateModelHint()
    {
        lblModelHint.Text = string.IsNullOrWhiteSpace(AppUserSettings.LlmModel)
            ? "모델: (미설정)"
            : $"모델: {AppUserSettings.LlmModel}";
        toolTip.SetToolTip(
            lblModelHint,
            string.IsNullOrWhiteSpace(AppUserSettings.LlmModel)
                ? "LLM 설정에서 모델 이름을 입력하세요."
                : AppUserSettings.LlmModel);
    }

    private void btnLlmSettings_Click(object? sender, EventArgs e)
    {
        using var dialog = new LlmSettingsDialog();
        dialog.ShowDialog(this);
        UpdateModelHint();
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
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

        UseRhwp = chkUseRhwp.Checked;
        UseLlm = chkUseLlm.Checked;
        AppUserSettings.SetRhwpEnabled(UseRhwp);
        AppUserSettings.SetLlmEnabled(UseLlm);
        DialogResult = DialogResult.OK;
    }
}
