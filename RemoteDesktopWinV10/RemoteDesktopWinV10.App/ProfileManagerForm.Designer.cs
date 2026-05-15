namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class ProfileManagerForm
{
    private System.ComponentModel.IContainer components;

    private Panel panelRoot;
    private Panel panelListHost;
    private Panel panelBottom;
    private ListBox listProfiles;
    private FlowLayoutPanel flowButtons;
    private Button buttonAdd;
    private Button buttonEdit;
    private Button buttonDelete;
    private Button buttonClose;
    private Label labelHint;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        panelRoot = new Panel();
        panelListHost = new Panel();
        panelBottom = new Panel();
        listProfiles = new ListBox();
        labelHint = new Label();
        flowButtons = new FlowLayoutPanel();
        buttonAdd = new Button();
        buttonEdit = new Button();
        buttonDelete = new Button();
        buttonClose = new Button();
        panelRoot.SuspendLayout();
        panelListHost.SuspendLayout();
        panelBottom.SuspendLayout();
        flowButtons.SuspendLayout();
        SuspendLayout();
        //
        // panelRoot
        //
        panelRoot.Controls.Add(panelBottom);
        panelRoot.Controls.Add(panelListHost);
        panelRoot.Dock = DockStyle.Fill;
        panelRoot.Name = "panelRoot";
        panelRoot.Padding = new Padding(12);
        //
        // panelBottom
        //
        panelBottom.Controls.Add(labelHint);
        panelBottom.Controls.Add(flowButtons);
        panelBottom.Dock = DockStyle.Bottom;
        panelBottom.Name = "panelBottom";
        panelBottom.Size = new Size(384, 92);
        panelBottom.TabIndex = 1;
        //
        // labelHint
        //
        labelHint.AutoSize = true;
        labelHint.Dock = DockStyle.Top;
        labelHint.ForeColor = SystemColors.GrayText;
        labelHint.Margin = new Padding(0, 0, 0, 8);
        labelHint.Name = "labelHint";
        labelHint.Padding = new Padding(0, 0, 0, 4);
        labelHint.Text = "항목을 더블 클릭하면 편집합니다.";
        //
        // flowButtons
        //
        flowButtons.AutoSize = true;
        flowButtons.Controls.Add(buttonClose);
        flowButtons.Controls.Add(buttonDelete);
        flowButtons.Controls.Add(buttonEdit);
        flowButtons.Controls.Add(buttonAdd);
        flowButtons.Dock = DockStyle.Bottom;
        flowButtons.FlowDirection = FlowDirection.RightToLeft;
        flowButtons.Location = new Point(0, 52);
        flowButtons.Name = "flowButtons";
        flowButtons.Padding = new Padding(0, 8, 0, 0);
        flowButtons.Size = new Size(360, 40);
        flowButtons.TabIndex = 1;
        //
        // buttonAdd
        //
        buttonAdd.AutoSize = true;
        buttonAdd.Location = new Point(3, 4);
        buttonAdd.Name = "buttonAdd";
        buttonAdd.Size = new Size(75, 28);
        buttonAdd.TabIndex = 3;
        buttonAdd.Text = "추가";
        buttonAdd.UseVisualStyleBackColor = true;
        buttonAdd.Click += buttonAdd_Click;
        //
        // buttonEdit
        //
        buttonEdit.AutoSize = true;
        buttonEdit.Location = new Point(84, 4);
        buttonEdit.Name = "buttonEdit";
        buttonEdit.Size = new Size(75, 28);
        buttonEdit.TabIndex = 2;
        buttonEdit.Text = "편집";
        buttonEdit.UseVisualStyleBackColor = true;
        buttonEdit.Click += buttonEdit_Click;
        //
        // buttonDelete
        //
        buttonDelete.AutoSize = true;
        buttonDelete.Location = new Point(165, 4);
        buttonDelete.Name = "buttonDelete";
        buttonDelete.Size = new Size(75, 28);
        buttonDelete.TabIndex = 1;
        buttonDelete.Text = "삭제";
        buttonDelete.UseVisualStyleBackColor = true;
        buttonDelete.Click += buttonDelete_Click;
        //
        // buttonClose
        //
        buttonClose.AutoSize = true;
        buttonClose.DialogResult = DialogResult.OK;
        buttonClose.Location = new Point(282, 4);
        buttonClose.Name = "buttonClose";
        buttonClose.Size = new Size(75, 28);
        buttonClose.TabIndex = 0;
        buttonClose.Text = "닫기";
        buttonClose.UseVisualStyleBackColor = true;
        //
        // panelListHost
        //
        panelListHost.Controls.Add(listProfiles);
        panelListHost.Dock = DockStyle.Fill;
        panelListHost.Name = "panelListHost";
        panelListHost.Padding = new Padding(0, 0, 0, 8);
        panelListHost.TabIndex = 0;
        //
        // listProfiles
        //
        listProfiles.Dock = DockStyle.Fill;
        listProfiles.FormattingEnabled = true;
        listProfiles.IntegralHeight = false;
        listProfiles.ItemHeight = 17;
        listProfiles.Name = "listProfiles";
        listProfiles.TabIndex = 0;
        listProfiles.DoubleClick += listProfiles_DoubleClick;
        //
        // ProfileManagerForm
        //
        AcceptButton = buttonClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(384, 361);
        Controls.Add(panelRoot);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ProfileManagerForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "프로필 관리";
        panelRoot.ResumeLayout(false);
        panelListHost.ResumeLayout(false);
        panelBottom.ResumeLayout(false);
        panelBottom.PerformLayout();
        flowButtons.ResumeLayout(false);
        flowButtons.PerformLayout();
        ResumeLayout(false);
    }
}

#nullable restore
