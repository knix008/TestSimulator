using HWP2DocWinV10.Services;

namespace HWP2DocWinV10;

sealed partial class LlmSettingsDialog : Form
{
    public LlmSettingsDialog()
    {
        InitializeComponent();
        cboModel.Text = AppUserSettings.LlmModel;
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
        AppUserSettings.SetLlmModel(cboModel.Text);
        DialogResult = DialogResult.OK;
    }
}
