namespace FileMasterWinV10.Dialogs;

partial class SearchDialog
{
    private System.ComponentModel.IContainer components = null!;

    private TableLayoutPanel topPanel;
    private Label lblFileName;
    private TextBox patternBox;
    private CheckBox searchContentCheck;
    private TextBox contentBox;
    private FlowLayoutPanel btnPanel;
    private Button searchBtn;
    private Button clearBtn;
    private Button closeBtn;
    private ListBox resultList;
    private Label statusLabel;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            components?.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        topPanel = new TableLayoutPanel();
        lblFileName = new Label();
        patternBox = new TextBox();
        searchContentCheck = new CheckBox();
        contentBox = new TextBox();
        btnPanel = new FlowLayoutPanel();
        searchBtn = new Button();
        clearBtn = new Button();
        closeBtn = new Button();
        resultList = new ListBox();
        statusLabel = new Label();
        topPanel.SuspendLayout();
        btnPanel.SuspendLayout();
        SuspendLayout();
        //
        // topPanel
        //
        topPanel.ColumnCount = 2;
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        topPanel.Controls.Add(lblFileName, 0, 0);
        topPanel.Controls.Add(patternBox, 1, 0);
        topPanel.Controls.Add(searchContentCheck, 0, 1);
        topPanel.Controls.Add(contentBox, 1, 1);
        topPanel.Dock = DockStyle.Top;
        topPanel.Location = new Point(0, 0);
        topPanel.Name = "topPanel";
        topPanel.Padding = new Padding(12, 10, 12, 6);
        topPanel.RowCount = 2;
        topPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        topPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        topPanel.Size = new Size(680, 88);
        topPanel.TabIndex = 3;
        //
        // lblFileName
        //
        lblFileName.AutoSize = true;
        lblFileName.Location = new Point(12, 16);
        lblFileName.Margin = new Padding(0, 6, 10, 0);
        lblFileName.Name = "lblFileName";
        lblFileName.Size = new Size(67, 15);
        lblFileName.TabIndex = 0;
        lblFileName.Text = "파일 이름:";
        //
        // patternBox
        //
        patternBox.Dock = DockStyle.Fill;
        patternBox.Location = new Point(89, 13);
        patternBox.Margin = new Padding(0, 2, 0, 6);
        patternBox.Name = "patternBox";
        patternBox.Size = new Size(579, 23);
        patternBox.TabIndex = 1;
        patternBox.Text = "*.*";
        //
        // searchContentCheck
        //
        searchContentCheck.AutoSize = true;
        searchContentCheck.Location = new Point(12, 45);
        searchContentCheck.Margin = new Padding(0, 6, 10, 0);
        searchContentCheck.Name = "searchContentCheck";
        searchContentCheck.Size = new Size(77, 19);
        searchContentCheck.TabIndex = 2;
        searchContentCheck.Text = "내용 검색:";
        //
        // contentBox
        //
        contentBox.Dock = DockStyle.Fill;
        contentBox.Enabled = false;
        contentBox.Location = new Point(89, 42);
        contentBox.Margin = new Padding(0, 2, 0, 0);
        contentBox.Name = "contentBox";
        contentBox.Size = new Size(579, 23);
        contentBox.TabIndex = 3;
        //
        // btnPanel
        //
        btnPanel.Controls.Add(searchBtn);
        btnPanel.Controls.Add(clearBtn);
        btnPanel.Controls.Add(closeBtn);
        btnPanel.Dock = DockStyle.Top;
        btnPanel.FlowDirection = FlowDirection.LeftToRight;
        btnPanel.Location = new Point(0, 88);
        btnPanel.Name = "btnPanel";
        btnPanel.Padding = new Padding(12, 4, 12, 8);
        btnPanel.Size = new Size(680, 44);
        btnPanel.TabIndex = 2;
        btnPanel.WrapContents = false;
        //
        // searchBtn
        //
        searchBtn.Location = new Point(12, 4);
        searchBtn.Name = "searchBtn";
        searchBtn.Size = new Size(96, 32);
        searchBtn.TabIndex = 0;
        searchBtn.Text = "검색 시작";
        searchBtn.UseVisualStyleBackColor = true;
        //
        // clearBtn
        //
        clearBtn.Location = new Point(108, 4);
        clearBtn.Margin = new Padding(8, 0, 0, 0);
        clearBtn.Name = "clearBtn";
        clearBtn.Size = new Size(96, 32);
        clearBtn.TabIndex = 1;
        clearBtn.Text = "결과 지우기";
        clearBtn.UseVisualStyleBackColor = true;
        //
        // closeBtn
        //
        closeBtn.Location = new Point(204, 4);
        closeBtn.Margin = new Padding(8, 0, 0, 0);
        closeBtn.Name = "closeBtn";
        closeBtn.Size = new Size(80, 32);
        closeBtn.TabIndex = 2;
        closeBtn.Text = "닫기";
        closeBtn.UseVisualStyleBackColor = true;
        //
        // resultList
        //
        resultList.BorderStyle = BorderStyle.None;
        resultList.Dock = DockStyle.Fill;
        resultList.Font = new Font("Cascadia Mono", 9F);
        resultList.FormattingEnabled = true;
        resultList.ItemHeight = 16;
        resultList.Location = new Point(0, 132);
        resultList.Name = "resultList";
        resultList.Size = new Size(680, 380);
        resultList.TabIndex = 0;
        //
        // statusLabel
        //
        statusLabel.BackColor = Color.FromArgb(237, 240, 244);
        statusLabel.Dock = DockStyle.Bottom;
        statusLabel.Font = new Font("Segoe UI", 8.5F);
        statusLabel.ForeColor = Color.FromArgb(96, 102, 112);
        statusLabel.Location = new Point(0, 512);
        statusLabel.Name = "statusLabel";
        statusLabel.Padding = new Padding(10, 6, 10, 6);
        statusLabel.Size = new Size(680, 28);
        statusLabel.TabIndex = 1;
        statusLabel.Text = "검색할 파일 이름 패턴을 입력하세요. (예: *.txt, report*.xlsx)";
        //
        // SearchDialog
        //
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(680, 540);
        Controls.Add(resultList);
        Controls.Add(statusLabel);
        Controls.Add(btnPanel);
        Controls.Add(topPanel);
        MinimumSize = new Size(480, 360);
        Name = "SearchDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "파일 검색";
        topPanel.ResumeLayout(false);
        topPanel.PerformLayout();
        btnPanel.ResumeLayout(false);
        ResumeLayout(false);
    }
}
