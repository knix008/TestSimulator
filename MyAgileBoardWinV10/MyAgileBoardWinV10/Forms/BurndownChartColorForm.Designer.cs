namespace MyAgileBoardWinV10.Forms;

partial class BurndownChartColorForm
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
        layout = new TableLayoutPanel();
        lblDailyBar = new Label();
        swatchDailyBar = new Panel();
        btnPickDailyBar = new Button();
        lblIdealLine = new Label();
        swatchIdealLine = new Panel();
        btnPickIdealLine = new Button();
        lblRemainingLine = new Label();
        swatchRemainingLine = new Panel();
        btnPickRemainingLine = new Button();
        bottom = new TableLayoutPanel();
        btnReset = new Button();
        buttons = new FlowLayoutPanel();
        btnOk = new Button();
        btnCancel = new Button();
        layout.SuspendLayout();
        bottom.SuspendLayout();
        buttons.SuspendLayout();
        SuspendLayout();

        layout.ColumnCount = 3;
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110F));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44F));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layout.Controls.Add(lblDailyBar, 0, 0);
        layout.Controls.Add(swatchDailyBar, 1, 0);
        layout.Controls.Add(btnPickDailyBar, 2, 0);
        layout.Controls.Add(lblIdealLine, 0, 1);
        layout.Controls.Add(swatchIdealLine, 1, 1);
        layout.Controls.Add(btnPickIdealLine, 2, 1);
        layout.Controls.Add(lblRemainingLine, 0, 2);
        layout.Controls.Add(swatchRemainingLine, 1, 2);
        layout.Controls.Add(btnPickRemainingLine, 2, 2);
        layout.Dock = DockStyle.Fill;
        layout.Location = new Point(0, 0);
        layout.Name = "layout";
        layout.Padding = new Padding(12);
        layout.RowCount = 3;
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        layout.Size = new Size(360, 176);
        layout.TabIndex = 0;

        lblDailyBar.Dock = DockStyle.Fill;
        lblDailyBar.Location = new Point(15, 12);
        lblDailyBar.Name = "lblDailyBar";
        lblDailyBar.Size = new Size(104, 40);
        lblDailyBar.TabIndex = 0;
        lblDailyBar.Text = "일별 완료 막대";
        lblDailyBar.TextAlign = ContentAlignment.MiddleLeft;

        swatchDailyBar.BorderStyle = BorderStyle.FixedSingle;
        swatchDailyBar.Cursor = Cursors.Hand;
        swatchDailyBar.Location = new Point(122, 20);
        swatchDailyBar.Margin = new Padding(4, 8, 4, 8);
        swatchDailyBar.Name = "swatchDailyBar";
        swatchDailyBar.Size = new Size(32, 24);
        swatchDailyBar.TabIndex = 1;
        swatchDailyBar.Click += swatchDailyBar_Click;

        btnPickDailyBar.Anchor = AnchorStyles.Left;
        btnPickDailyBar.AutoSize = true;
        btnPickDailyBar.Location = new Point(169, 18);
        btnPickDailyBar.Name = "btnPickDailyBar";
        btnPickDailyBar.Size = new Size(75, 25);
        btnPickDailyBar.TabIndex = 2;
        btnPickDailyBar.Text = "색 선택...";
        btnPickDailyBar.UseVisualStyleBackColor = true;
        btnPickDailyBar.Click += btnPickDailyBar_Click;

        lblIdealLine.Dock = DockStyle.Fill;
        lblIdealLine.Location = new Point(15, 52);
        lblIdealLine.Name = "lblIdealLine";
        lblIdealLine.Size = new Size(104, 40);
        lblIdealLine.TabIndex = 3;
        lblIdealLine.Text = "이상 소진선";
        lblIdealLine.TextAlign = ContentAlignment.MiddleLeft;

        swatchIdealLine.BorderStyle = BorderStyle.FixedSingle;
        swatchIdealLine.Cursor = Cursors.Hand;
        swatchIdealLine.Location = new Point(122, 60);
        swatchIdealLine.Margin = new Padding(4, 8, 4, 8);
        swatchIdealLine.Name = "swatchIdealLine";
        swatchIdealLine.Size = new Size(32, 24);
        swatchIdealLine.TabIndex = 4;
        swatchIdealLine.Click += swatchIdealLine_Click;

        btnPickIdealLine.Anchor = AnchorStyles.Left;
        btnPickIdealLine.AutoSize = true;
        btnPickIdealLine.Location = new Point(169, 58);
        btnPickIdealLine.Name = "btnPickIdealLine";
        btnPickIdealLine.Size = new Size(75, 25);
        btnPickIdealLine.TabIndex = 5;
        btnPickIdealLine.Text = "색 선택...";
        btnPickIdealLine.UseVisualStyleBackColor = true;
        btnPickIdealLine.Click += btnPickIdealLine_Click;

        lblRemainingLine.Dock = DockStyle.Fill;
        lblRemainingLine.Location = new Point(15, 92);
        lblRemainingLine.Name = "lblRemainingLine";
        lblRemainingLine.Size = new Size(104, 40);
        lblRemainingLine.TabIndex = 6;
        lblRemainingLine.Text = "실제 잔여량";
        lblRemainingLine.TextAlign = ContentAlignment.MiddleLeft;

        swatchRemainingLine.BorderStyle = BorderStyle.FixedSingle;
        swatchRemainingLine.Cursor = Cursors.Hand;
        swatchRemainingLine.Location = new Point(122, 100);
        swatchRemainingLine.Margin = new Padding(4, 8, 4, 8);
        swatchRemainingLine.Name = "swatchRemainingLine";
        swatchRemainingLine.Size = new Size(32, 24);
        swatchRemainingLine.TabIndex = 7;
        swatchRemainingLine.Click += swatchRemainingLine_Click;

        btnPickRemainingLine.Anchor = AnchorStyles.Left;
        btnPickRemainingLine.AutoSize = true;
        btnPickRemainingLine.Location = new Point(169, 98);
        btnPickRemainingLine.Name = "btnPickRemainingLine";
        btnPickRemainingLine.Size = new Size(75, 25);
        btnPickRemainingLine.TabIndex = 8;
        btnPickRemainingLine.Text = "색 선택...";
        btnPickRemainingLine.UseVisualStyleBackColor = true;
        btnPickRemainingLine.Click += btnPickRemainingLine_Click;

        bottom.ColumnCount = 2;
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        bottom.Controls.Add(btnReset, 0, 0);
        bottom.Controls.Add(buttons, 1, 0);
        bottom.Dock = DockStyle.Bottom;
        bottom.Location = new Point(0, 176);
        bottom.Name = "bottom";
        bottom.Padding = new Padding(12, 0, 12, 12);
        bottom.RowCount = 1;
        bottom.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        bottom.Size = new Size(360, 44);
        bottom.TabIndex = 1;

        btnReset.Anchor = AnchorStyles.Left;
        btnReset.AutoSize = true;
        btnReset.Location = new Point(15, 3);
        btnReset.Name = "btnReset";
        btnReset.Size = new Size(111, 25);
        btnReset.TabIndex = 0;
        btnReset.Text = "기본값으로 재설정";
        btnReset.UseVisualStyleBackColor = true;
        btnReset.Click += btnReset_Click;

        buttons.Controls.Add(btnOk);
        buttons.Controls.Add(btnCancel);
        buttons.Dock = DockStyle.Fill;
        buttons.FlowDirection = FlowDirection.RightToLeft;
        buttons.Location = new Point(183, 3);
        buttons.Name = "buttons";
        buttons.Size = new Size(162, 29);
        buttons.TabIndex = 1;
        buttons.WrapContents = false;

        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(82, 0);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(80, 25);
        btnOk.TabIndex = 0;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(0, 0);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(80, 25);
        btnCancel.TabIndex = 1;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;

        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(360, 220);
        Controls.Add(layout);
        Controls.Add(bottom);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "BurndownChartColorForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Burn Down 차트 색상";

        layout.ResumeLayout(false);
        layout.PerformLayout();
        bottom.ResumeLayout(false);
        bottom.PerformLayout();
        buttons.ResumeLayout(false);
        ResumeLayout(false);
    }

    private TableLayoutPanel layout = null!;
    private Label lblDailyBar = null!;
    private Panel swatchDailyBar = null!;
    private Button btnPickDailyBar = null!;
    private Label lblIdealLine = null!;
    private Panel swatchIdealLine = null!;
    private Button btnPickIdealLine = null!;
    private Label lblRemainingLine = null!;
    private Panel swatchRemainingLine = null!;
    private Button btnPickRemainingLine = null!;
    private TableLayoutPanel bottom = null!;
    private Button btnReset = null!;
    private FlowLayoutPanel buttons = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;
}
