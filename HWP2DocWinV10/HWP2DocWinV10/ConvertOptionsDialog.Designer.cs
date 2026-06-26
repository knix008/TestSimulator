namespace HWP2DocWinV10;

partial class ConvertOptionsDialog
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
        components = new System.ComponentModel.Container();
        mainLayout = new TableLayoutPanel();
        lblTitle = new Label();
        rhwpPanel = new Panel();
        rhwpLayout = new TableLayoutPanel();
        chkUseRhwp = new CheckBox();
        lblRhwpDescription = new Label();
        lblRhwpHint = new Label();
        llmPanel = new Panel();
        llmLayout = new TableLayoutPanel();
        chkUseLlm = new CheckBox();
        lblLlmDescription = new Label();
        llmFooterLayout = new TableLayoutPanel();
        lblModelHint = new Label();
        btnLlmSettings = new Button();
        dividerPanel = new Panel();
        buttonPanel = new FlowLayoutPanel();
        btnOk = new Button();
        btnCancel = new Button();
        toolTip = new ToolTip(components);
        mainLayout.SuspendLayout();
        rhwpPanel.SuspendLayout();
        rhwpLayout.SuspendLayout();
        llmPanel.SuspendLayout();
        llmLayout.SuspendLayout();
        llmFooterLayout.SuspendLayout();
        buttonPanel.SuspendLayout();
        SuspendLayout();
        //
        // mainLayout
        //
        mainLayout.AutoSize = true;
        mainLayout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        mainLayout.ColumnCount = 1;
        mainLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        mainLayout.Controls.Add(lblTitle, 0, 0);
        mainLayout.Controls.Add(rhwpPanel, 0, 1);
        mainLayout.Controls.Add(llmPanel, 0, 2);
        mainLayout.Controls.Add(dividerPanel, 0, 3);
        mainLayout.Controls.Add(buttonPanel, 0, 4);
        mainLayout.Dock = DockStyle.Top;
        mainLayout.Location = new Point(0, 0);
        mainLayout.Name = "mainLayout";
        mainLayout.Padding = new Padding(20, 18, 20, 20);
        mainLayout.RowCount = 5;
        mainLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        mainLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        mainLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 1F));
        mainLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        mainLayout.Size = new Size(440, 340);
        mainLayout.TabIndex = 0;
        //
        // lblTitle
        //
        lblTitle.AutoSize = true;
        lblTitle.Dock = DockStyle.Fill;
        lblTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        lblTitle.ForeColor = Color.FromArgb(31, 35, 40);
        lblTitle.Margin = new Padding(0, 0, 0, 14);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(400, 25);
        lblTitle.TabIndex = 0;
        lblTitle.Text = "변환 옵션";
        //
        // rhwpPanel
        //
        rhwpPanel.AutoSize = true;
        rhwpPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        rhwpPanel.BackColor = Color.FromArgb(248, 250, 252);
        rhwpPanel.Controls.Add(rhwpLayout);
        rhwpPanel.Dock = DockStyle.Fill;
        rhwpPanel.Margin = new Padding(0, 0, 0, 10);
        rhwpPanel.Name = "rhwpPanel";
        rhwpPanel.Padding = new Padding(12, 10, 12, 10);
        rhwpPanel.Size = new Size(400, 88);
        rhwpPanel.TabIndex = 1;
        //
        // rhwpLayout
        //
        rhwpLayout.AutoSize = true;
        rhwpLayout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        rhwpLayout.ColumnCount = 1;
        rhwpLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        rhwpLayout.Controls.Add(chkUseRhwp, 0, 0);
        rhwpLayout.Controls.Add(lblRhwpDescription, 0, 1);
        rhwpLayout.Controls.Add(lblRhwpHint, 0, 2);
        rhwpLayout.Dock = DockStyle.Top;
        rhwpLayout.Location = new Point(12, 10);
        rhwpLayout.Name = "rhwpLayout";
        rhwpLayout.RowCount = 3;
        rhwpLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        rhwpLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        rhwpLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        rhwpLayout.Size = new Size(376, 68);
        rhwpLayout.TabIndex = 0;
        //
        // chkUseRhwp
        //
        chkUseRhwp.AutoSize = true;
        chkUseRhwp.Dock = DockStyle.Fill;
        chkUseRhwp.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        chkUseRhwp.Margin = new Padding(0, 0, 0, 4);
        chkUseRhwp.Name = "chkUseRhwp";
        chkUseRhwp.Size = new Size(376, 19);
        chkUseRhwp.TabIndex = 0;
        chkUseRhwp.Text = "rhwp로 표·그림 변환";
        chkUseRhwp.UseVisualStyleBackColor = true;
        //
        // lblRhwpDescription
        //
        lblRhwpDescription.AutoSize = true;
        lblRhwpDescription.Dock = DockStyle.Fill;
        lblRhwpDescription.Font = new Font("Segoe UI", 8.75F);
        lblRhwpDescription.ForeColor = Color.FromArgb(100, 116, 139);
        lblRhwpDescription.Margin = new Padding(20, 0, 0, 4);
        lblRhwpDescription.Name = "lblRhwpDescription";
        lblRhwpDescription.Size = new Size(356, 15);
        lblRhwpDescription.TabIndex = 1;
        lblRhwpDescription.Text = "표·그림·본문을 rhwp로 변환합니다. 끄면 unhwp만 사용합니다.";
        //
        // lblRhwpHint
        //
        lblRhwpHint.AutoSize = true;
        lblRhwpHint.Dock = DockStyle.Fill;
        lblRhwpHint.Font = new Font("Segoe UI", 8.25F);
        lblRhwpHint.ForeColor = Color.FromArgb(100, 116, 139);
        lblRhwpHint.Margin = new Padding(20, 0, 0, 0);
        lblRhwpHint.Name = "lblRhwpHint";
        lblRhwpHint.Size = new Size(356, 15);
        lblRhwpHint.TabIndex = 2;
        //
        // llmPanel
        //
        llmPanel.AutoSize = true;
        llmPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        llmPanel.BackColor = Color.FromArgb(248, 250, 252);
        llmPanel.Controls.Add(llmLayout);
        llmPanel.Dock = DockStyle.Fill;
        llmPanel.Margin = new Padding(0, 0, 0, 14);
        llmPanel.Name = "llmPanel";
        llmPanel.Padding = new Padding(12, 10, 12, 10);
        llmPanel.Size = new Size(400, 108);
        llmPanel.TabIndex = 2;
        //
        // llmLayout
        //
        llmLayout.AutoSize = true;
        llmLayout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        llmLayout.ColumnCount = 1;
        llmLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        llmLayout.Controls.Add(chkUseLlm, 0, 0);
        llmLayout.Controls.Add(lblLlmDescription, 0, 1);
        llmLayout.Controls.Add(llmFooterLayout, 0, 2);
        llmLayout.Dock = DockStyle.Top;
        llmLayout.Location = new Point(12, 10);
        llmLayout.Name = "llmLayout";
        llmLayout.RowCount = 3;
        llmLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        llmLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        llmLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        llmLayout.Size = new Size(376, 88);
        llmLayout.TabIndex = 0;
        //
        // chkUseLlm
        //
        chkUseLlm.AutoSize = true;
        chkUseLlm.Dock = DockStyle.Fill;
        chkUseLlm.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        chkUseLlm.Margin = new Padding(0, 0, 0, 4);
        chkUseLlm.Name = "chkUseLlm";
        chkUseLlm.Size = new Size(376, 19);
        chkUseLlm.TabIndex = 0;
        chkUseLlm.Text = "LLM으로 Markdown 정리";
        chkUseLlm.UseVisualStyleBackColor = true;
        //
        // lblLlmDescription
        //
        lblLlmDescription.AutoSize = true;
        lblLlmDescription.Dock = DockStyle.Fill;
        lblLlmDescription.Font = new Font("Segoe UI", 8.75F);
        lblLlmDescription.ForeColor = Color.FromArgb(100, 116, 139);
        lblLlmDescription.Margin = new Padding(20, 0, 0, 8);
        lblLlmDescription.Name = "lblLlmDescription";
        lblLlmDescription.Size = new Size(356, 15);
        lblLlmDescription.TabIndex = 1;
        lblLlmDescription.Text = "내용은 유지하고 제목·표·목록 등 Markdown 서식만 다듬습니다.";
        //
        // llmFooterLayout
        //
        llmFooterLayout.AutoSize = true;
        llmFooterLayout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        llmFooterLayout.ColumnCount = 2;
        llmFooterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        llmFooterLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        llmFooterLayout.Controls.Add(lblModelHint, 0, 0);
        llmFooterLayout.Controls.Add(btnLlmSettings, 1, 0);
        llmFooterLayout.Dock = DockStyle.Fill;
        llmFooterLayout.Location = new Point(0, 46);
        llmFooterLayout.Margin = new Padding(0);
        llmFooterLayout.Name = "llmFooterLayout";
        llmFooterLayout.RowCount = 1;
        llmFooterLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        llmFooterLayout.Size = new Size(376, 27);
        llmFooterLayout.TabIndex = 2;
        //
        // lblModelHint
        //
        lblModelHint.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        lblModelHint.AutoEllipsis = true;
        lblModelHint.AutoSize = true;
        lblModelHint.Font = new Font("Segoe UI", 8.25F);
        lblModelHint.ForeColor = Color.FromArgb(100, 116, 139);
        lblModelHint.Margin = new Padding(20, 4, 8, 0);
        lblModelHint.Name = "lblModelHint";
        lblModelHint.Size = new Size(262, 15);
        lblModelHint.TabIndex = 0;
        lblModelHint.TextAlign = ContentAlignment.MiddleLeft;
        //
        // btnLlmSettings
        //
        btnLlmSettings.AutoSize = true;
        btnLlmSettings.Font = new Font("Segoe UI", 8.5F);
        btnLlmSettings.Margin = new Padding(0, 0, 0, 0);
        btnLlmSettings.Name = "btnLlmSettings";
        btnLlmSettings.Size = new Size(86, 27);
        btnLlmSettings.TabIndex = 1;
        btnLlmSettings.Text = "LLM 설정...";
        btnLlmSettings.UseVisualStyleBackColor = true;
        btnLlmSettings.Click += btnLlmSettings_Click;
        //
        // dividerPanel
        //
        dividerPanel.BackColor = Color.FromArgb(226, 232, 240);
        dividerPanel.Dock = DockStyle.Fill;
        dividerPanel.Margin = new Padding(0, 0, 0, 14);
        dividerPanel.Name = "dividerPanel";
        dividerPanel.Size = new Size(400, 1);
        dividerPanel.TabIndex = 3;
        //
        // buttonPanel
        //
        buttonPanel.AutoSize = true;
        buttonPanel.Controls.Add(btnOk);
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Dock = DockStyle.Fill;
        buttonPanel.FlowDirection = FlowDirection.RightToLeft;
        buttonPanel.Location = new Point(23, 293);
        buttonPanel.Margin = new Padding(0);
        buttonPanel.Name = "buttonPanel";
        buttonPanel.Padding = new Padding(0, 2, 0, 0);
        buttonPanel.Size = new Size(397, 36);
        buttonPanel.TabIndex = 4;
        buttonPanel.WrapContents = false;
        //
        // btnOk
        //
        btnOk.BackColor = Color.FromArgb(37, 99, 235);
        btnOk.FlatAppearance.BorderSize = 0;
        btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.Font = new Font("Segoe UI", 9.5F);
        btnOk.ForeColor = Color.White;
        btnOk.Margin = new Padding(8, 0, 0, 0);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(90, 34);
        btnOk.TabIndex = 1;
        btnOk.Text = "변환";
        btnOk.UseVisualStyleBackColor = false;
        btnOk.Click += btnOk_Click;
        //
        // btnCancel
        //
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Font = new Font("Segoe UI", 9.5F);
        btnCancel.Margin = new Padding(0);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(84, 34);
        btnCancel.TabIndex = 0;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        //
        // toolTip
        //
        toolTip.AutoPopDelay = 8000;
        toolTip.InitialDelay = 400;
        toolTip.ReshowDelay = 200;
        toolTip.ShowAlways = true;
        //
        // ConvertOptionsDialog
        //
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.White;
        CancelButton = btnCancel;
        ClientSize = new Size(480, 360);
        Controls.Add(mainLayout);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MaximumSize = new Size(480, 0);
        MinimizeBox = false;
        MinimumSize = new Size(480, 320);
        Name = "ConvertOptionsDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "변환 옵션";
        mainLayout.ResumeLayout(false);
        mainLayout.PerformLayout();
        rhwpPanel.ResumeLayout(false);
        rhwpLayout.ResumeLayout(false);
        rhwpLayout.PerformLayout();
        llmPanel.ResumeLayout(false);
        llmLayout.ResumeLayout(false);
        llmLayout.PerformLayout();
        llmFooterLayout.ResumeLayout(false);
        llmFooterLayout.PerformLayout();
        buttonPanel.ResumeLayout(false);
        buttonPanel.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private TableLayoutPanel mainLayout;
    private Label lblTitle;
    private Panel rhwpPanel;
    private TableLayoutPanel rhwpLayout;
    private CheckBox chkUseRhwp;
    private Label lblRhwpDescription;
    private Label lblRhwpHint;
    private Panel llmPanel;
    private TableLayoutPanel llmLayout;
    private CheckBox chkUseLlm;
    private Label lblLlmDescription;
    private TableLayoutPanel llmFooterLayout;
    private Label lblModelHint;
    private Button btnLlmSettings;
    private Panel dividerPanel;
    private FlowLayoutPanel buttonPanel;
    private Button btnOk;
    private Button btnCancel;
    private ToolTip toolTip;
}
