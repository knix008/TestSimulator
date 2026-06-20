namespace ReqTrace.Forms;

partial class ErrorDialog
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private Label lblSummary;
    private Panel panelDetailsHost;
    private TextBox txtDetails;
    private Panel panelButtons;
    private Button btnCopy;
    private Button btnClose;

    private void InitializeComponent()
    {
        lblSummary = new Label();
        panelDetailsHost = new Panel();
        txtDetails = new TextBox();
        panelButtons = new Panel();
        btnCopy = new Button();
        btnClose = new Button();
        panelDetailsHost.SuspendLayout();
        panelButtons.SuspendLayout();
        SuspendLayout();
        // 
        // lblSummary
        // 
        lblSummary.AutoSize = false;
        lblSummary.Dock = DockStyle.Top;
        lblSummary.Location = new Point(0, 0);
        lblSummary.Name = "lblSummary";
        lblSummary.Padding = new Padding(12, 10, 12, 0);
        lblSummary.Size = new Size(640, 60);
        lblSummary.TabIndex = 0;
        lblSummary.Text = "Summary";
        // 
        // panelDetailsHost
        // 
        panelDetailsHost.Controls.Add(txtDetails);
        panelDetailsHost.Dock = DockStyle.Fill;
        panelDetailsHost.Location = new Point(0, 60);
        panelDetailsHost.Name = "panelDetailsHost";
        panelDetailsHost.Padding = new Padding(12, 0, 12, 0);
        panelDetailsHost.Size = new Size(640, 312);
        panelDetailsHost.TabIndex = 1;
        // 
        // txtDetails
        // 
        txtDetails.Dock = DockStyle.Fill;
        txtDetails.Font = new Font("Consolas", 9F);
        txtDetails.Location = new Point(12, 0);
        txtDetails.Margin = new Padding(12);
        txtDetails.Multiline = true;
        txtDetails.Name = "txtDetails";
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Both;
        txtDetails.Size = new Size(616, 312);
        txtDetails.TabIndex = 0;
        txtDetails.WordWrap = false;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(btnCopy);
        panelButtons.Controls.Add(btnClose);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 372);
        panelButtons.Name = "panelButtons";
        panelButtons.Size = new Size(640, 48);
        panelButtons.TabIndex = 2;
        // 
        // btnCopy
        // 
        btnCopy.Location = new Point(12, 10);
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(140, 25);
        btnCopy.TabIndex = 0;
        btnCopy.Text = "Copy to Clipboard";
        btnCopy.UseVisualStyleBackColor = true;
        btnCopy.Click += btnCopy_Click;
        // 
        // btnClose
        // 
        btnClose.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnClose.DialogResult = DialogResult.OK;
        btnClose.Location = new Point(553, 10);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(75, 25);
        btnClose.TabIndex = 1;
        btnClose.Text = "OK";
        btnClose.UseVisualStyleBackColor = true;
        // 
        // ErrorDialog
        // 
        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnClose;
        ClientSize = new Size(640, 420);
        Controls.Add(panelDetailsHost);
        Controls.Add(lblSummary);
        Controls.Add(panelButtons);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(420, 280);
        Name = "ErrorDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Error";
        panelDetailsHost.ResumeLayout(false);
        panelDetailsHost.PerformLayout();
        panelButtons.ResumeLayout(false);
        ResumeLayout(false);
    }
}
