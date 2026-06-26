namespace HWP2DocWinV10;

partial class AboutDialog
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
        picAppIcon = new PictureBox();
        lblTitle = new Label();
        lblVersion = new Label();
        lblDescription = new Label();
        pnlLibraries = new Panel();
        lblLibrariesTitle = new Label();
        lblLibraries = new Label();
        lblCopyright = new Label();
        btnOk = new Button();
        ((System.ComponentModel.ISupportInitialize)picAppIcon).BeginInit();
        pnlLibraries.SuspendLayout();
        SuspendLayout();
        // 
        // pnlAccent
        // 
        pnlAccent.BackColor = Color.FromArgb(37, 99, 235);
        pnlAccent.Dock = DockStyle.Top;
        pnlAccent.Location = new Point(0, 0);
        pnlAccent.Name = "pnlAccent";
        pnlAccent.Size = new Size(424, 4);
        pnlAccent.TabIndex = 0;
        // 
        // picAppIcon
        // 
        picAppIcon.Location = new Point(28, 24);
        picAppIcon.Name = "picAppIcon";
        picAppIcon.Size = new Size(48, 48);
        picAppIcon.SizeMode = PictureBoxSizeMode.Zoom;
        picAppIcon.TabIndex = 1;
        picAppIcon.TabStop = false;
        // 
        // lblTitle
        // 
        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI", 20F, FontStyle.Bold);
        lblTitle.ForeColor = Color.FromArgb(31, 35, 40);
        lblTitle.Location = new Point(84, 28);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(113, 37);
        lblTitle.TabIndex = 2;
        lblTitle.Text = "HWP2Doc";
        // 
        // lblVersion
        // 
        lblVersion.AutoSize = true;
        lblVersion.Font = new Font("Segoe UI", 10F);
        lblVersion.ForeColor = Color.FromArgb(100, 116, 139);
        lblVersion.Location = new Point(86, 68);
        lblVersion.Name = "lblVersion";
        lblVersion.Size = new Size(68, 19);
        lblVersion.TabIndex = 3;
        lblVersion.Text = "버전 1.0.0";
        // 
        // lblDescription
        // 
        lblDescription.AutoSize = true;
        lblDescription.Font = new Font("Segoe UI", 9.75F);
        lblDescription.ForeColor = Color.FromArgb(71, 85, 105);
        lblDescription.Location = new Point(28, 88);
        lblDescription.MaximumSize = new Size(368, 0);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(363, 34);
        lblDescription.TabIndex = 4;
        lblDescription.Text = "아래한글(.hwp, .hwpx) 문서를 Markdown으로 변환하고\r\nWord, PDF로 내보낼 수 있습니다.";
        // 
        // pnlLibraries
        // 
        pnlLibraries.BackColor = Color.FromArgb(241, 245, 249);
        pnlLibraries.Controls.Add(lblLibrariesTitle);
        pnlLibraries.Controls.Add(lblLibraries);
        pnlLibraries.Location = new Point(28, 136);
        pnlLibraries.Name = "pnlLibraries";
        pnlLibraries.Padding = new Padding(16, 14, 16, 14);
        pnlLibraries.Size = new Size(368, 118);
        pnlLibraries.TabIndex = 5;
        // 
        // lblLibrariesTitle
        // 
        lblLibrariesTitle.AutoSize = true;
        lblLibrariesTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblLibrariesTitle.ForeColor = Color.FromArgb(31, 35, 40);
        lblLibrariesTitle.Location = new Point(16, 14);
        lblLibrariesTitle.Name = "lblLibrariesTitle";
        lblLibrariesTitle.Size = new Size(83, 15);
        lblLibrariesTitle.TabIndex = 0;
        lblLibrariesTitle.Text = "사용 구성 요소";
        // 
        // lblLibraries
        // 
        lblLibraries.AutoSize = true;
        lblLibraries.Font = new Font("Segoe UI", 9F);
        lblLibraries.ForeColor = Color.FromArgb(71, 85, 105);
        lblLibraries.Location = new Point(16, 36);
        lblLibraries.Name = "lblLibraries";
        lblLibraries.Size = new Size(287, 60);
        lblLibraries.TabIndex = 1;
        lblLibraries.Text = "unhwp — HWP/HWPX → Markdown 변환 (MIT)\r\nMarkdig — Markdown 미리보기\r\nMicrosoft WebView2 — HTML/PDF 렌더링\r\nDocumentFormat.OpenXml — Word 내보내기";
        // 
        // lblCopyright
        // 
        lblCopyright.AutoSize = true;
        lblCopyright.Font = new Font("Segoe UI", 8.5F);
        lblCopyright.ForeColor = Color.FromArgb(148, 163, 184);
        lblCopyright.Location = new Point(28, 268);
        lblCopyright.Name = "lblCopyright";
        lblCopyright.Size = new Size(164, 15);
        lblCopyright.TabIndex = 6;
        lblCopyright.Text = "Copyright © 2026 SHKWON (knix008@naver.com)";
        // 
        // btnOk
        // 
        btnOk.BackColor = Color.FromArgb(37, 99, 235);
        btnOk.DialogResult = DialogResult.OK;
        btnOk.FlatAppearance.BorderSize = 0;
        btnOk.FlatAppearance.MouseOverBackColor = Color.FromArgb(29, 78, 216);
        btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.Font = new Font("Segoe UI", 9.5F);
        btnOk.ForeColor = Color.White;
        btnOk.Location = new Point(300, 292);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(96, 34);
        btnOk.TabIndex = 7;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = false;
        // 
        // AboutDialog
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.White;
        ClientSize = new Size(424, 344);
        Controls.Add(btnOk);
        Controls.Add(lblCopyright);
        Controls.Add(pnlLibraries);
        Controls.Add(lblDescription);
        Controls.Add(lblVersion);
        Controls.Add(lblTitle);
        Controls.Add(picAppIcon);
        Controls.Add(pnlAccent);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AboutDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "HWP2Doc 정보";
        Load += AboutDialog_Load;
        ((System.ComponentModel.ISupportInitialize)picAppIcon).EndInit();
        pnlLibraries.ResumeLayout(false);
        pnlLibraries.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private Panel pnlAccent;
    private PictureBox picAppIcon;
    private Label lblTitle;
    private Label lblVersion;
    private Label lblDescription;
    private Panel pnlLibraries;
    private Label lblLibrariesTitle;
    private Label lblLibraries;
    private Label lblCopyright;
    private Button btnOk;
}
