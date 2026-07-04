namespace MyWorkspace.Win.Forms;

partial class InputDialogForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblPrompt = new Label();
        txtInput = new TextBox();
        btnOk = new ThemedDialogButton();
        btnCancel = new ThemedDialogButton();
        SuspendLayout();

        lblPrompt.AutoSize = true;
        lblPrompt.Location = new Point(16, 16);
        lblPrompt.Name = "lblPrompt";
        lblPrompt.Size = new Size(43, 15);
        lblPrompt.Text = "입력";

        txtInput.Location = new Point(16, 40);
        txtInput.Name = "txtInput";
        txtInput.Size = new Size(320, 23);
        txtInput.TabIndex = 0;

        btnOk.Location = new Point(160, 80);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(96, 32);
        btnOk.TabIndex = 1;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(256, 80);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(96, 32);
        btnCancel.TabIndex = 2;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(354, 124);
        Controls.Add(btnCancel);
        Controls.Add(btnOk);
        Controls.Add(txtInput);
        Controls.Add(lblPrompt);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "InputDialogForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "입력";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblPrompt;
    private TextBox txtInput;
    private Button btnOk;
    private Button btnCancel;
}
