namespace MyAgileBoardWinV10.Forms;

partial class ExportImageFormatDialog
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblFormat = new Label();
        cmbFormat = new ComboBox();
        btnOk = new Button();
        btnCancel = new Button();
        SuspendLayout();

        lblFormat.AutoSize = true;
        lblFormat.Location = new Point(12, 16);
        lblFormat.Text = "이미지 형식";

        cmbFormat.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbFormat.FormattingEnabled = true;
        cmbFormat.Location = new Point(12, 36);
        cmbFormat.Size = new Size(260, 23);
        cmbFormat.Format += (_, e) =>
        {
            if (e.ListItem is Services.ImageExportFormat fmt)
                e.Value = Services.ColumnCardImageExporter.GetDisplayName(fmt);
        };

        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(116, 76);
        btnOk.Size = new Size(75, 28);
        btnOk.Text = "확인";

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(197, 76);
        btnCancel.Size = new Size(75, 28);
        btnCancel.Text = "취소";

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(284, 118);
        Controls.AddRange(new Control[] { lblFormat, cmbFormat, btnOk, btnCancel });
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "컬럼 카드 이미지 형식";

        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblFormat = null!;
    private ComboBox cmbFormat = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
