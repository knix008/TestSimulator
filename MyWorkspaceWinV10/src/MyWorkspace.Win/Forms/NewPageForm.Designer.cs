namespace MyWorkspace.Win.Forms;

partial class NewPageForm
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
        lblTitle = new Label();
        txtTitle = new TextBox();
        lblTemplate = new Label();
        lstTemplates = new ListBox();
        lblTemplateDesc = new Label();
        lblPreview = new Label();
        txtPreview = new TextBox();
        btnOk = new Button();
        btnCancel = new Button();
        splitMain = new SplitContainer();
        lblTemplateFolder = new Label();
        btnReloadTemplates = new Button();
        btnOpenTemplateFolder = new Button();
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        SuspendLayout();

        lblTitle.AutoSize = true;
        lblTitle.Location = new Point(12, 16);
        lblTitle.Text = "Page 제목";

        txtTitle.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtTitle.Location = new Point(96, 12);
        txtTitle.Size = new Size(576, 23);
        txtTitle.TextChanged += txtTitle_TextChanged;

        lblTemplate.AutoSize = true;
        lblTemplate.Location = new Point(12, 48);
        lblTemplate.Text = "양식 선택";

        btnReloadTemplates.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnReloadTemplates.Location = new Point(432, 44);
        btnReloadTemplates.Size = new Size(80, 28);
        btnReloadTemplates.Text = "새로고침";
        btnReloadTemplates.UseVisualStyleBackColor = true;
        btnReloadTemplates.Click += btnReloadTemplates_Click;

        btnOpenTemplateFolder.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnOpenTemplateFolder.Location = new Point(518, 44);
        btnOpenTemplateFolder.Size = new Size(154, 28);
        btnOpenTemplateFolder.Text = "양식 폴더 열기";
        btnOpenTemplateFolder.UseVisualStyleBackColor = true;
        btnOpenTemplateFolder.Click += btnOpenTemplateFolder_Click;

        splitMain.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        splitMain.Location = new Point(12, 96);
        splitMain.Size = new Size(660, 336);
        splitMain.SplitterDistance = 220;

        lstTemplates.Dock = DockStyle.Fill;
        lstTemplates.IntegralHeight = false;
        lstTemplates.SelectedIndexChanged += lstTemplates_SelectedIndexChanged;

        lblTemplateDesc.Dock = DockStyle.Top;
        lblTemplateDesc.ForeColor = Color.DimGray;
        lblTemplateDesc.Padding = new Padding(0, 0, 0, 6);
        lblTemplateDesc.Text = "양식 설명";

        lblPreview.AutoSize = true;
        lblPreview.Dock = DockStyle.Top;
        lblPreview.Text = "미리보기";

        txtPreview.Dock = DockStyle.Fill;
        txtPreview.Font = new Font("Consolas", 9.5F);
        txtPreview.Multiline = true;
        txtPreview.ReadOnly = true;
        txtPreview.ScrollBars = ScrollBars.Both;
        txtPreview.WordWrap = false;

        splitMain.Panel1.Controls.Add(lstTemplates);
        splitMain.Panel2.Controls.Add(txtPreview);
        splitMain.Panel2.Controls.Add(lblPreview);
        splitMain.Panel2.Controls.Add(lblTemplateDesc);

        lblTemplateFolder.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        lblTemplateFolder.ForeColor = Color.DimGray;
        lblTemplateFolder.Location = new Point(12, 440);
        lblTemplateFolder.Size = new Size(660, 32);
        lblTemplateFolder.Text = "사용자 양식 폴더:";

        btnOk.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnOk.Location = new Point(512, 476);
        btnOk.Size = new Size(80, 32);
        btnOk.Text = "만들기";
        btnOk.Click += btnOk_Click;

        btnCancel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(592, 476);
        btnCancel.Size = new Size(80, 32);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(684, 520);
        Controls.Add(btnCancel);
        Controls.Add(btnOk);
        Controls.Add(lblTemplateFolder);
        Controls.Add(splitMain);
        Controls.Add(btnOpenTemplateFolder);
        Controls.Add(btnReloadTemplates);
        Controls.Add(lblTemplate);
        Controls.Add(txtTitle);
        Controls.Add(lblTitle);
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(620, 460);
        Name = "NewPageForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "새 Page";
        Load += NewPageForm_Load;
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        splitMain.Panel2.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblTitle;
    private TextBox txtTitle;
    private Label lblTemplate;
    private ListBox lstTemplates;
    private Label lblTemplateDesc;
    private Label lblPreview;
    private TextBox txtPreview;
    private Button btnOk;
    private Button btnCancel;
    private SplitContainer splitMain;
    private Label lblTemplateFolder;
    private Button btnReloadTemplates;
    private Button btnOpenTemplateFolder;
}
