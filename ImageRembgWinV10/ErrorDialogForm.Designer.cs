namespace ImageRembgWinV10;

partial class ErrorDialogForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        lblSummary = new Label();
        lblMessage = new Label();
        txtDetails = new TextBox();
        btnCopy = new Button();
        btnOk = new Button();
        SuspendLayout();
        // 
        // lblSummary
        // 
        lblSummary.AutoSize = false;
        lblSummary.Location = new Point(12, 12);
        lblSummary.Name = "lblSummary";
        lblSummary.Size = new Size(560, 32);
        lblSummary.TabIndex = 0;
        // 
        // lblMessage
        // 
        lblMessage.AutoSize = false;
        lblMessage.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblMessage.ForeColor = Color.FromArgb(180, 40, 40);
        lblMessage.Location = new Point(12, 48);
        lblMessage.Name = "lblMessage";
        lblMessage.Size = new Size(560, 48);
        lblMessage.TabIndex = 4;
        // 
        // txtDetails
        // 
        txtDetails.BackColor = SystemColors.Window;
        txtDetails.Font = new Font("Consolas", 9F);
        txtDetails.ForeColor = SystemColors.WindowText;
        txtDetails.Location = new Point(12, 102);
        txtDetails.Multiline = true;
        txtDetails.Name = "txtDetails";
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Vertical;
        txtDetails.Size = new Size(560, 194);
        txtDetails.TabIndex = 1;
        txtDetails.WordWrap = true;
        // 
        // btnCopy
        // 
        btnCopy.Location = new Point(376, 308);
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(110, 28);
        btnCopy.TabIndex = 2;
        btnCopy.Text = "내용 복사";
        btnCopy.UseVisualStyleBackColor = true;
        btnCopy.Click += btnCopy_Click;
        // 
        // btnOk
        // 
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(492, 308);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(80, 28);
        btnOk.TabIndex = 3;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // ErrorDialogForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(584, 348);
        Controls.Add(lblMessage);
        Controls.Add(btnOk);
        Controls.Add(btnCopy);
        Controls.Add(txtDetails);
        Controls.Add(lblSummary);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ErrorDialogForm";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "오류";
        ResumeLayout(false);
    }

    #endregion

    private Label lblSummary;
    private Label lblMessage;
    private TextBox txtDetails;
    private Button btnCopy;
    private Button btnOk;
}
