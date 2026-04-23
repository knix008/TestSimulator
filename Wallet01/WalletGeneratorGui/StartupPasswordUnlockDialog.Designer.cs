namespace WalletGeneratorGui;

partial class StartupPasswordUnlockDialog
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
        labelHint = new Label();
        buttonOk = new Button();
        buttonMnemonic = new Button();
        buttonCancel = new Button();
        SuspendLayout();
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelTitle.Location = new Point(16, 12);
        labelTitle.MaximumSize = new Size(440, 0);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(400, 23);
        labelTitle.Text = "지갑 열기";
        labelPassword.AutoSize = true;
        labelPassword.Location = new Point(16, 48);
        labelPassword.Name = "labelPassword";
        labelPassword.Size = new Size(120, 20);
        labelPassword.Text = "시작 패스워드";
        textBoxPassword.Font = new Font("Segoe UI", 10F);
        textBoxPassword.Location = new Point(16, 72);
        textBoxPassword.Name = "textBoxPassword";
        textBoxPassword.PasswordChar = '●';
        textBoxPassword.Size = new Size(440, 27);
        textBoxPassword.TabIndex = 0;
        labelHint.AutoSize = true;
        labelHint.Location = new Point(16, 112);
        labelHint.MaximumSize = new Size(440, 0);
        labelHint.Name = "labelHint";
        labelHint.Size = new Size(420, 60);
        labelHint.Text =
            "이전에 이 PC에 저장된 암호화 니모닉을 엽니다. 패스워드는 저장되지 않으며, 니모닉 파일만 디스크에 있습니다.";
        buttonOk.Location = new Point(144, 192);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(96, 32);
        buttonOk.TabIndex = 1;
        buttonOk.Text = "열기";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        buttonMnemonic.Location = new Point(248, 192);
        buttonMnemonic.Name = "buttonMnemonic";
        buttonMnemonic.Size = new Size(120, 32);
        buttonMnemonic.TabIndex = 2;
        buttonMnemonic.Text = "니모닉으로 복구";
        buttonMnemonic.UseVisualStyleBackColor = true;
        buttonMnemonic.Click += buttonMnemonic_Click;
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(376, 192);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(96, 32);
        buttonCancel.TabIndex = 3;
        buttonCancel.Text = "종료";
        buttonCancel.UseVisualStyleBackColor = true;
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(488, 240);
        Controls.Add(buttonCancel);
        Controls.Add(buttonMnemonic);
        Controls.Add(buttonOk);
        Controls.Add(labelHint);
        Controls.Add(textBoxPassword);
        Controls.Add(labelPassword);
        Controls.Add(labelTitle);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "StartupPasswordUnlockDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "지갑 열기";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label labelTitle;
    private Label labelPassword;
    private TextBox textBoxPassword;
    private Label labelHint;
    private Button buttonOk;
    private Button buttonMnemonic;
    private Button buttonCancel;
}
