namespace WalletGeneratorGui;

/// <summary>저장된 주소 목록이 있을 때, 니모닉+패스워드로 파생된 주소가 목록에 있는지 확인합니다.</summary>
public partial class StartupUnlockDialog : Form
{
    private string _capturedMnemonic = string.Empty;
    private string _capturedPassphrase = string.Empty;

    public StartupUnlockDialog()
    {
        InitializeComponent();
    }

    public string CapturedMnemonic => _capturedMnemonic;

    public string CapturedPassphrase => _capturedPassphrase;

    private void buttonOk_Click(object sender, EventArgs e)
    {
        var phrase = WalletForm.NormalizeMnemonicPhrase(textBoxMnemonic.Text);
        var wordCount = phrase.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        if (wordCount is not (12 or 15 or 18 or 21 or 24))
        {
            MessageBox.Show(
                "Mnemonic 단어 수는 12, 15, 18, 21, 24개여야 합니다.",
                "알림",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        _capturedMnemonic = phrase;
        _capturedPassphrase = textBoxPassphrase.Text ?? string.Empty;
        DialogResult = DialogResult.OK;
    }

    private void buttonNewWallet_Click(object sender, EventArgs e)
    {
        var r = MessageBox.Show(
            "저장된 주소 목록(walletbook.json)을 비우고 새 지갑 흐름으로 시작합니다. 계속하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다. 니모닉을 안전한 곳에 백업했는지 확인하세요.",
            "새 지갑으로 시작",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (r != DialogResult.Yes)
        {
            return;
        }

        DialogResult = DialogResult.Retry;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        textBoxMnemonic.Clear();
        textBoxPassphrase.Clear();
        base.OnFormClosing(e);
    }
}
