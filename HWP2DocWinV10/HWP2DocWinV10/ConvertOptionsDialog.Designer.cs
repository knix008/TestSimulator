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
        enginePanel = new Panel();
        engineLayout = new TableLayoutPanel();
        lblEngineCaption = new Label();
        flpEngines = new FlowLayoutPanel();
        lblEngineHint = new Label();
        llmPanel = new Panel();
        llmLayout = new TableLayoutPanel();
        chkUseLlm = new CheckBox();
        lblLlmDescription = new Label();
        chkLlmFastMode = new CheckBox();
        llmFooterLayout = new TableLayoutPanel();
        lblModelHint = new Label();
        btnLlmSettings = new Button();
        dividerPanel = new Panel();
        buttonPanel = new FlowLayoutPanel();
        btnOk = new Button();
        btnCancel = new Button();
        toolTip = new ToolTip(components);
        mainLayout.SuspendLayout();
        enginePanel.SuspendLayout();
        engineLayout.SuspendLayout();
        llmPanel.SuspendLayout();
        llmLayout.SuspendLayout();
        llmFooterLayout.SuspendLayout();
        buttonPanel.SuspendLayout();
        SuspendLayout();
        //
        // mainLayout
        //
        mainLayout.ColumnCount = 1;
        mainLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        mainLayout.Controls.Add(lblTitle, 0, 0);
        mainLayout.Controls.Add(enginePanel, 0, 1);
        mainLayout.Controls.Add(llmPanel, 0, 2);
        mainLayout.Controls.Add(dividerPanel, 0, 3);
        mainLayout.Controls.Add(buttonPanel, 0, 4);
        mainLayout.Dock = DockStyle.Fill;
        mainLayout.Location = new Point(0, 0);
        mainLayout.Name = "mainLayout";
        mainLayout.Padding = new Padding(20, 18, 20, 16);
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
        // enginePanel
        //
        enginePanel.AutoSize = true;
        enginePanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        enginePanel.BackColor = Color.FromArgb(248, 250, 252);
        enginePanel.Controls.Add(engineLayout);
        enginePanel.Dock = DockStyle.Top;
        enginePanel.Margin = new Padding(0, 0, 0, 10);
        enginePanel.Name = "enginePanel";
        enginePanel.Padding = new Padding(12, 10, 12, 10);
        enginePanel.Size = new Size(400, 120);
        enginePanel.TabIndex = 1;
        //
        // engineLayout
        //
        engineLayout.AutoSize = true;
        engineLayout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        engineLayout.ColumnCount = 1;
        engineLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        engineLayout.Controls.Add(lblEngineCaption, 0, 0);
        engineLayout.Controls.Add(flpEngines, 0, 1);
        engineLayout.Controls.Add(lblEngineHint, 0, 2);
        engineLayout.Dock = DockStyle.Top;
        engineLayout.Location = new Point(12, 10);
        engineLayout.Name = "engineLayout";
        engineLayout.RowCount = 3;
        engineLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        engineLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        engineLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        engineLayout.Size = new Size(376, 100);
        engineLayout.TabIndex = 0;
        //
        // lblEngineCaption
        //
        lblEngineCaption.AutoSize = true;
        lblEngineCaption.Dock = DockStyle.Fill;
        lblEngineCaption.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblEngineCaption.ForeColor = Color.FromArgb(31, 35, 40);
        lblEngineCaption.Margin = new Padding(0, 0, 0, 6);
        lblEngineCaption.Name = "lblEngineCaption";
        lblEngineCaption.Size = new Size(376, 19);
        lblEngineCaption.TabIndex = 0;
        lblEngineCaption.Text = "변환 엔진";
        //
        // flpEngines
        //
        flpEngines.AutoSize = true;
        flpEngines.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flpEngines.Dock = DockStyle.Top;
        flpEngines.FlowDirection = FlowDirection.TopDown;
        flpEngines.Location = new Point(0, 25);
        flpEngines.Margin = new Padding(0, 0, 0, 6);
        flpEngines.Name = "flpEngines";
        flpEngines.Size = new Size(376, 60);
        flpEngines.TabIndex = 1;
        flpEngines.WrapContents = false;
        //
        // lblEngineHint
        //
        lblEngineHint.AutoSize = true;
        lblEngineHint.Dock = DockStyle.Top;
        lblEngineHint.Font = new Font("Segoe UI", 8.25F);
        lblEngineHint.ForeColor = Color.FromArgb(100, 116, 139);
        lblEngineHint.Margin = new Padding(0, 0, 0, 0);
        lblEngineHint.Name = "lblEngineHint";
        lblEngineHint.Size = new Size(376, 15);
        lblEngineHint.TabIndex = 2;
        //
        // llmPanel
        //
        llmPanel.AutoSize = true;
        llmPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        llmPanel.BackColor = Color.FromArgb(248, 250, 252);
        llmPanel.Controls.Add(llmLayout);
        llmPanel.Dock = DockStyle.Top;
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
        llmLayout.Controls.Add(chkLlmFastMode, 0, 2);
        llmLayout.Controls.Add(llmFooterLayout, 0, 3);
        llmLayout.Dock = DockStyle.Top;
        llmLayout.Location = new Point(12, 10);
        llmLayout.Name = "llmLayout";
        llmLayout.RowCount = 4;
        llmLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
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
        chkUseLlm.Text = "LLM으로 구조화";
        chkUseLlm.UseVisualStyleBackColor = true;
        //
        // lblLlmDescription
        //
        lblLlmDescription.AutoSize = true;
        lblLlmDescription.Dock = DockStyle.Top;
        lblLlmDescription.Font = new Font("Segoe UI", 8.75F);
        lblLlmDescription.ForeColor = Color.FromArgb(100, 116, 139);
        lblLlmDescription.Margin = new Padding(20, 0, 0, 8);
        lblLlmDescription.MaximumSize = new Size(340, 0);
        lblLlmDescription.Name = "lblLlmDescription";
        lblLlmDescription.Size = new Size(356, 15);
        lblLlmDescription.TabIndex = 1;
        lblLlmDescription.Text = "LLM 설정에서 선택한 대상(표·제목·목록·HTML)만 Ollama로 정리합니다. 나머지는 규칙 기반 전처리로 처리합니다.";
        //
        // chkLlmFastMode
        //
        chkLlmFastMode.AutoSize = true;
        chkLlmFastMode.Checked = true;
        chkLlmFastMode.Dock = DockStyle.Fill;
        chkLlmFastMode.Font = new Font("Segoe UI", 8.75F);
        chkLlmFastMode.Margin = new Padding(20, 0, 0, 8);
        chkLlmFastMode.Name = "chkLlmFastMode";
        chkLlmFastMode.Size = new Size(356, 19);
        chkLlmFastMode.TabIndex = 2;
        chkLlmFastMode.Text = "빠른 LLM (호출 적게, 기본 권장)";
        chkLlmFastMode.UseVisualStyleBackColor = true;
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
        llmFooterLayout.Dock = DockStyle.Top;
        llmFooterLayout.Location = new Point(0, 68);
        llmFooterLayout.Margin = new Padding(0, 4, 0, 0);
        llmFooterLayout.Name = "llmFooterLayout";
        llmFooterLayout.RowCount = 1;
        llmFooterLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        llmFooterLayout.Size = new Size(376, 31);
        llmFooterLayout.TabIndex = 2;
        //
        // lblModelHint
        //
        lblModelHint.Anchor = AnchorStyles.Left | AnchorStyles.Top;
        lblModelHint.AutoEllipsis = true;
        lblModelHint.AutoSize = false;
        lblModelHint.Font = new Font("Segoe UI", 8.25F);
        lblModelHint.ForeColor = Color.FromArgb(100, 116, 139);
        lblModelHint.Margin = new Padding(20, 6, 8, 0);
        lblModelHint.Name = "lblModelHint";
        lblModelHint.Size = new Size(262, 23);
        lblModelHint.TabIndex = 0;
        lblModelHint.TextAlign = ContentAlignment.MiddleLeft;
        //
        // btnLlmSettings
        //
        btnLlmSettings.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnLlmSettings.AutoSize = true;
        btnLlmSettings.Font = new Font("Segoe UI", 8.5F);
        btnLlmSettings.Margin = new Padding(0, 2, 0, 0);
        btnLlmSettings.MinimumSize = new Size(86, 27);
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
        dividerPanel.Margin = new Padding(0, 0, 0, 12);
        dividerPanel.Name = "dividerPanel";
        dividerPanel.Size = new Size(400, 1);
        dividerPanel.TabIndex = 3;
        //
        // buttonPanel
        //
        buttonPanel.Controls.Add(btnOk);
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Dock = DockStyle.Top;
        buttonPanel.FlowDirection = FlowDirection.RightToLeft;
        buttonPanel.Location = new Point(23, 297);
        buttonPanel.Margin = new Padding(0, 8, 0, 0);
        buttonPanel.Name = "buttonPanel";
        buttonPanel.Padding = new Padding(0);
        buttonPanel.Size = new Size(454, 34);
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
        BackColor = Color.White;
        CancelButton = btnCancel;
        ClientSize = new Size(500, 400);
        Controls.Add(mainLayout);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(500, 400);
        Name = "ConvertOptionsDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "변환 옵션";
        mainLayout.ResumeLayout(false);
        mainLayout.PerformLayout();
        enginePanel.ResumeLayout(false);
        engineLayout.ResumeLayout(false);
        engineLayout.PerformLayout();
        llmPanel.ResumeLayout(false);
        llmLayout.ResumeLayout(false);
        llmLayout.PerformLayout();
        llmFooterLayout.ResumeLayout(false);
        llmFooterLayout.PerformLayout();
        buttonPanel.ResumeLayout(false);
        buttonPanel.PerformLayout();
        ResumeLayout(false);
    }

    private TableLayoutPanel mainLayout;
    private Label lblTitle;
    private Panel enginePanel;
    private TableLayoutPanel engineLayout;
    private Label lblEngineCaption;
    private FlowLayoutPanel flpEngines;
    private Label lblEngineHint;
    private Panel llmPanel;
    private TableLayoutPanel llmLayout;
    private CheckBox chkUseLlm;
    private Label lblLlmDescription;
    private CheckBox chkLlmFastMode;
    private TableLayoutPanel llmFooterLayout;
    private Label lblModelHint;
    private Button btnLlmSettings;
    private Panel dividerPanel;
    private FlowLayoutPanel buttonPanel;
    private Button btnOk;
    private Button btnCancel;
    private ToolTip toolTip;
}
