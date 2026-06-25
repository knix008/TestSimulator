namespace HWP2DocWinV10;

partial class ErrorDialog
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
        pnlAccent = new Panel();
        picError = new PictureBox();
        lblSummary = new Label();
        lblDetails = new Label();
        txtDetails = new TextBox();
        btnCopy = new Button();
        btnOk = new Button();
        ((System.ComponentModel.ISupportInitialize)picError).BeginInit();
        SuspendLayout();
        // 
        // pnlAccent
        // 
        pnlAccent.BackColor = Color.FromArgb(220, 38, 38);
        pnlAccent.Dock = DockStyle.Top;
        pnlAccent.Location = new Point(0, 0);
        pnlAccent.Name = "pnlAccent";
        pnlAccent.Size = new Size(584, 4);
        pnlAccent.TabIndex = 0;
        // 
        // picError
        // 
        picError.Location = new Point(24, 20);
        picError.Name = "picError";
        picError.Size = new Size(32, 32);
        picError.SizeMode = PictureBoxSizeMode.CenterImage;
        picError.TabIndex = 1;
        picError.TabStop = false;
        // 
        // lblSummary
        // 
        lblSummary.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        lblSummary.Font = new Font("Segoe UI", 10F);
        lblSummary.ForeColor = Color.FromArgb(31, 35, 40);
        lblSummary.Location = new Point(68, 20);
        lblSummary.Name = "lblSummary";
        lblSummary.Size = new Size(492, 48);
        lblSummary.TabIndex = 2;
        lblSummary.Text = "오류가 발생했습니다.";
        // 
        // lblDetails
        // 
        lblDetails.AutoSize = true;
        lblDetails.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDetails.ForeColor = Color.FromArgb(71, 85, 105);
        lblDetails.Location = new Point(24, 80);
        lblDetails.Name = "lblDetails";
        lblDetails.Size = new Size(55, 15);
        lblDetails.TabIndex = 3;
        lblDetails.Text = "상세 내용";
        // 
        // txtDetails
        // 
        txtDetails.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        txtDetails.BackColor = Color.White;
        txtDetails.Font = new Font("Consolas", 9F);
        txtDetails.ForeColor = Color.FromArgb(31, 35, 40);
        txtDetails.Location = new Point(24, 102);
        txtDetails.Multiline = true;
        txtDetails.Name = "txtDetails";
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Both;
        txtDetails.Size = new Size(536, 240);
        txtDetails.TabIndex = 4;
        txtDetails.WordWrap = false;
        // 
        // btnCopy
        // 
        btnCopy.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnCopy.BackColor = Color.FromArgb(241, 245, 249);
        btnCopy.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
        btnCopy.FlatStyle = FlatStyle.Flat;
        btnCopy.Font = new Font("Segoe UI", 9.5F);
        btnCopy.ForeColor = Color.FromArgb(31, 35, 40);
        btnCopy.Location = new Point(364, 358);
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(96, 34);
        btnCopy.TabIndex = 5;
        btnCopy.Text = "복사";
        btnCopy.UseVisualStyleBackColor = false;
        btnCopy.Click += btnCopy_Click;
        // 
        // btnOk
        // 
        btnOk.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnOk.BackColor = Color.FromArgb(37, 99, 235);
        btnOk.DialogResult = DialogResult.OK;
        btnOk.FlatAppearance.BorderSize = 0;
        btnOk.FlatAppearance.MouseOverBackColor = Color.FromArgb(29, 78, 216);
        btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.Font = new Font("Segoe UI", 9.5F);
        btnOk.ForeColor = Color.White;
        btnOk.Location = new Point(464, 358);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(96, 34);
        btnOk.TabIndex = 6;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = false;
        // 
        // ErrorDialog
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.White;
        ClientSize = new Size(584, 411);
        Controls.Add(btnOk);
        Controls.Add(btnCopy);
        Controls.Add(txtDetails);
        Controls.Add(lblDetails);
        Controls.Add(lblSummary);
        Controls.Add(picError);
        Controls.Add(pnlAccent);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        MinimumSize = new Size(480, 320);
        Name = "ErrorDialog";
        ShowIcon = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "오류";
        Load += ErrorDialog_Load;
        ((System.ComponentModel.ISupportInitialize)picError).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private Panel pnlAccent;
    private PictureBox picError;
    private Label lblSummary;
    private Label lblDetails;
    private TextBox txtDetails;
    private Button btnCopy;
    private Button btnOk;
}
