namespace EaxyMDV10;

sealed class AboutDialog : Form
{
    public AboutDialog()
    {
        InitializeComponent();
    }

    private void InitializeComponent()
    {
        var lblTitle = new Label
        {
            Text = "EaxyMD",
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 24)
        };

        var lblVersion = new Label
        {
            Text = "버전 1.0.0",
            Font = new Font("Segoe UI", 10f),
            ForeColor = Color.Gray,
            AutoSize = true,
            Location = new Point(26, 66)
        };

        var lblDesc = new Label
        {
            Text = "마크다운 편집기 — 실시간 미리보기를 지원합니다.",
            Font = new Font("Segoe UI", 9.5f),
            AutoSize = true,
            Location = new Point(24, 92)
        };

        var separator = new Label
        {
            BorderStyle = BorderStyle.Fixed3D,
            Size = new Size(340, 2),
            Location = new Point(24, 126)
        };

        var lblComponents = new Label
        {
            Text = "사용 라이브러리",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 138)
        };

        var lblLibs = new Label
        {
            Text = "• Markdig  — 마크다운 파싱\n• Microsoft WebView2  — HTML 미리보기\n• .NET 8 Windows Forms",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(60, 60, 60),
            AutoSize = true,
            Location = new Point(24, 158)
        };

        var separator2 = new Label
        {
            BorderStyle = BorderStyle.Fixed3D,
            Size = new Size(340, 2),
            Location = new Point(24, 214)
        };

        var lblCopyright = new Label
        {
            Text = "Copyright © 2026  EaxyMD",
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.Gray,
            AutoSize = true,
            Location = new Point(24, 224)
        };

        var btnOK = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Size = new Size(88, 30),
            Location = new Point(276, 256),
            FlatStyle = FlatStyle.System
        };
        AcceptButton = btnOK;

        SuspendLayout();
        Controls.AddRange(new Control[]
        {
            lblTitle, lblVersion, lblDesc,
            separator,
            lblComponents, lblLibs,
            separator2, lblCopyright,
            btnOK
        });

        AutoScaleDimensions = new SizeF(7f, 15f);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(388, 304);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "정보";
        ResumeLayout(false);
    }
}
