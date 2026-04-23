namespace WalletGeneratorGui;

/// <summary>앱 시작 시 BIP39 패스프레이즈로 쓸 패스워드를 설정합니다. 값은 디스크에 저장하지 않습니다.</summary>
public partial class PasswordSetupDialog : Form
{
    private string _capturedPassphrase = string.Empty;

    public PasswordSetupDialog()
    {
        InitializeComponent();
    }

    /// <summary>확인 시점의 패스프레이즈. 폼 종료 후에는 비어 있으므로 이 속성만 사용하세요.</summary>
    public string Passphrase => _capturedPassphrase;

    private void buttonOk_Click(object sender, EventArgs e)
    {
        var a = textBoxPassword.Text;
        var b = textBoxConfirm.Text;
        if (string.IsNullOrEmpty(a))
        {
            MessageBox.Show("패스워드를 입력하세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (a.Length < 8)
        {
            MessageBox.Show("패스워드는 8자 이상이어야 합니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!string.Equals(a, b, StringComparison.Ordinal))
        {
            MessageBox.Show("패스워드와 확인 입력이 일치하지 않습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _capturedPassphrase = a;
        DialogResult = DialogResult.OK;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        textBoxPassword.Clear();
        textBoxConfirm.Clear();
        base.OnFormClosing(e);
    }
}
