namespace WalletGeneratorGui;

partial class PasswordSetupDialog
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
        labelPassword = new Label();
        textBoxPassword = new TextBox();
        labelConfirm = new Label();
        textBoxConfirm = new TextBox();
        labelHint = new Label();
        buttonOk = new Button();
        buttonCancel = new Button();
        SuspendLayout();
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelTitle.Location = new Point(16, 12);
        labelTitle.MaximumSize = new Size(440, 0);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(400, 23);
        labelTitle.Text = "시작 패스워드 설정";
        labelPassword.AutoSize = true;
        labelPassword.Location = new Point(16, 48);
        labelPassword.Name = "labelPassword";
        labelPassword.Size = new Size(120, 20);
        labelPassword.Text = "패스워드 (8자 이상)";
        textBoxPassword.Font = new Font("Segoe UI", 10F);
        textBoxPassword.Location = new Point(16, 72);
        textBoxPassword.Name = "textBoxPassword";
        textBoxPassword.PasswordChar = '●';
        textBoxPassword.Size = new Size(440, 27);
        textBoxPassword.TabIndex = 0;
        labelConfirm.AutoSize = true;
        labelConfirm.Location = new Point(16, 108);
        labelConfirm.Name = "labelConfirm";
        labelConfirm.Size = new Size(69, 20);
        labelConfirm.Text = "패스워드 확인";
        textBoxConfirm.Font = new Font("Segoe UI", 10F);
        textBoxConfirm.Location = new Point(16, 132);
        textBoxConfirm.Name = "textBoxConfirm";
        textBoxConfirm.PasswordChar = '●';
        textBoxConfirm.Size = new Size(440, 27);
        textBoxConfirm.TabIndex = 1;
        labelHint.AutoSize = true;
        labelHint.Location = new Point(16, 172);
        labelHint.MaximumSize = new Size(440, 0);
        labelHint.Name = "labelHint";
        labelHint.Size = new Size(430, 60);
        labelHint.Text =
            "패스워드 자체는 저장하지 않습니다. BIP39 패스프레이즈로 쓰이며, 지갑을 연 뒤에는 니모닉이 AES로 암호화되어 walletvault.json에만 저장됩니다(평문 니모닉·패스워드는 저장하지 않음).";
        buttonOk.Location = new Point(248, 248);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(96, 32);
        buttonOk.TabIndex = 2;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(360, 248);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(96, 32);
        buttonCancel.TabIndex = 3;
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(472, 296);
        Controls.Add(buttonCancel);
        Controls.Add(buttonOk);
        Controls.Add(labelHint);
        Controls.Add(textBoxConfirm);
        Controls.Add(labelConfirm);
        Controls.Add(textBoxPassword);
        Controls.Add(labelPassword);
        Controls.Add(labelTitle);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "PasswordSetupDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "시작 패스워드";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label labelTitle;
    private Label labelPassword;
    private TextBox textBoxPassword;
    private Label labelConfirm;
    private TextBox textBoxConfirm;
    private Label labelHint;
    private Button buttonOk;
    private Button buttonCancel;
}
