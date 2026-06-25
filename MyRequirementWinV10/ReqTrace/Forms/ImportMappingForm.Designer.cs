namespace ReqTrace.Forms;

partial class ImportMappingForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private Label lblSheet;
    private ComboBox cboSheet;
    private Label lblHeaderRow;
    private NumericUpDown numHeaderRow;
    private Label lblPreview;
    private DataGridView previewGrid;
    private Label lblColumnMapping;
    private Label lblCode;
    private ComboBox cboCode;
    private Label lblTitle;
    private ComboBox cboTitle;
    private Label lblDescription;
    private ComboBox cboDescription;
    private Label lblCategory;
    private ComboBox cboCategory;
    private Label lblPriority;
    private ComboBox cboPriority;
    private Label lblStatus;
    private ComboBox cboStatus;
    private Label lblSource;
    private ComboBox cboSource;
    private Label lblParentCode;
    private ComboBox cboParentCode;
    private CheckBox chkGenerateIds;
    private CheckBox chkGenerateTestCases;
    private Button btnImport;
    private Button btnCancel;

    private void InitializeComponent()
    {
        lblSheet = new Label();
        cboSheet = new ComboBox();
        lblHeaderRow = new Label();
        numHeaderRow = new NumericUpDown();
        lblPreview = new Label();
        previewGrid = new DataGridView();
        lblColumnMapping = new Label();
        lblCode = new Label();
        cboCode = new ComboBox();
        lblTitle = new Label();
        cboTitle = new ComboBox();
        lblDescription = new Label();
        cboDescription = new ComboBox();
        lblCategory = new Label();
        cboCategory = new ComboBox();
        lblPriority = new Label();
        cboPriority = new ComboBox();
        lblStatus = new Label();
        cboStatus = new ComboBox();
        lblSource = new Label();
        cboSource = new ComboBox();
        lblParentCode = new Label();
        cboParentCode = new ComboBox();
        chkGenerateIds = new CheckBox();
        chkGenerateTestCases = new CheckBox();
        btnImport = new Button();
        btnCancel = new Button();
        ((System.ComponentModel.ISupportInitialize)numHeaderRow).BeginInit();
        ((System.ComponentModel.ISupportInitialize)previewGrid).BeginInit();
        SuspendLayout();
        // 
        // lblSheet
        // 
        lblSheet.AutoSize = true;
        lblSheet.Location = new Point(20, 15);
        lblSheet.Name = "lblSheet";
        lblSheet.Size = new Size(40, 15);
        lblSheet.TabIndex = 0;
        lblSheet.Text = "Sheet:";
        // 
        // cboSheet
        // 
        cboSheet.DropDownStyle = ComboBoxStyle.DropDownList;
        cboSheet.Location = new Point(100, 12);
        cboSheet.Name = "cboSheet";
        cboSheet.Size = new Size(200, 23);
        cboSheet.TabIndex = 1;
        cboSheet.SelectedIndexChanged += cboSheet_SelectedIndexChanged;
        // 
        // lblHeaderRow
        // 
        lblHeaderRow.AutoSize = true;
        lblHeaderRow.Location = new Point(300, 15);
        lblHeaderRow.Name = "lblHeaderRow";
        lblHeaderRow.Size = new Size(72, 15);
        lblHeaderRow.TabIndex = 2;
        lblHeaderRow.Text = "Header row:";
        // 
        // numHeaderRow
        // 
        numHeaderRow.Location = new Point(381, 12);
        numHeaderRow.Maximum = new decimal(new int[] { 1000, 0, 0, 0 });
        numHeaderRow.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numHeaderRow.Name = "numHeaderRow";
        numHeaderRow.Size = new Size(60, 23);
        numHeaderRow.TabIndex = 3;
        numHeaderRow.Value = new decimal(new int[] { 1, 0, 0, 0 });
        numHeaderRow.ValueChanged += numHeaderRow_ValueChanged;
        // 
        // lblPreview
        // 
        lblPreview.AutoSize = true;
        lblPreview.Location = new Point(20, 44);
        lblPreview.Name = "lblPreview";
        lblPreview.Size = new Size(51, 15);
        lblPreview.TabIndex = 4;
        lblPreview.Text = "Preview:";
        // 
        // previewGrid
        // 
        previewGrid.AllowUserToAddRows = false;
        previewGrid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        previewGrid.Location = new Point(20, 62);
        previewGrid.Name = "previewGrid";
        previewGrid.ReadOnly = true;
        previewGrid.RowHeadersVisible = false;
        previewGrid.ScrollBars = ScrollBars.Both;
        previewGrid.Size = new Size(700, 256);
        previewGrid.TabIndex = 5;
        // 
        // lblColumnMapping
        // 
        lblColumnMapping.AutoSize = true;
        lblColumnMapping.Location = new Point(20, 328);
        lblColumnMapping.Name = "lblColumnMapping";
        lblColumnMapping.Size = new Size(105, 15);
        lblColumnMapping.TabIndex = 6;
        lblColumnMapping.Text = "Column Mapping:";
        // 
        // lblCode
        // 
        lblCode.AutoSize = true;
        lblCode.Location = new Point(20, 352);
        lblCode.Name = "lblCode";
        lblCode.Size = new Size(38, 15);
        lblCode.TabIndex = 7;
        lblCode.Text = "Code:";
        // 
        // cboCode
        // 
        cboCode.DropDownStyle = ComboBoxStyle.DropDownList;
        cboCode.Location = new Point(140, 348);
        cboCode.Name = "cboCode";
        cboCode.Size = new Size(250, 23);
        cboCode.TabIndex = 8;
        // 
        // lblTitle
        // 
        lblTitle.AutoSize = true;
        lblTitle.Location = new Point(20, 380);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(32, 15);
        lblTitle.TabIndex = 9;
        lblTitle.Text = "Title:";
        // 
        // cboTitle
        // 
        cboTitle.DropDownStyle = ComboBoxStyle.DropDownList;
        cboTitle.Location = new Point(140, 376);
        cboTitle.Name = "cboTitle";
        cboTitle.Size = new Size(250, 23);
        cboTitle.TabIndex = 10;
        // 
        // lblDescription
        // 
        lblDescription.AutoSize = true;
        lblDescription.Location = new Point(20, 408);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(71, 15);
        lblDescription.TabIndex = 11;
        lblDescription.Text = "Description:";
        // 
        // cboDescription
        // 
        cboDescription.DropDownStyle = ComboBoxStyle.DropDownList;
        cboDescription.Location = new Point(140, 404);
        cboDescription.Name = "cboDescription";
        cboDescription.Size = new Size(250, 23);
        cboDescription.TabIndex = 12;
        // 
        // lblCategory
        // 
        lblCategory.AutoSize = true;
        lblCategory.Location = new Point(20, 436);
        lblCategory.Name = "lblCategory";
        lblCategory.Size = new Size(58, 15);
        lblCategory.TabIndex = 13;
        lblCategory.Text = "Category:";
        // 
        // cboCategory
        // 
        cboCategory.DropDownStyle = ComboBoxStyle.DropDownList;
        cboCategory.Location = new Point(140, 432);
        cboCategory.Name = "cboCategory";
        cboCategory.Size = new Size(250, 23);
        cboCategory.TabIndex = 14;
        // 
        // lblPriority
        // 
        lblPriority.AutoSize = true;
        lblPriority.Location = new Point(20, 464);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(48, 15);
        lblPriority.TabIndex = 15;
        lblPriority.Text = "Priority:";
        // 
        // cboPriority
        // 
        cboPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cboPriority.Location = new Point(140, 460);
        cboPriority.Name = "cboPriority";
        cboPriority.Size = new Size(250, 23);
        cboPriority.TabIndex = 16;
        // 
        // lblStatus
        // 
        lblStatus.AutoSize = true;
        lblStatus.Location = new Point(400, 352);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(43, 15);
        lblStatus.TabIndex = 17;
        lblStatus.Text = "Status:";
        // 
        // cboStatus
        // 
        cboStatus.DropDownStyle = ComboBoxStyle.DropDownList;
        cboStatus.Location = new Point(470, 348);
        cboStatus.Name = "cboStatus";
        cboStatus.Size = new Size(250, 23);
        cboStatus.TabIndex = 18;
        // 
        // lblSource
        // 
        lblSource.AutoSize = true;
        lblSource.Location = new Point(400, 380);
        lblSource.Name = "lblSource";
        lblSource.Size = new Size(47, 15);
        lblSource.TabIndex = 19;
        lblSource.Text = "Source:";
        // 
        // cboSource
        // 
        cboSource.DropDownStyle = ComboBoxStyle.DropDownList;
        cboSource.Location = new Point(470, 376);
        cboSource.Name = "cboSource";
        cboSource.Size = new Size(250, 23);
        cboSource.TabIndex = 20;
        // 
        // lblParentCode
        // 
        lblParentCode.AutoSize = true;
        lblParentCode.Location = new Point(400, 408);
        lblParentCode.Name = "lblParentCode";
        lblParentCode.Size = new Size(72, 15);
        lblParentCode.TabIndex = 21;
        lblParentCode.Text = "ParentCode:";
        // 
        // cboParentCode
        // 
        cboParentCode.DropDownStyle = ComboBoxStyle.DropDownList;
        cboParentCode.Location = new Point(470, 404);
        cboParentCode.Name = "cboParentCode";
        cboParentCode.Size = new Size(250, 23);
        cboParentCode.TabIndex = 22;
        // 
        // chkGenerateIds
        // 
        chkGenerateIds.AutoSize = true;
        chkGenerateIds.Checked = true;
        chkGenerateIds.CheckState = CheckState.Checked;
        chkGenerateIds.Location = new Point(20, 492);
        chkGenerateIds.Name = "chkGenerateIds";
        chkGenerateIds.Size = new Size(150, 19);
        chkGenerateIds.TabIndex = 23;
        chkGenerateIds.Text = "Generate IDs if missing";
        chkGenerateIds.UseVisualStyleBackColor = true;
        // 
        // chkGenerateTestCases
        // 
        chkGenerateTestCases.AutoSize = true;
        chkGenerateTestCases.Checked = true;
        chkGenerateTestCases.CheckState = CheckState.Checked;
        chkGenerateTestCases.Location = new Point(20, 516);
        chkGenerateTestCases.Name = "chkGenerateTestCases";
        chkGenerateTestCases.Size = new Size(370, 19);
        chkGenerateTestCases.TabIndex = 24;
        chkGenerateTestCases.Text = "Auto-generate test cases from Title/Description (recommended)";
        chkGenerateTestCases.UseVisualStyleBackColor = true;
        // 
        // btnImport
        // 
        btnImport.Location = new Point(580, 548);
        btnImport.Name = "btnImport";
        btnImport.Size = new Size(75, 25);
        btnImport.TabIndex = 25;
        btnImport.Text = "Import";
        btnImport.UseVisualStyleBackColor = true;
        btnImport.Click += btnImport_Click;
        // 
        // btnCancel
        // 
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(660, 548);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 26;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // ImportMappingForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(750, 600);
        MinimumSize = new Size(750, 600);
        Controls.Add(btnCancel);
        Controls.Add(btnImport);
        Controls.Add(chkGenerateTestCases);
        Controls.Add(chkGenerateIds);
        Controls.Add(cboParentCode);
        Controls.Add(lblParentCode);
        Controls.Add(cboSource);
        Controls.Add(lblSource);
        Controls.Add(cboStatus);
        Controls.Add(lblStatus);
        Controls.Add(cboPriority);
        Controls.Add(lblPriority);
        Controls.Add(cboCategory);
        Controls.Add(lblCategory);
        Controls.Add(cboDescription);
        Controls.Add(lblDescription);
        Controls.Add(cboTitle);
        Controls.Add(lblTitle);
        Controls.Add(cboCode);
        Controls.Add(lblCode);
        Controls.Add(lblColumnMapping);
        Controls.Add(previewGrid);
        Controls.Add(lblPreview);
        Controls.Add(numHeaderRow);
        Controls.Add(lblHeaderRow);
        Controls.Add(cboSheet);
        Controls.Add(lblSheet);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ImportMappingForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Import from Excel";
        ((System.ComponentModel.ISupportInitialize)numHeaderRow).EndInit();
        ((System.ComponentModel.ISupportInitialize)previewGrid).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }
}
