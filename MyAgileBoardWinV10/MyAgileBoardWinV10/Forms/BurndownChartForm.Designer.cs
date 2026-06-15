namespace MyAgileBoardWinV10.Forms;

partial class BurndownChartForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null) components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblStartDate = new Label();
        dtpStart     = new DateTimePicker();
        lblEndDate   = new Label();
        dtpEnd       = new DateTimePicker();
        btnRefresh   = new Button();
        lblSummary   = new Label();
        panelChart   = new Panel();
        btnClose     = new Button();

        SuspendLayout();

        // lblStartDate
        lblStartDate.AutoSize = true;
        lblStartDate.Font     = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblStartDate.Location = new Point(12, 14);
        lblStartDate.Text     = "시작일:";

        // dtpStart
        dtpStart.Format   = DateTimePickerFormat.Short;
        dtpStart.Location = new Point(62, 11);
        dtpStart.Size     = new Size(120, 23);

        // lblEndDate
        lblEndDate.AutoSize = true;
        lblEndDate.Font     = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblEndDate.Location = new Point(196, 14);
        lblEndDate.Text     = "종료일:";

        // dtpEnd
        dtpEnd.Format   = DateTimePickerFormat.Short;
        dtpEnd.Location = new Point(246, 11);
        dtpEnd.Size     = new Size(120, 23);

        // btnRefresh
        btnRefresh.Location             = new Point(380, 9);
        btnRefresh.Size                 = new Size(90, 27);
        btnRefresh.Text                 = "차트 갱신";
        btnRefresh.UseVisualStyleBackColor = true;
        btnRefresh.Click               += new EventHandler(btnRefresh_Click);

        // lblSummary
        lblSummary.AutoSize  = true;
        lblSummary.ForeColor = Color.DimGray;
        lblSummary.Font      = new Font("Segoe UI", 8.5F);
        lblSummary.Location  = new Point(12, 50);
        lblSummary.Text      = "";

        // panelChart
        panelChart.BackColor = Color.White;
        panelChart.BorderStyle = BorderStyle.FixedSingle;
        panelChart.Location = new Point(12, 70);
        panelChart.Size     = new Size(800, 400);
        panelChart.Anchor   = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
        panelChart.Name     = "panelChart";
        panelChart.Paint   += new PaintEventHandler(panelChart_Paint);
        panelChart.Resize  += new EventHandler(panelChart_Resize);

        // btnClose
        btnClose.Anchor                  = AnchorStyles.Bottom | AnchorStyles.Right;
        btnClose.Location                = new Point(740, 484);
        btnClose.Size                    = new Size(80, 28);
        btnClose.Text                    = "닫기";
        btnClose.UseVisualStyleBackColor = true;
        btnClose.Click                  += (_, _) => Close();

        // Form
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode       = AutoScaleMode.Font;
        ClientSize          = new Size(830, 524);
        Controls.AddRange(new Control[]
        {
            lblStartDate, dtpStart, lblEndDate, dtpEnd,
            btnRefresh, lblSummary, panelChart, btnClose
        });
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox     = true;
        MinimumSize     = new Size(600, 450);
        Name            = "BurndownChartForm";
        StartPosition   = FormStartPosition.CenterParent;
        Text            = "Burn Down 차트";

        ResumeLayout(false);
        PerformLayout();
    }

    private Label          lblStartDate = null!;
    private DateTimePicker dtpStart     = null!;
    private Label          lblEndDate   = null!;
    private DateTimePicker dtpEnd       = null!;
    private Button         btnRefresh   = null!;
    private Label          lblSummary   = null!;
    private Panel          panelChart   = null!;
    private Button         btnClose     = null!;
}
