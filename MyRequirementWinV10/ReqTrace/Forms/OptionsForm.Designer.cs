namespace ReqTrace.Forms;

partial class OptionsForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblLanguage;
    private FlowLayoutPanel languagePanel;
    private RadioButton radioKorean;
    private RadioButton radioEnglish;
    private Label lblImportFolder;
    private TextBox txtImportFolder;
    private Button btnBrowseImport;
    private Label lblExportFolder;
    private TextBox txtExportFolder;
    private Button btnBrowseExport;
    private Label lblProjectFolder;
    private TextBox txtProjectFolder;
    private Button btnBrowseProject;
    private FlowLayoutPanel buttonPanel;
    private Button btnOk;
    private Button btnCancel;

    private void InitializeComponent()
    {
        layoutTable = new TableLayoutPanel();
        lblLanguage = new Label();
        languagePanel = new FlowLayoutPanel();
        radioKorean = new RadioButton();
        radioEnglish = new RadioButton();
        lblImportFolder = new Label();
        txtImportFolder = new TextBox();
        btnBrowseImport = new Button();
        lblExportFolder = new Label();
        txtExportFolder = new TextBox();
        btnBrowseExport = new Button();
        lblProjectFolder = new Label();
        txtProjectFolder = new TextBox();
        btnBrowseProject = new Button();
        buttonPanel = new FlowLayoutPanel();
        btnCancel = new Button();
        btnOk = new Button();
        layoutTable.SuspendLayout();
        languagePanel.SuspendLayout();
        buttonPanel.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 3;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 165F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105F));
        layoutTable.Controls.Add(lblLanguage, 0, 0);
        layoutTable.Controls.Add(languagePanel, 1, 0);
        layoutTable.Controls.Add(lblImportFolder, 0, 1);
        layoutTable.Controls.Add(txtImportFolder, 1, 1);
        layoutTable.Controls.Add(btnBrowseImport, 2, 1);
        layoutTable.Controls.Add(lblExportFolder, 0, 2);
        layoutTable.Controls.Add(txtExportFolder, 1, 2);
        layoutTable.Controls.Add(btnBrowseExport, 2, 2);
        layoutTable.Controls.Add(lblProjectFolder, 0, 3);
        layoutTable.Controls.Add(txtProjectFolder, 1, 3);
        layoutTable.Controls.Add(btnBrowseProject, 2, 3);
        layoutTable.Controls.Add(buttonPanel, 1, 4);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(12, 12, 12, 8);
        layoutTable.RowCount = 5;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 52F));
        layoutTable.Size = new Size(584, 212);
        layoutTable.TabIndex = 0;
        // 
        // lblLanguage
        // 
        lblLanguage.Dock = DockStyle.Fill;
        lblLanguage.Location = new Point(12, 12);
        lblLanguage.Margin = new Padding(0, 0, 10, 0);
        lblLanguage.Name = "lblLanguage";
        lblLanguage.Size = new Size(155, 36);
        lblLanguage.TabIndex = 0;
        lblLanguage.Text = "Language:";
        lblLanguage.TextAlign = ContentAlignment.MiddleRight;
        // 
        // languagePanel
        // 
        layoutTable.SetColumnSpan(languagePanel, 2);
        languagePanel.Controls.Add(radioKorean);
        languagePanel.Controls.Add(radioEnglish);
        languagePanel.Dock = DockStyle.Fill;
        languagePanel.Location = new Point(177, 12);
        languagePanel.Margin = new Padding(0);
        languagePanel.Name = "languagePanel";
        languagePanel.Padding = new Padding(0, 6, 0, 0);
        languagePanel.Size = new Size(395, 36);
        languagePanel.TabIndex = 1;
        languagePanel.WrapContents = false;
        // 
        // radioKorean
        // 
        radioKorean.AutoSize = true;
        radioKorean.Location = new Point(0, 6);
        radioKorean.Margin = new Padding(0);
        radioKorean.Name = "radioKorean";
        radioKorean.Size = new Size(62, 19);
        radioKorean.TabIndex = 0;
        radioKorean.TabStop = true;
        radioKorean.Text = "Korean";
        radioKorean.UseVisualStyleBackColor = true;
        // 
        // radioEnglish
        // 
        radioEnglish.AutoSize = true;
        radioEnglish.Location = new Point(78, 6);
        radioEnglish.Margin = new Padding(16, 0, 0, 0);
        radioEnglish.Name = "radioEnglish";
        radioEnglish.Size = new Size(63, 19);
        radioEnglish.TabIndex = 1;
        radioEnglish.Text = "English";
        radioEnglish.UseVisualStyleBackColor = true;
        // 
        // lblImportFolder
        // 
        lblImportFolder.Dock = DockStyle.Fill;
        lblImportFolder.Location = new Point(12, 48);
        lblImportFolder.Margin = new Padding(0, 0, 10, 0);
        lblImportFolder.Name = "lblImportFolder";
        lblImportFolder.Size = new Size(155, 36);
        lblImportFolder.TabIndex = 2;
        lblImportFolder.Text = "Import folder:";
        lblImportFolder.TextAlign = ContentAlignment.MiddleRight;
        // 
        // txtImportFolder
        // 
        txtImportFolder.Dock = DockStyle.Fill;
        txtImportFolder.Location = new Point(177, 48);
        txtImportFolder.Margin = new Padding(0, 0, 8, 0);
        txtImportFolder.Name = "txtImportFolder";
        txtImportFolder.Size = new Size(282, 23);
        txtImportFolder.TabIndex = 3;
        // 
        // btnBrowseImport
        // 
        btnBrowseImport.Dock = DockStyle.Fill;
        btnBrowseImport.Location = new Point(467, 48);
        btnBrowseImport.Margin = new Padding(0);
        btnBrowseImport.Name = "btnBrowseImport";
        btnBrowseImport.Size = new Size(105, 36);
        btnBrowseImport.TabIndex = 4;
        btnBrowseImport.Text = "Browse...";
        btnBrowseImport.UseVisualStyleBackColor = true;
        btnBrowseImport.Click += btnBrowseImport_Click;
        // 
        // lblExportFolder
        // 
        lblExportFolder.Dock = DockStyle.Fill;
        lblExportFolder.Location = new Point(12, 84);
        lblExportFolder.Margin = new Padding(0, 0, 10, 0);
        lblExportFolder.Name = "lblExportFolder";
        lblExportFolder.Size = new Size(155, 36);
        lblExportFolder.TabIndex = 5;
        lblExportFolder.Text = "Export folder:";
        lblExportFolder.TextAlign = ContentAlignment.MiddleRight;
        // 
        // txtExportFolder
        // 
        txtExportFolder.Dock = DockStyle.Fill;
        txtExportFolder.Location = new Point(177, 84);
        txtExportFolder.Margin = new Padding(0, 0, 8, 0);
        txtExportFolder.Name = "txtExportFolder";
        txtExportFolder.Size = new Size(282, 23);
        txtExportFolder.TabIndex = 6;
        // 
        // btnBrowseExport
        // 
        btnBrowseExport.Dock = DockStyle.Fill;
        btnBrowseExport.Location = new Point(467, 84);
        btnBrowseExport.Margin = new Padding(0);
        btnBrowseExport.Name = "btnBrowseExport";
        btnBrowseExport.Size = new Size(105, 36);
        btnBrowseExport.TabIndex = 7;
        btnBrowseExport.Text = "Browse...";
        btnBrowseExport.UseVisualStyleBackColor = true;
        btnBrowseExport.Click += btnBrowseExport_Click;
        // 
        // lblProjectFolder
        // 
        lblProjectFolder.Dock = DockStyle.Fill;
        lblProjectFolder.Location = new Point(12, 120);
        lblProjectFolder.Margin = new Padding(0, 0, 10, 0);
        lblProjectFolder.Name = "lblProjectFolder";
        lblProjectFolder.Size = new Size(155, 36);
        lblProjectFolder.TabIndex = 8;
        lblProjectFolder.Text = "Project folder:";
        lblProjectFolder.TextAlign = ContentAlignment.MiddleRight;
        // 
        // txtProjectFolder
        // 
        txtProjectFolder.Dock = DockStyle.Fill;
        txtProjectFolder.Location = new Point(177, 120);
        txtProjectFolder.Margin = new Padding(0, 0, 8, 0);
        txtProjectFolder.Name = "txtProjectFolder";
        txtProjectFolder.Size = new Size(282, 23);
        txtProjectFolder.TabIndex = 9;
        // 
        // btnBrowseProject
        // 
        btnBrowseProject.Dock = DockStyle.Fill;
        btnBrowseProject.Location = new Point(467, 120);
        btnBrowseProject.Margin = new Padding(0);
        btnBrowseProject.Name = "btnBrowseProject";
        btnBrowseProject.Size = new Size(105, 36);
        btnBrowseProject.TabIndex = 10;
        btnBrowseProject.Text = "Browse...";
        btnBrowseProject.UseVisualStyleBackColor = true;
        btnBrowseProject.Click += btnBrowseProject_Click;
        // 
        // buttonPanel
        // 
        layoutTable.SetColumnSpan(buttonPanel, 2);
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Controls.Add(btnOk);
        buttonPanel.Dock = DockStyle.Fill;
        buttonPanel.FlowDirection = FlowDirection.RightToLeft;
        buttonPanel.Location = new Point(177, 156);
        buttonPanel.Margin = new Padding(0);
        buttonPanel.Name = "buttonPanel";
        buttonPanel.Padding = new Padding(0, 10, 0, 4);
        buttonPanel.Size = new Size(395, 52);
        buttonPanel.TabIndex = 11;
        buttonPanel.WrapContents = false;
        // 
        // btnCancel
        // 
        btnCancel.AutoSize = true;
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(320, 10);
        btnCancel.Margin = new Padding(0);
        btnCancel.MinimumSize = new Size(75, 28);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 28);
        btnCancel.TabIndex = 0;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // btnOk
        // 
        btnOk.AutoSize = true;
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(245, 10);
        btnOk.Margin = new Padding(8, 0, 0, 0);
        btnOk.MinimumSize = new Size(75, 28);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 1;
        btnOk.Text = "OK";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // OptionsForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(584, 212);
        Controls.Add(layoutTable);
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(520, 196);
        Name = "OptionsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Options";
        layoutTable.ResumeLayout(false);
        layoutTable.PerformLayout();
        languagePanel.ResumeLayout(false);
        languagePanel.PerformLayout();
        buttonPanel.ResumeLayout(false);
        buttonPanel.PerformLayout();
        ResumeLayout(false);
    }
}
