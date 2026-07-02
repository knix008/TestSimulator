namespace MyWorkspace.Win.Forms;

partial class PreferencesForm
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
        tblMain = new TableLayoutPanel();
        lblAppearance = new Label();
        lblTheme = new Label();
        cboTheme = new ThemedComboBox();
        lblColorTheme = new Label();
        pnlColorTheme = new Panel();
        lblLanguage = new Label();
        cboLanguage = new ThemedComboBox();
        lblFontScale = new Label();
        cboFontScale = new ThemedComboBox();
        lblHint = new Label();
        pnlButtons = new FlowLayoutPanel();
        btnOk = new Button();
        btnCancel = new Button();
        tblMain.SuspendLayout();
        pnlButtons.SuspendLayout();
        SuspendLayout();

        tblMain.ColumnCount = 2;
        tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 104F));
        tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tblMain.Controls.Add(lblAppearance, 0, 0);
        tblMain.Controls.Add(lblTheme, 0, 1);
        tblMain.Controls.Add(cboTheme, 1, 1);
        tblMain.Controls.Add(lblColorTheme, 0, 2);
        tblMain.Controls.Add(pnlColorTheme, 1, 2);
        tblMain.Controls.Add(lblLanguage, 0, 3);
        tblMain.Controls.Add(cboLanguage, 1, 3);
        tblMain.Controls.Add(lblFontScale, 0, 4);
        tblMain.Controls.Add(cboFontScale, 1, 4);
        tblMain.Controls.Add(lblHint, 1, 5);
        tblMain.Controls.Add(pnlButtons, 0, 6);
        tblMain.Dock = DockStyle.Fill;
        tblMain.Location = new Point(0, 0);
        tblMain.Name = "tblMain";
        tblMain.Padding = new Padding(20, 16, 20, 16);
        tblMain.Tag = "layout";
        tblMain.RowCount = 7;
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 44F));
        tblMain.SetColumnSpan(lblAppearance, 2);
        tblMain.SetColumnSpan(pnlButtons, 2);
        tblMain.Size = new Size(520, 440);
        tblMain.TabIndex = 0;

        lblAppearance.AutoSize = true;
        lblAppearance.Font = new Font("Segoe UI Semibold", 9.5F);
        lblAppearance.Margin = new Padding(0, 0, 0, 12);
        lblAppearance.Name = "lblAppearance";

        lblTheme.AutoSize = false;
        lblTheme.Dock = DockStyle.Fill;
        lblTheme.Margin = new Padding(0, 4, 10, 12);
        lblTheme.Name = "lblTheme";
        lblTheme.Tag = "field-label";
        lblTheme.TextAlign = ContentAlignment.MiddleRight;

        cboTheme.Dock = DockStyle.Top;
        cboTheme.DropDownStyle = ComboBoxStyle.DropDownList;
        cboTheme.FormattingEnabled = true;
        cboTheme.Margin = new Padding(0, 4, 0, 12);
        cboTheme.Name = "cboTheme";
        cboTheme.TabIndex = 0;
        cboTheme.Tag = "noborder";

        lblColorTheme.AutoSize = false;
        lblColorTheme.Dock = DockStyle.Fill;
        lblColorTheme.Margin = new Padding(0, 0, 10, 4);
        lblColorTheme.Name = "lblColorTheme";
        lblColorTheme.Tag = "field-label";
        lblColorTheme.TextAlign = ContentAlignment.TopRight;

        pnlColorTheme.Dock = DockStyle.Top;
        pnlColorTheme.Margin = new Padding(0, 0, 0, 4);
        pnlColorTheme.Name = "pnlColorTheme";
        pnlColorTheme.Padding = Padding.Empty;
        pnlColorTheme.Tag = "layout";

        lblLanguage.AutoSize = false;
        lblLanguage.Dock = DockStyle.Fill;
        lblLanguage.Margin = new Padding(0, 4, 10, 12);
        lblLanguage.Name = "lblLanguage";
        lblLanguage.Tag = "field-label";
        lblLanguage.TextAlign = ContentAlignment.MiddleRight;

        cboLanguage.Dock = DockStyle.Top;
        cboLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cboLanguage.FormattingEnabled = true;
        cboLanguage.Margin = new Padding(0, 4, 0, 12);
        cboLanguage.Name = "cboLanguage";
        cboLanguage.TabIndex = 1;

        lblFontScale.AutoSize = false;
        lblFontScale.Dock = DockStyle.Fill;
        lblFontScale.Margin = new Padding(0, 0, 10, 4);
        lblFontScale.Name = "lblFontScale";
        lblFontScale.Tag = "field-label";
        lblFontScale.TextAlign = ContentAlignment.MiddleRight;

        cboFontScale.Dock = DockStyle.Top;
        cboFontScale.DropDownStyle = ComboBoxStyle.DropDownList;
        cboFontScale.FormattingEnabled = true;
        cboFontScale.Margin = new Padding(0, 0, 0, 4);
        cboFontScale.Name = "cboFontScale";
        cboFontScale.TabIndex = 2;

        lblHint.AutoSize = false;
        lblHint.Dock = DockStyle.Fill;
        lblHint.Margin = new Padding(0, 12, 0, 0);
        lblHint.Name = "lblHint";
        lblHint.Tag = "muted";
        lblHint.TextAlign = ContentAlignment.TopLeft;

        pnlButtons.Controls.Add(btnCancel);
        pnlButtons.Controls.Add(btnOk);
        pnlButtons.Dock = DockStyle.Fill;
        pnlButtons.FlowDirection = FlowDirection.RightToLeft;
        pnlButtons.Location = new Point(23, 379);
        pnlButtons.Margin = new Padding(0, 12, 0, 0);
        pnlButtons.Name = "pnlButtons";
        pnlButtons.Padding = new Padding(0, 4, 0, 0);
        pnlButtons.Size = new Size(474, 40);
        pnlButtons.TabIndex = 3;
        pnlButtons.Tag = "layout";
        pnlButtons.WrapContents = false;

        btnOk.Location = new Point(390, 7);
        btnOk.Margin = new Padding(8, 0, 0, 0);
        btnOk.MinimumSize = new Size(84, 32);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(84, 32);
        btnOk.TabIndex = 4;
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(298, 7);
        btnCancel.Margin = new Padding(8, 0, 0, 0);
        btnCancel.MinimumSize = new Size(84, 32);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(84, 32);
        btnCancel.TabIndex = 5;
        btnCancel.UseVisualStyleBackColor = true;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(520, 440);
        Controls.Add(tblMain);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "PreferencesForm";
        StartPosition = FormStartPosition.CenterParent;
        Load += PreferencesForm_Load;
        tblMain.ResumeLayout(false);
        tblMain.PerformLayout();
        pnlButtons.ResumeLayout(false);
        pnlButtons.PerformLayout();
        ResumeLayout(false);
    }

    private TableLayoutPanel tblMain;
    private Label lblAppearance;
    private Label lblTheme;
    private ThemedComboBox cboTheme;
    private Label lblColorTheme;
    private Panel pnlColorTheme;
    private Label lblLanguage;
    private ThemedComboBox cboLanguage;
    private Label lblFontScale;
    private ThemedComboBox cboFontScale;
    private Label lblHint;
    private FlowLayoutPanel pnlButtons;
    private Button btnOk;
    private Button btnCancel;
}
