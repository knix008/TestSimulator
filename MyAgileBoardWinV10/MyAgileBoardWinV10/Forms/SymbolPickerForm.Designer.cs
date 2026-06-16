namespace MyAgileBoardWinV10.Forms;

partial class SymbolPickerForm
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
        tabs = new TabControl();
        tabPageSpecial = new TabPage();
        flowSpecial = new FlowLayoutPanel();
        tabPageEmoji = new TabPage();
        flowEmoji = new FlowLayoutPanel();
        btnClose = new Button();
        tabs.SuspendLayout();
        tabPageSpecial.SuspendLayout();
        tabPageEmoji.SuspendLayout();
        SuspendLayout();

        tabs.Controls.Add(tabPageSpecial);
        tabs.Controls.Add(tabPageEmoji);
        tabs.Dock = DockStyle.Fill;
        tabs.Location = new Point(0, 0);
        tabs.Name = "tabs";
        tabs.SelectedIndex = 0;
        tabs.Size = new Size(420, 264);
        tabs.TabIndex = 0;

        tabPageSpecial.Controls.Add(flowSpecial);
        tabPageSpecial.Location = new Point(4, 24);
        tabPageSpecial.Name = "tabPageSpecial";
        tabPageSpecial.Padding = new Padding(3);
        tabPageSpecial.Size = new Size(412, 236);
        tabPageSpecial.TabIndex = 0;
        tabPageSpecial.Text = "특수문자";
        tabPageSpecial.UseVisualStyleBackColor = true;

        flowSpecial.AutoScroll = true;
        flowSpecial.Dock = DockStyle.Fill;
        flowSpecial.Location = new Point(3, 3);
        flowSpecial.Name = "flowSpecial";
        flowSpecial.Padding = new Padding(6);
        flowSpecial.Size = new Size(406, 230);
        flowSpecial.TabIndex = 0;
        flowSpecial.WrapContents = true;

        tabPageEmoji.Controls.Add(flowEmoji);
        tabPageEmoji.Location = new Point(4, 24);
        tabPageEmoji.Name = "tabPageEmoji";
        tabPageEmoji.Padding = new Padding(3);
        tabPageEmoji.Size = new Size(412, 236);
        tabPageEmoji.TabIndex = 1;
        tabPageEmoji.Text = "이모티콘";
        tabPageEmoji.UseVisualStyleBackColor = true;

        flowEmoji.AutoScroll = true;
        flowEmoji.Dock = DockStyle.Fill;
        flowEmoji.Location = new Point(3, 3);
        flowEmoji.Name = "flowEmoji";
        flowEmoji.Padding = new Padding(6);
        flowEmoji.Size = new Size(406, 230);
        flowEmoji.TabIndex = 0;
        flowEmoji.WrapContents = true;

        btnClose.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnClose.DialogResult = DialogResult.Cancel;
        btnClose.Location = new Point(328, 264);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(80, 28);
        btnClose.TabIndex = 1;
        btnClose.Text = "닫기";
        btnClose.UseVisualStyleBackColor = true;

        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnClose;
        ClientSize = new Size(420, 300);
        Controls.Add(tabs);
        Controls.Add(btnClose);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "SymbolPickerForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "특수문자 / 이모티콘";

        tabs.ResumeLayout(false);
        tabPageSpecial.ResumeLayout(false);
        tabPageEmoji.ResumeLayout(false);
        ResumeLayout(false);
    }

    private TabControl tabs = null!;
    private TabPage tabPageSpecial = null!;
    private FlowLayoutPanel flowSpecial = null!;
    private TabPage tabPageEmoji = null!;
    private FlowLayoutPanel flowEmoji = null!;
    private Button btnClose = null!;
}
