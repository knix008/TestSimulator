namespace WalletGeneratorGui;

partial class MnemonicBackupDialog
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
        labelWarning = new Label();
        textBoxMnemonic = new TextBox();
        buttonCopy = new Button();
        buttonOk = new Button();
        SuspendLayout();
        labelWarning.AutoSize = true;
        labelWarning.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        labelWarning.ForeColor = Color.Firebrick;
        labelWarning.Location = new Point(16, 16);
        labelWarning.MaximumSize = new Size(480, 0);
        labelWarning.Name = "labelWarning";
        labelWarning.Size = new Size(456, 40);
        labelWarning.TabIndex = 0;
        labelWarning.Text = "12단어 Mnemonic은 지갑 복구의 유일한 수단입니다. 안전한 곳에 기록하고 타인과 공유하지 마세요.";
        textBoxMnemonic.Font = new Font("Consolas", 10F);
        textBoxMnemonic.Location = new Point(16, 68);
        textBoxMnemonic.Multiline = true;
        textBoxMnemonic.Name = "textBoxMnemonic";
        textBoxMnemonic.ReadOnly = true;
        textBoxMnemonic.ScrollBars = ScrollBars.Vertical;
        textBoxMnemonic.Size = new Size(480, 120);
        textBoxMnemonic.TabIndex = 1;
        buttonCopy.Location = new Point(16, 200);
        buttonCopy.Name = "buttonCopy";
        buttonCopy.Size = new Size(120, 32);
        buttonCopy.TabIndex = 2;
        buttonCopy.Text = "Mnemonic 복사";
        buttonCopy.UseVisualStyleBackColor = true;
        buttonCopy.Click += buttonCopy_Click;
        buttonOk.DialogResult = DialogResult.OK;
        buttonOk.Location = new Point(376, 200);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(120, 32);
        buttonOk.TabIndex = 3;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(512, 248);
        Controls.Add(buttonOk);
        Controls.Add(buttonCopy);
        Controls.Add(textBoxMnemonic);
        Controls.Add(labelWarning);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "MnemonicBackupDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "새 지갑 — Mnemonic 백업";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label labelWarning;
    private TextBox textBoxMnemonic;
    private Button buttonCopy;
    private Button buttonOk;
}
