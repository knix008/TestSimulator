namespace ReqTrace.Forms;

partial class LlmSettingsForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private TableLayoutPanel layoutTable;
    private Label lblDescription;
    private Label lblOllamaUrl;
    private TextBox txtOllamaUrl;
    private Label lblOllamaModel;
    private ComboBox cboOllamaModel;
    private Button btnRefreshModels;
    private CheckBox chkUseForExcelImport;
    private Button btnTestConnection;
    private FlowLayoutPanel buttonPanel;
    private Button btnOk;
    private Button btnCancel;

    private void InitializeComponent()
    {
        layoutTable = new TableLayoutPanel();
        lblDescription = new Label();
        lblOllamaUrl = new Label();
        txtOllamaUrl = new TextBox();
        lblOllamaModel = new Label();
        cboOllamaModel = new ComboBox();
        btnRefreshModels = new Button();
        chkUseForExcelImport = new CheckBox();
        btnTestConnection = new Button();
        buttonPanel = new FlowLayoutPanel();
        btnCancel = new Button();
        btnOk = new Button();
        layoutTable.SuspendLayout();
        buttonPanel.SuspendLayout();
        SuspendLayout();
        // 
        // layoutTable
        // 
        layoutTable.ColumnCount = 3;
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110F));
        layoutTable.Controls.Add(lblDescription, 0, 0);
        layoutTable.Controls.Add(lblOllamaUrl, 0, 1);
        layoutTable.Controls.Add(txtOllamaUrl, 1, 1);
        layoutTable.Controls.Add(lblOllamaModel, 0, 2);
        layoutTable.Controls.Add(cboOllamaModel, 1, 2);
        layoutTable.Controls.Add(btnRefreshModels, 2, 2);
        layoutTable.Controls.Add(chkUseForExcelImport, 1, 3);
        layoutTable.Controls.Add(btnTestConnection, 1, 4);
        layoutTable.Controls.Add(buttonPanel, 0, 5);
        layoutTable.Dock = DockStyle.Fill;
        layoutTable.Location = new Point(0, 0);
        layoutTable.Name = "layoutTable";
        layoutTable.Padding = new Padding(12, 12, 12, 8);
        layoutTable.RowCount = 6;
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        layoutTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 52F));
        layoutTable.SetColumnSpan(lblDescription, 3);
        layoutTable.SetColumnSpan(txtOllamaUrl, 2);
        layoutTable.SetColumnSpan(chkUseForExcelImport, 2);
        layoutTable.SetColumnSpan(btnTestConnection, 2);
        layoutTable.SetColumnSpan(buttonPanel, 3);
        layoutTable.Size = new Size(520, 272);
        layoutTable.TabIndex = 0;
        // 
        // lblDescription
        // 
        lblDescription.Dock = DockStyle.Fill;
        lblDescription.Location = new Point(12, 12);
        lblDescription.Margin = new Padding(0, 0, 0, 8);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(496, 40);
        lblDescription.TabIndex = 0;
        lblDescription.Text = "Configure local Ollama for AI import.";
        // 
        // lblOllamaUrl
        // 
        lblOllamaUrl.Dock = DockStyle.Fill;
        lblOllamaUrl.Location = new Point(12, 60);
        lblOllamaUrl.Margin = new Padding(0, 0, 10, 0);
        lblOllamaUrl.Name = "lblOllamaUrl";
        lblOllamaUrl.Size = new Size(110, 36);
        lblOllamaUrl.TabIndex = 1;
        lblOllamaUrl.Text = "Ollama URL:";
        lblOllamaUrl.TextAlign = ContentAlignment.MiddleRight;
        // 
        // txtOllamaUrl
        // 
        txtOllamaUrl.Dock = DockStyle.Fill;
        txtOllamaUrl.Location = new Point(132, 60);
        txtOllamaUrl.Margin = new Padding(0, 4, 0, 4);
        txtOllamaUrl.Name = "txtOllamaUrl";
        txtOllamaUrl.Size = new Size(376, 23);
        txtOllamaUrl.TabIndex = 2;
        // 
        // lblOllamaModel
        // 
        lblOllamaModel.Dock = DockStyle.Fill;
        lblOllamaModel.Location = new Point(12, 96);
        lblOllamaModel.Margin = new Padding(0, 0, 10, 0);
        lblOllamaModel.Name = "lblOllamaModel";
        lblOllamaModel.Size = new Size(110, 36);
        lblOllamaModel.TabIndex = 3;
        lblOllamaModel.Text = "Ollama model:";
        lblOllamaModel.TextAlign = ContentAlignment.MiddleRight;
        // 
        // cboOllamaModel
        // 
        cboOllamaModel.Dock = DockStyle.Fill;
        cboOllamaModel.DropDownStyle = ComboBoxStyle.DropDownList;
        cboOllamaModel.FormattingEnabled = true;
        cboOllamaModel.Location = new Point(132, 100);
        cboOllamaModel.Margin = new Padding(0, 4, 8, 4);
        cboOllamaModel.Name = "cboOllamaModel";
        cboOllamaModel.Size = new Size(258, 23);
        cboOllamaModel.TabIndex = 4;
        // 
        // btnRefreshModels
        // 
        btnRefreshModels.AutoSize = false;
        btnRefreshModels.Dock = DockStyle.Fill;
        btnRefreshModels.Location = new Point(398, 100);
        btnRefreshModels.Margin = new Padding(0, 4, 0, 4);
        btnRefreshModels.Name = "btnRefreshModels";
        btnRefreshModels.Size = new Size(110, 28);
        btnRefreshModels.TabIndex = 5;
        btnRefreshModels.Text = "Refresh";
        btnRefreshModels.UseVisualStyleBackColor = true;
        btnRefreshModels.Click += btnRefreshModels_Click;
        // 
        // chkUseForExcelImport
        // 
        chkUseForExcelImport.AutoSize = true;
        chkUseForExcelImport.Location = new Point(132, 136);
        chkUseForExcelImport.Margin = new Padding(0, 4, 0, 4);
        chkUseForExcelImport.Name = "chkUseForExcelImport";
        chkUseForExcelImport.Size = new Size(150, 19);
        chkUseForExcelImport.TabIndex = 6;
        chkUseForExcelImport.Text = "Use LLM for Excel import";
        chkUseForExcelImport.UseVisualStyleBackColor = true;
        // 
        // btnTestConnection
        // 
        btnTestConnection.AutoSize = true;
        btnTestConnection.Dock = DockStyle.Left;
        btnTestConnection.Location = new Point(132, 168);
        btnTestConnection.Margin = new Padding(0, 4, 0, 0);
        btnTestConnection.Name = "btnTestConnection";
        btnTestConnection.Padding = new Padding(8, 0, 8, 0);
        btnTestConnection.Size = new Size(116, 28);
        btnTestConnection.TabIndex = 6;
        btnTestConnection.Text = "Test connection";
        btnTestConnection.UseVisualStyleBackColor = true;
        btnTestConnection.Click += btnTestConnection_Click;
        // 
        // buttonPanel
        // 
        buttonPanel.Controls.Add(btnCancel);
        buttonPanel.Controls.Add(btnOk);
        buttonPanel.Dock = DockStyle.Fill;
        buttonPanel.FlowDirection = FlowDirection.RightToLeft;
        buttonPanel.Location = new Point(12, 208);
        buttonPanel.Margin = new Padding(0);
        buttonPanel.Name = "buttonPanel";
        buttonPanel.Padding = new Padding(0, 10, 0, 4);
        buttonPanel.Size = new Size(496, 52);
        buttonPanel.TabIndex = 7;
        buttonPanel.WrapContents = false;
        // 
        // btnCancel
        // 
        btnCancel.AutoSize = true;
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(421, 10);
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
        btnOk.Location = new Point(346, 10);
        btnOk.Margin = new Padding(8, 0, 0, 0);
        btnOk.MinimumSize = new Size(75, 28);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 28);
        btnOk.TabIndex = 1;
        btnOk.Text = "OK";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // LlmSettingsForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(520, 272);
        Controls.Add(layoutTable);
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(480, 272);
        Name = "LlmSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "LLM Settings";
        layoutTable.ResumeLayout(false);
        layoutTable.PerformLayout();
        buttonPanel.ResumeLayout(false);
        buttonPanel.PerformLayout();
        ResumeLayout(false);
    }
}
