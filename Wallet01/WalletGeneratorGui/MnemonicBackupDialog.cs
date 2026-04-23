namespace WalletGeneratorGui;

public partial class MnemonicBackupDialog : Form
{
    private readonly bool _requireOfflineSaveAcknowledgement;
    private CheckBox? _checkAckSaved;

    public MnemonicBackupDialog(string mnemonicPhrase, bool requireOfflineSaveAcknowledgement = false)
    {
        InitializeComponent();
        textBoxMnemonic.Text = mnemonicPhrase;
        _requireOfflineSaveAcknowledgement = requireOfflineSaveAcknowledgement;
        if (_requireOfflineSaveAcknowledgement)
        {
            Text = "첫 지갑 — Mnemonic 백업";
            labelWarning.Text =
                "아래 12단어가 이 지갑을 복구하는 유일한 수단입니다. 다음 단계로 넘어가기 전에 반드시 종이 등 오프라인 매체에 옮겨 적어 두세요. PC에만 맡기지 마세요.";
            _checkAckSaved = new CheckBox
            {
                AutoSize = true,
                Location = new Point(16, 196),
                Text = "니모닉을 오프라인으로 저장했습니다(종이 등).",
            };
            Controls.Add(_checkAckSaved);
            buttonCopy.Location = new Point(16, 228);
            buttonOk.Location = new Point(376, 224);
            buttonOk.DialogResult = DialogResult.None;
            buttonOk.Enabled = false;
            _checkAckSaved.CheckedChanged += (_, _) => buttonOk.Enabled = _checkAckSaved.Checked;
            buttonOk.Click += FirstRunAcknowledgedOk_Click;
            ClientSize = new Size(512, 272);
        }
    }

    private void FirstRunAcknowledgedOk_Click(object? sender, EventArgs e)
    {
        if (_checkAckSaved?.Checked != true)
        {
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
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
