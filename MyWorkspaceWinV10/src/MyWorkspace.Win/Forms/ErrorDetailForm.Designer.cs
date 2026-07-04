using MyWorkspace.Win;

namespace MyWorkspace.Win.Forms;

partial class ErrorDetailForm
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
        lblSummary = new Label();
        txtDetails = new TextBox();
        pnlButtons = new Panel();
        btnCopy = new ThemedDialogButton();
        btnClose = new ThemedDialogButton();
        pnlButtons.SuspendLayout();
        SuspendLayout();

        lblSummary.AutoEllipsis = true;
        lblSummary.Dock = DockStyle.Top;
        lblSummary.Padding = new Padding(8, 8, 8, 4);
        lblSummary.Height = 48;
        lblSummary.Text = string.Empty;

        txtDetails.Dock = DockStyle.Fill;
        txtDetails.Font = new Font("Consolas", 9F);
        txtDetails.Multiline = true;
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Both;
        txtDetails.WordWrap = false;
        txtDetails.BorderStyle = BorderStyle.FixedSingle;

        pnlButtons.Controls.Add(btnCopy);
        pnlButtons.Controls.Add(btnClose);
        pnlButtons.Dock = DockStyle.Bottom;
        pnlButtons.Height = 48;
        pnlButtons.Padding = new Padding(8, 6, 8, 6);

        btnCopy.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnCopy.Location = new Point(332, 8);
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(96, 32);
        btnCopy.Text = "복사";
        btnCopy.UseVisualStyleBackColor = true;
        btnCopy.Click += btnCopy_Click;

        btnClose.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnClose.DialogResult = DialogResult.OK;
        btnClose.Location = new Point(428, 8);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(96, 32);
        btnClose.Text = "닫기";
        btnClose.UseVisualStyleBackColor = true;
        btnClose.Click += btnClose_Click;

        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(544, 400);
        Controls.Add(txtDetails);
        Controls.Add(pnlButtons);
        Controls.Add(lblSummary);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(480, 320);
        Name = "ErrorDetailForm";
        ShowIcon = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "오류";
        pnlButtons.ResumeLayout(false);
        ResumeLayout(false);
    }

    private Label lblSummary;
    private TextBox txtDetails;
    private Panel pnlButtons;
    private Button btnCopy;
    private Button btnClose;
}
