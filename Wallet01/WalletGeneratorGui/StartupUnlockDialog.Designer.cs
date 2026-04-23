namespace WalletGeneratorGui;

partial class StartupUnlockDialog
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        labelTitle = new Label();
        labelMnemonic = new Label();
        textBoxMnemonic = new TextBox();
        labelPassphrase = new Label();
        textBoxPassphrase = new TextBox();
        labelHint = new Label();
        buttonOk = new Button();
        buttonNewWallet = new Button();
        buttonCancel = new Button();
        SuspendLayout();
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelTitle.Location = new Point(16, 12);
        labelTitle.MaximumSize = new Size(520, 0);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(480, 23);
        labelTitle.Text = "저장된 지갑 열기";
        labelMnemonic.AutoSize = true;
        labelMnemonic.Location = new Point(16, 44);
        labelMnemonic.Name = "labelMnemonic";
        labelMnemonic.Size = new Size(69, 20);
        labelMnemonic.Text = "Mnemonic";
        textBoxMnemonic.Font = new Font("Consolas", 10F);
        textBoxMnemonic.Location = new Point(16, 68);
        textBoxMnemonic.Multiline = true;
        textBoxMnemonic.Name = "textBoxMnemonic";
        textBoxMnemonic.ScrollBars = ScrollBars.Vertical;
        textBoxMnemonic.Size = new Size(520, 100);
        textBoxMnemonic.TabIndex = 0;
        labelPassphrase.AutoSize = true;
        labelPassphrase.Location = new Point(16, 176);
        labelPassphrase.Name = "labelPassphrase";
        labelPassphrase.Size = new Size(200, 20);
        labelPassphrase.Text = "시작 패스워드 (BIP39 패스프레이즈)";
        textBoxPassphrase.Font = new Font("Segoe UI", 10F);
        textBoxPassphrase.Location = new Point(16, 200);
        textBoxPassphrase.Name = "textBoxPassphrase";
        textBoxPassphrase.PasswordChar = '●';
        textBoxPassphrase.Size = new Size(520, 27);
        textBoxPassphrase.TabIndex = 1;
        labelHint.AutoSize = true;
        labelHint.Location = new Point(16, 236);
        labelHint.MaximumSize = new Size(520, 0);
        labelHint.Name = "labelHint";
        labelHint.Size = new Size(500, 40);
        labelHint.Text =
            "한 번 성공하면 니모닉이 암호화되어 walletvault.json에 저장되어, 다음부터는 시작 패스워드만으로 열 수 있습니다. 예전(패스워드 없음) 지갑은 패스워드 칸을 비우세요.";
        buttonOk.Location = new Point(232, 292);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(96, 32);
        buttonOk.TabIndex = 2;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        buttonNewWallet.Location = new Point(336, 292);
        buttonNewWallet.Name = "buttonNewWallet";
        buttonNewWallet.Size = new Size(120, 32);
        buttonNewWallet.TabIndex = 3;
        buttonNewWallet.Text = "새 지갑으로 시작";
        buttonNewWallet.UseVisualStyleBackColor = true;
        buttonNewWallet.Click += buttonNewWallet_Click;
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(464, 292);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(88, 32);
        buttonCancel.TabIndex = 4;
        buttonCancel.Text = "종료";
        buttonCancel.UseVisualStyleBackColor = true;
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(552, 340);
        Controls.Add(buttonCancel);
        Controls.Add(buttonNewWallet);
        Controls.Add(buttonOk);
        Controls.Add(labelHint);
        Controls.Add(textBoxPassphrase);
        Controls.Add(labelPassphrase);
        Controls.Add(textBoxMnemonic);
        Controls.Add(labelMnemonic);
        Controls.Add(labelTitle);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "StartupUnlockDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "지갑 잠금 해제";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label labelTitle;
    private Label labelMnemonic;
    private TextBox textBoxMnemonic;
    private Label labelPassphrase;
    private TextBox textBoxPassphrase;
    private Label labelHint;
    private Button buttonOk;
    private Button buttonNewWallet;
    private Button buttonCancel;
}
