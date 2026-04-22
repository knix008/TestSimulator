namespace WalletGeneratorGui;

public enum WalletImportKind
{
    Mnemonic,
    PrivateKey
}

public partial class ImportWalletDialog : Form
{
    /// <summary>
    /// OK 시점에 저장합니다. 폼이 닫히면서 <see cref="OnFormClosing"/>에서 입력란을 비우므로,
    /// <c>ShowDialog</c> 이후에는 TextBox가 아닌 이 값을 사용해야 합니다.
    /// </summary>
    private string _capturedSecret = string.Empty;

    public ImportWalletDialog()
    {
        InitializeComponent();
        UpdateInputHint();
    }

    public WalletImportKind SelectedKind =>
        radioPrivateKey.Checked ? WalletImportKind.PrivateKey : WalletImportKind.Mnemonic;

    public string SecretInput => _capturedSecret;

    private void radioKind_CheckedChanged(object sender, EventArgs e)
    {
        UpdateInputHint();
    }

    private void UpdateInputHint()
    {
        if (radioPrivateKey.Checked)
        {
            labelHint.Text = "Private Key (64자리 hex, 0x 접두사 선택)";
            textBoxSecret.PasswordChar = '*';
        }
        else
        {
            labelHint.Text = "Mnemonic (BIP39: 12 / 15 / 18 / 21 / 24단어, 공백·줄바꿈으로 구분)";
            textBoxSecret.PasswordChar = '\0';
        }
    }

    private void buttonOk_Click(object sender, EventArgs e)
    {
        var raw = textBoxSecret.Text.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            MessageBox.Show("Mnemonic 또는 Private Key를 입력하세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _capturedSecret = raw;
        DialogResult = DialogResult.OK;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        textBoxSecret.Clear();
        base.OnFormClosing(e);
    }
}
