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
        lblAppearance = new Label();
        lblTheme = new Label();
        cboTheme = new ComboBox();
        lblLanguage = new Label();
        cboLanguage = new ComboBox();
        lblHint = new Label();
        btnOk = new Button();
        btnCancel = new Button();
        SuspendLayout();

        lblAppearance.AutoSize = true;
        lblAppearance.Font = new Font("Segoe UI Semibold", 9.5F);
        lblAppearance.Location = new Point(20, 20);
        lblAppearance.Name = "lblAppearance";

        lblTheme.AutoSize = true;
        lblTheme.Location = new Point(36, 52);
        lblTheme.Name = "lblTheme";

        cboTheme.DropDownStyle = ComboBoxStyle.DropDownList;
        cboTheme.FormattingEnabled = true;
        cboTheme.Location = new Point(120, 48);
        cboTheme.Name = "cboTheme";
        cboTheme.Size = new Size(220, 23);
        cboTheme.TabIndex = 0;

        lblLanguage.AutoSize = true;
        lblLanguage.Location = new Point(36, 88);
        lblLanguage.Name = "lblLanguage";

        cboLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cboLanguage.FormattingEnabled = true;
        cboLanguage.Location = new Point(120, 84);
        cboLanguage.Name = "cboLanguage";
        cboLanguage.Size = new Size(220, 23);
        cboLanguage.TabIndex = 1;

        lblHint.Location = new Point(20, 124);
        lblHint.Name = "lblHint";
        lblHint.Size = new Size(320, 32);
        lblHint.ForeColor = Color.Gray;

        btnOk.Location = new Point(164, 168);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(84, 32);
        btnOk.TabIndex = 2;
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(256, 168);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(84, 32);
        btnCancel.TabIndex = 3;
        btnCancel.UseVisualStyleBackColor = true;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(360, 220);
        Controls.Add(btnCancel);
        Controls.Add(btnOk);
        Controls.Add(lblHint);
        Controls.Add(cboLanguage);
        Controls.Add(lblLanguage);
        Controls.Add(cboTheme);
        Controls.Add(lblTheme);
        Controls.Add(lblAppearance);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "PreferencesForm";
        StartPosition = FormStartPosition.CenterParent;
        Load += PreferencesForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblAppearance;
    private Label lblTheme;
    private ComboBox cboTheme;
    private Label lblLanguage;
    private ComboBox cboLanguage;
    private Label lblHint;
    private Button btnOk;
    private Button btnCancel;
}
