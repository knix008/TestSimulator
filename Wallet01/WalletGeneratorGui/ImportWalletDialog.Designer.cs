namespace WalletGeneratorGui;

partial class ImportWalletDialog
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
        radioMnemonic = new RadioButton();
        radioPrivateKey = new RadioButton();
        labelHint = new Label();
        textBoxSecret = new TextBox();
        buttonOk = new Button();
        buttonCancel = new Button();
        SuspendLayout();
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelTitle.Location = new Point(16, 12);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(200, 23);
        labelTitle.TabIndex = 0;
        labelTitle.Text = "지갑 불러오기";
        radioMnemonic.AutoSize = true;
        radioMnemonic.Checked = true;
        radioMnemonic.Location = new Point(16, 44);
        radioMnemonic.Name = "radioMnemonic";
        radioMnemonic.Size = new Size(150, 24);
        radioMnemonic.TabIndex = 1;
        radioMnemonic.TabStop = true;
        radioMnemonic.Text = "Mnemonic (12단어)";
        radioMnemonic.UseVisualStyleBackColor = true;
        radioMnemonic.CheckedChanged += radioKind_CheckedChanged;
        radioPrivateKey.AutoSize = true;
        radioPrivateKey.Location = new Point(200, 44);
        radioPrivateKey.Name = "radioPrivateKey";
        radioPrivateKey.Size = new Size(104, 24);
        radioPrivateKey.TabIndex = 2;
        radioPrivateKey.Text = "Private Key";
        radioPrivateKey.UseVisualStyleBackColor = true;
        radioPrivateKey.CheckedChanged += radioKind_CheckedChanged;
        labelHint.AutoSize = true;
        labelHint.Location = new Point(16, 76);
        labelHint.Name = "labelHint";
        labelHint.Size = new Size(42, 20);
        labelHint.TabIndex = 3;
        labelHint.Text = "Hint";
        textBoxSecret.Font = new Font("Consolas", 10F);
        textBoxSecret.Location = new Point(16, 100);
        textBoxSecret.Multiline = true;
        textBoxSecret.Name = "textBoxSecret";
        textBoxSecret.ScrollBars = ScrollBars.Vertical;
        textBoxSecret.Size = new Size(456, 100);
        textBoxSecret.TabIndex = 4;
        buttonOk.Location = new Point(268, 216);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(96, 32);
        buttonOk.TabIndex = 5;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(376, 216);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(96, 32);
        buttonCancel.TabIndex = 6;
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(488, 264);
        Controls.Add(buttonCancel);
        Controls.Add(buttonOk);
        Controls.Add(textBoxSecret);
        Controls.Add(labelHint);
        Controls.Add(radioPrivateKey);
        Controls.Add(radioMnemonic);
        Controls.Add(labelTitle);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ImportWalletDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "지갑 불러오기";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label labelTitle;
    private RadioButton radioMnemonic;
    private RadioButton radioPrivateKey;
    private Label labelHint;
    private TextBox textBoxSecret;
    private Button buttonOk;
    private Button buttonCancel;
}
