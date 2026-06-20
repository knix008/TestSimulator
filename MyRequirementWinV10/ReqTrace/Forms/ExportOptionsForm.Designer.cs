namespace ReqTrace.Forms;

partial class ExportOptionsForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private Label lblFormats;
    private CheckBox chkExcel;
    private CheckBox chkWord;
    private CheckBox chkMarkdown;
    private CheckBox chkPdf;
    private Label lblScope;
    private RadioButton radioAll;
    private RadioButton radioWithTests;
    private CheckBox chkIncludeHistory;
    private Label lblOutputFolder;
    private TextBox txtFolder;
    private Button btnBrowse;
    private Button btnExport;
    private Button btnCancel;

    private void InitializeComponent()
    {
        lblFormats = new Label();
        chkExcel = new CheckBox();
        chkWord = new CheckBox();
        chkMarkdown = new CheckBox();
        chkPdf = new CheckBox();
        lblScope = new Label();
        radioAll = new RadioButton();
        radioWithTests = new RadioButton();
        chkIncludeHistory = new CheckBox();
        lblOutputFolder = new Label();
        txtFolder = new TextBox();
        btnBrowse = new Button();
        btnExport = new Button();
        btnCancel = new Button();
        SuspendLayout();
        // 
        // lblFormats
        // 
        lblFormats.AutoSize = true;
        lblFormats.Location = new Point(20, 0);
        lblFormats.Name = "lblFormats";
        lblFormats.Size = new Size(53, 15);
        lblFormats.TabIndex = 0;
        lblFormats.Text = "Formats:";
        // 
        // chkExcel
        // 
        chkExcel.AutoSize = true;
        chkExcel.Checked = true;
        chkExcel.CheckState = CheckState.Checked;
        chkExcel.Location = new Point(20, 15);
        chkExcel.Name = "chkExcel";
        chkExcel.Size = new Size(96, 19);
        chkExcel.TabIndex = 1;
        chkExcel.Text = "Excel (.xlsx)";
        chkExcel.UseVisualStyleBackColor = true;
        // 
        // chkWord
        // 
        chkWord.AutoSize = true;
        chkWord.Checked = true;
        chkWord.CheckState = CheckState.Checked;
        chkWord.Location = new Point(20, 40);
        chkWord.Name = "chkWord";
        chkWord.Size = new Size(98, 19);
        chkWord.TabIndex = 2;
        chkWord.Text = "Word (.docx)";
        chkWord.UseVisualStyleBackColor = true;
        // 
        // chkMarkdown
        // 
        chkMarkdown.AutoSize = true;
        chkMarkdown.Checked = true;
        chkMarkdown.CheckState = CheckState.Checked;
        chkMarkdown.Location = new Point(20, 65);
        chkMarkdown.Name = "chkMarkdown";
        chkMarkdown.Size = new Size(114, 19);
        chkMarkdown.TabIndex = 3;
        chkMarkdown.Text = "Markdown (.md)";
        chkMarkdown.UseVisualStyleBackColor = true;
        // 
        // chkPdf
        // 
        chkPdf.AutoSize = true;
        chkPdf.Checked = true;
        chkPdf.CheckState = CheckState.Checked;
        chkPdf.Location = new Point(20, 90);
        chkPdf.Name = "chkPdf";
        chkPdf.Size = new Size(78, 19);
        chkPdf.TabIndex = 4;
        chkPdf.Text = "PDF (.pdf)";
        chkPdf.UseVisualStyleBackColor = true;
        // 
        // lblScope
        // 
        lblScope.AutoSize = true;
        lblScope.Location = new Point(20, 120);
        lblScope.Name = "lblScope";
        lblScope.Size = new Size(45, 15);
        lblScope.TabIndex = 5;
        lblScope.Text = "Scope:";
        // 
        // radioAll
        // 
        radioAll.AutoSize = true;
        radioAll.Checked = true;
        radioAll.Location = new Point(20, 140);
        radioAll.Name = "radioAll";
        radioAll.Size = new Size(118, 19);
        radioAll.TabIndex = 6;
        radioAll.TabStop = true;
        radioAll.Text = "All Requirements";
        radioAll.UseVisualStyleBackColor = true;
        // 
        // radioWithTests
        // 
        radioWithTests.AutoSize = true;
        radioWithTests.Location = new Point(20, 165);
        radioWithTests.Name = "radioWithTests";
        radioWithTests.Size = new Size(218, 19);
        radioWithTests.TabIndex = 7;
        radioWithTests.Text = "Only Requirements With Test Cases";
        radioWithTests.UseVisualStyleBackColor = true;
        // 
        // chkIncludeHistory
        // 
        chkIncludeHistory.AutoSize = true;
        chkIncludeHistory.Location = new Point(20, 200);
        chkIncludeHistory.Name = "chkIncludeHistory";
        chkIncludeHistory.Size = new Size(151, 19);
        chkIncludeHistory.TabIndex = 8;
        chkIncludeHistory.Text = "Include full run history";
        chkIncludeHistory.UseVisualStyleBackColor = true;
        // 
        // lblOutputFolder
        // 
        lblOutputFolder.AutoSize = true;
        lblOutputFolder.Location = new Point(20, 232);
        lblOutputFolder.Name = "lblOutputFolder";
        lblOutputFolder.Size = new Size(83, 15);
        lblOutputFolder.TabIndex = 9;
        lblOutputFolder.Text = "Output folder:";
        // 
        // txtFolder
        // 
        txtFolder.Location = new Point(20, 250);
        txtFolder.Name = "txtFolder";
        txtFolder.Size = new Size(380, 23);
        txtFolder.TabIndex = 10;
        // 
        // btnBrowse
        // 
        btnBrowse.Location = new Point(330, 248);
        btnBrowse.Name = "btnBrowse";
        btnBrowse.Size = new Size(80, 25);
        btnBrowse.TabIndex = 11;
        btnBrowse.Text = "Browse...";
        btnBrowse.UseVisualStyleBackColor = true;
        btnBrowse.Click += btnBrowse_Click;
        // 
        // btnExport
        // 
        btnExport.DialogResult = DialogResult.OK;
        btnExport.Location = new Point(255, 290);
        btnExport.Name = "btnExport";
        btnExport.Size = new Size(75, 25);
        btnExport.TabIndex = 12;
        btnExport.Text = "Export";
        btnExport.UseVisualStyleBackColor = true;
        btnExport.Click += btnExport_Click;
        // 
        // btnCancel
        // 
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(340, 290);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 13;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // ExportOptionsForm
        // 
        AcceptButton = btnExport;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(440, 330);
        Controls.Add(btnCancel);
        Controls.Add(btnExport);
        Controls.Add(btnBrowse);
        Controls.Add(txtFolder);
        Controls.Add(lblOutputFolder);
        Controls.Add(chkIncludeHistory);
        Controls.Add(radioWithTests);
        Controls.Add(radioAll);
        Controls.Add(lblScope);
        Controls.Add(chkPdf);
        Controls.Add(chkMarkdown);
        Controls.Add(chkWord);
        Controls.Add(chkExcel);
        Controls.Add(lblFormats);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ExportOptionsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Export Traceability Report";
        ResumeLayout(false);
        PerformLayout();
    }
}
