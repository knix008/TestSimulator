namespace EasyMDV10;

sealed class AboutDialog : Form
{
    public AboutDialog()
    {
        InitializeComponent();
        ApplyToAbout(this);
    }

    private void InitializeComponent()
    {
        var accentBar = new Panel
        {
            BackColor = Color.FromArgb(9, 105, 218),
            Dock = DockStyle.Top,
            Height = 4
        };

        var lblTitle = new Label
        {
            Text = "EasyMD",
            Font = new Font("Segoe UI", 22f, FontStyle.Bold),
            ForeColor = Color.FromArgb(31, 35, 40),
            AutoSize = true,
            Location = new Point(28, 28)
        };

        var lblVersion = new Label
        {
            Text = "버전 1.0.0",
            Font = new Font("Segoe UI", 10f),
            ForeColor = Color.FromArgb(101, 109, 118),
            AutoSize = true,
            Location = new Point(30, 72)
        };

        var lblDesc = new Label
        {
            Text = "마크다운 편집기 — 실시간 미리보기와 문서 구조 탐색을 지원합니다.",
            Font = new Font("Segoe UI", 9.75f),
            ForeColor = Color.FromArgb(71, 79, 88),
            MaximumSize = new Size(340, 0),
            AutoSize = true,
            Location = new Point(28, 98)
        };

        var card = new Panel
        {
            BackColor = Color.FromArgb(246, 248, 250),
            Location = new Point(28, 138),
            Size = new Size(332, 108),
            Padding = new Padding(16, 14, 16, 14)
        };

        var lblComponents = new Label
        {
            Text = "사용 라이브러리",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.FromArgb(31, 35, 40),
            AutoSize = true,
            Location = new Point(0, 0)
        };

        var lblLibs = new Label
        {
            Text = "Markdig — 마크다운 파싱\nMicrosoft WebView2 — HTML 미리보기\n.NET 8 Windows Forms",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(71, 79, 88),
            AutoSize = true,
            Location = new Point(0, 26)
        };

        card.Controls.Add(lblComponents);
        card.Controls.Add(lblLibs);

        var lblCopyright = new Label
        {
            Text = "Copyright © 2026 EasyMD",
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(140, 149, 159),
            AutoSize = true,
            Location = new Point(28, 262)
        };

        var btnOK = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Size = new Size(96, 34),
            Location = new Point(264, 288),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(9, 105, 218),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9.5f),
            Cursor = Cursors.Hand
        };
        btnOK.FlatAppearance.BorderSize = 0;
        btnOK.FlatAppearance.MouseOverBackColor = Color.FromArgb(7, 90, 184);
        AcceptButton = btnOK;

        SuspendLayout();
        Controls.AddRange(new Control[]
        {
            accentBar,
            lblTitle, lblVersion, lblDesc,
            card,
            lblCopyright,
            btnOK
        });

        AutoScaleDimensions = new SizeF(7f, 15f);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(388, 336);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "EasyMD 정보";
        ResumeLayout(false);
    }

    internal static void ApplyToAbout(AboutDialog dialog)
    {
        dialog.Font = UiTheme.UiFont;
        dialog.BackColor = UiTheme.Surface;
        dialog.ForeColor = UiTheme.TextPrimary;
    }
}
