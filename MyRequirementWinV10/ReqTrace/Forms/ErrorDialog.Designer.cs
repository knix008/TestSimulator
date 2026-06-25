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

    private Panel panelDetailsHost;
    private TextBox txtDetails;
    private Panel panelButtons;
    private Button btnCopy;
    private Button btnClose;
    private ContextMenuStrip detailsContextMenu;
    private ToolStripMenuItem copyMenuItem;

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        panelDetailsHost = new Panel();
        txtDetails = new TextBox();
        panelButtons = new Panel();
        btnCopy = new Button();
        btnClose = new Button();
        detailsContextMenu = new ContextMenuStrip(components);
        copyMenuItem = new ToolStripMenuItem();
        panelDetailsHost.SuspendLayout();
        panelButtons.SuspendLayout();
        detailsContextMenu.SuspendLayout();
        SuspendLayout();
        // 
        // panelDetailsHost
        // 
        panelDetailsHost.Controls.Add(txtDetails);
        panelDetailsHost.Dock = DockStyle.Fill;
        panelDetailsHost.Location = new Point(0, 0);
        panelDetailsHost.Name = "panelDetailsHost";
        panelDetailsHost.Padding = new Padding(12, 12, 12, 0);
        panelDetailsHost.Size = new Size(640, 372);
        panelDetailsHost.TabIndex = 0;
        // 
        // txtDetails
        // 
        txtDetails.ContextMenuStrip = detailsContextMenu;
        txtDetails.Dock = DockStyle.Fill;
        txtDetails.Location = new Point(12, 12);
        txtDetails.Multiline = true;
        txtDetails.Name = "txtDetails";
        txtDetails.ScrollBars = ScrollBars.Both;
        txtDetails.Size = new Size(616, 360);
        txtDetails.TabIndex = 0;
        txtDetails.WordWrap = true;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(btnCopy);
        panelButtons.Controls.Add(btnClose);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 372);
        panelButtons.Name = "panelButtons";
        panelButtons.Size = new Size(640, 48);
        panelButtons.TabIndex = 1;
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
        // detailsContextMenu
        // 
        detailsContextMenu.Items.AddRange(new ToolStripItem[] { copyMenuItem });
        detailsContextMenu.Name = "detailsContextMenu";
        detailsContextMenu.Size = new Size(181, 26);
        // 
        // copyMenuItem
        // 
        copyMenuItem.Name = "copyMenuItem";
        copyMenuItem.Size = new Size(180, 22);
        copyMenuItem.Text = "Copy";
        // 
        // ErrorDialog
        // 
        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnClose;
        ClientSize = new Size(640, 420);
        Controls.Add(panelDetailsHost);
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
        detailsContextMenu.ResumeLayout(false);
        ResumeLayout(false);
    }
}
