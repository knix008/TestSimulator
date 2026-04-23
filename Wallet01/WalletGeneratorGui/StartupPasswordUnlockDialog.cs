namespace WalletGeneratorGui;

/// <summary>재시작 시 저장된 암호화 니모닉을 열기 위한 패스워드 입력.</summary>
public partial class StartupPasswordUnlockDialog : Form
{
    private string _capturedPassword = string.Empty;

    public StartupPasswordUnlockDialog()
    {
        InitializeComponent();
    }

    public string Password => _capturedPassword;

    private void buttonOk_Click(object sender, EventArgs e)
    {
        _capturedPassword = textBoxPassword.Text ?? string.Empty;
        DialogResult = DialogResult.OK;
    }

    private void buttonMnemonic_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Yes;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        textBoxPassword.Clear();
        base.OnFormClosing(e);
    }
}
