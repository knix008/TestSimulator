namespace MyAgileBoardWinV10.Forms;

partial class ErrorDialogForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        picIcon = new PictureBox();
        lblSummary = new Label();
        lblDetailsCaption = new Label();
        txtDetails = new TextBox();
        btnCopy = new Button();
        btnOk = new Button();
        ((System.ComponentModel.ISupportInitialize)picIcon).BeginInit();
        SuspendLayout();

        picIcon.Location = new Point(12, 12);
        picIcon.Size = new Size(32, 32);
        picIcon.SizeMode = PictureBoxSizeMode.StretchImage;
        picIcon.TabStop = false;

        lblSummary.AutoSize = false;
        lblSummary.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblSummary.Location = new Point(52, 12);
        lblSummary.Size = new Size(520, 40);
        lblSummary.TextAlign = ContentAlignment.MiddleLeft;

        lblDetailsCaption.AutoSize = true;
        lblDetailsCaption.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDetailsCaption.Location = new Point(12, 58);
        lblDetailsCaption.Text = "상세 내용";

        txtDetails.Font = new Font("Consolas", 9F);
        txtDetails.Location = new Point(12, 78);
        txtDetails.Multiline = true;
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Both;
        txtDetails.Size = new Size(560, 260);
        txtDetails.TabIndex = 0;
        txtDetails.WordWrap = false;
        txtDetails.KeyDown += txtDetails_KeyDown;

        btnCopy.Location = new Point(416, 348);
        btnCopy.Size = new Size(75, 30);
        btnCopy.TabIndex = 1;
        btnCopy.Text = "복사";
        btnCopy.UseVisualStyleBackColor = true;
        btnCopy.Click += btnCopy_Click;

        btnOk.Location = new Point(497, 348);
        btnOk.Size = new Size(75, 30);
        btnOk.TabIndex = 2;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(584, 390);
        Controls.AddRange(new Control[]
        {
            picIcon, lblSummary, lblDetailsCaption, txtDetails, btnCopy, btnOk
        });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "오류";

        ((System.ComponentModel.ISupportInitialize)picIcon).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private PictureBox picIcon = null!;
    private Label lblSummary = null!;
    private Label lblDetailsCaption = null!;
    private TextBox txtDetails = null!;
    private Button btnCopy = null!;
    private Button btnOk = null!;
}
