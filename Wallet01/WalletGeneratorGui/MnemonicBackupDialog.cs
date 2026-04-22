namespace WalletGeneratorGui;

public partial class MnemonicBackupDialog : Form
{
    public MnemonicBackupDialog(string mnemonicPhrase)
    {
        InitializeComponent();
        textBoxMnemonic.Text = mnemonicPhrase;
    }

    private void buttonCopy_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(textBoxMnemonic.Text))
        {
            return;
        }

        Clipboard.SetText(textBoxMnemonic.Text.Trim());
        MessageBox.Show("Mnemonic을 클립보드에 복사했습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        textBoxMnemonic.Clear();
        base.OnFormClosing(e);
    }
}
