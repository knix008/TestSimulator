namespace MyAgileBoardWinV10.Forms;

partial class AboutForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null) components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblAppName    = new Label();
        lblVersion    = new Label();
        lblDescription = new Label();
        lblAuthor     = new Label();
        lblCopyright  = new Label();
        panelTop      = new Panel();
        btnOk         = new Button();

        SuspendLayout();
        panelTop.SuspendLayout();

        // panelTop
        panelTop.BackColor = Color.FromArgb(68, 114, 196);
        panelTop.Dock      = DockStyle.Top;
        panelTop.Height    = 80;
        panelTop.Controls.Add(lblAppName);

        // lblAppName
        lblAppName.Dock      = DockStyle.Fill;
        lblAppName.ForeColor = Color.White;
        lblAppName.Font      = new Font("Segoe UI", 20F, FontStyle.Bold);
        lblAppName.Text      = "MyAgileBoard";
        lblAppName.TextAlign = ContentAlignment.MiddleCenter;

        // lblVersion
        lblVersion.AutoSize  = true;
        lblVersion.Font      = new Font("Segoe UI", 10F, FontStyle.Bold);
        lblVersion.Location  = new Point(20, 100);
        lblVersion.ForeColor = Color.DimGray;
        lblVersion.Text      = "버전 1.0.0";

        // lblDescription
        lblDescription.AutoSize  = false;
        lblDescription.Location  = new Point(20, 130);
        lblDescription.Size      = new Size(360, 50);
        lblDescription.Font      = new Font("Segoe UI", 9.5F);
        lblDescription.ForeColor = Color.DimGray;
        lblDescription.Text      =
            "칸반(Kanban) 기반의 프로젝트 관리 도구입니다.\n" +
            "카드 이동, 포인트 관리, Burn Down 차트 등을 지원합니다.";

        // lblAuthor
        lblAuthor.AutoSize  = true;
        lblAuthor.Location  = new Point(20, 195);
        lblAuthor.Font      = new Font("Segoe UI", 9F);
        lblAuthor.ForeColor = Color.DimGray;
        lblAuthor.Text      = "개발:  MyAgileBoard Team";

        // lblCopyright
        lblCopyright.AutoSize  = true;
        lblCopyright.Location  = new Point(20, 218);
        lblCopyright.Font      = new Font("Segoe UI", 9F);
        lblCopyright.ForeColor = Color.DimGray;
        lblCopyright.Text      = $"© {DateTime.Today.Year}  All rights reserved.";

        // btnOk
        btnOk.Location             = new Point(155, 260);
        btnOk.Size                 = new Size(90, 30);
        btnOk.Text                 = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click               += new EventHandler(btnOk_Click);

        // Form
        AcceptButton        = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode       = AutoScaleMode.Font;
        ClientSize          = new Size(400, 308);
        Controls.Add(panelTop);
        Controls.AddRange(new Control[]
        {
            lblVersion, lblDescription, lblAuthor, lblCopyright, btnOk
        });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        Name            = "AboutForm";
        StartPosition   = FormStartPosition.CenterParent;
        Text            = "프로그램 정보";

        panelTop.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private Panel  panelTop      = null!;
    private Label  lblAppName    = null!;
    private Label  lblVersion    = null!;
    private Label  lblDescription = null!;
    private Label  lblAuthor     = null!;
    private Label  lblCopyright  = null!;
    private Button btnOk         = null!;
}
