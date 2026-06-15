namespace MyAgileBoardWinV10.Forms;

partial class SummaryForm
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
        tabControl = new TabControl();
        tabOverview = new TabPage();
        tabPieChart = new TabPage();
        tabBarChart = new TabPage();

        // Overview controls
        grpSummary = new GroupBox();
        lblTotalCards = new Label();
        lblDoneCards = new Label();
        lblRemainingCards = new Label();
        lblOverdue = new Label();
        grpColumnStats = new GroupBox();
        panelColumnStats = new Panel();
        grpPriorityStats = new GroupBox();
        panelPriorityStats = new Panel();

        // Chart panels
        panelPieChart = new Panel();
        panelBarChart = new Panel();

        // Buttons
        btnRefresh = new Button();
        btnClose = new Button();

        tabControl.SuspendLayout();
        tabOverview.SuspendLayout();
        tabPieChart.SuspendLayout();
        tabBarChart.SuspendLayout();
        grpSummary.SuspendLayout();
        grpColumnStats.SuspendLayout();
        grpPriorityStats.SuspendLayout();
        SuspendLayout();

        // tabControl
        tabControl.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        tabControl.Controls.AddRange(new TabPage[] { tabOverview, tabPieChart, tabBarChart });
        tabControl.Location = new Point(12, 12);
        tabControl.Name = "tabControl";
        tabControl.Size = new Size(760, 460);
        tabControl.TabIndex = 0;

        // tabOverview
        tabOverview.Controls.AddRange(new Control[] { grpSummary, grpColumnStats, grpPriorityStats });
        tabOverview.Name = "tabOverview";
        tabOverview.Padding = new Padding(6);
        tabOverview.Text = "개요";

        // grpSummary
        grpSummary.Controls.AddRange(new Control[] { lblTotalCards, lblDoneCards, lblRemainingCards, lblOverdue });
        grpSummary.Location = new Point(6, 6);
        grpSummary.Name = "grpSummary";
        grpSummary.Size = new Size(360, 90);
        grpSummary.Text = "요약";

        // lblTotalCards
        lblTotalCards.AutoSize = true;
        lblTotalCards.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        lblTotalCards.Location = new Point(10, 22);
        lblTotalCards.Name = "lblTotalCards";
        lblTotalCards.Text = "전체 카드: 0개";

        // lblDoneCards
        lblDoneCards.AutoSize = true;
        lblDoneCards.Font = new Font("Segoe UI", 9F);
        lblDoneCards.ForeColor = Color.SeaGreen;
        lblDoneCards.Location = new Point(10, 46);
        lblDoneCards.Name = "lblDoneCards";
        lblDoneCards.Text = "완료: 0개";

        // lblRemainingCards
        lblRemainingCards.AutoSize = true;
        lblRemainingCards.Font = new Font("Segoe UI", 9F);
        lblRemainingCards.Location = new Point(180, 46);
        lblRemainingCards.Name = "lblRemainingCards";
        lblRemainingCards.Text = "진행중/대기: 0개";

        // lblOverdue
        lblOverdue.AutoSize = true;
        lblOverdue.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblOverdue.Location = new Point(10, 66);
        lblOverdue.Name = "lblOverdue";
        lblOverdue.Text = "기한 초과: 0개";

        // grpColumnStats
        grpColumnStats.Controls.Add(panelColumnStats);
        grpColumnStats.Location = new Point(6, 106);
        grpColumnStats.Name = "grpColumnStats";
        grpColumnStats.Size = new Size(360, 310);
        grpColumnStats.Text = "컬럼별 카드 수";

        // panelColumnStats
        panelColumnStats.AutoScroll = true;
        panelColumnStats.Dock = DockStyle.Fill;
        panelColumnStats.Name = "panelColumnStats";
        panelColumnStats.Padding = new Padding(4);

        // grpPriorityStats
        grpPriorityStats.Controls.Add(panelPriorityStats);
        grpPriorityStats.Location = new Point(378, 6);
        grpPriorityStats.Name = "grpPriorityStats";
        grpPriorityStats.Size = new Size(360, 410);
        grpPriorityStats.Text = "우선순위별 카드 수";

        // panelPriorityStats
        panelPriorityStats.AutoScroll = true;
        panelPriorityStats.Dock = DockStyle.Fill;
        panelPriorityStats.Name = "panelPriorityStats";
        panelPriorityStats.Padding = new Padding(4);

        // tabPieChart
        tabPieChart.Controls.Add(panelPieChart);
        tabPieChart.Name = "tabPieChart";
        tabPieChart.Padding = new Padding(6);
        tabPieChart.Text = "컬럼별 분포 (파이 차트)";

        // panelPieChart
        panelPieChart.Dock = DockStyle.Fill;
        panelPieChart.Name = "panelPieChart";
        panelPieChart.Paint += new PaintEventHandler(panelPieChart_Paint);

        // tabBarChart
        tabBarChart.Controls.Add(panelBarChart);
        tabBarChart.Name = "tabBarChart";
        tabBarChart.Padding = new Padding(6);
        tabBarChart.Text = "우선순위별 분포 (막대 차트)";

        // panelBarChart
        panelBarChart.Dock = DockStyle.Fill;
        panelBarChart.Name = "panelBarChart";
        panelBarChart.Paint += new PaintEventHandler(panelBarChart_Paint);

        // btnRefresh
        btnRefresh.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnRefresh.Location = new Point(12, 482);
        btnRefresh.Name = "btnRefresh";
        btnRefresh.Size = new Size(80, 28);
        btnRefresh.Text = "새로고침";
        btnRefresh.Click += new EventHandler(btnRefresh_Click);

        // btnClose
        btnClose.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        btnClose.Location = new Point(698, 482);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(75, 28);
        btnClose.Text = "닫기";
        btnClose.Click += new EventHandler(btnClose_Click);

        // SummaryForm
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(784, 522);
        Controls.AddRange(new Control[] { tabControl, btnRefresh, btnClose });
        MinimumSize = new Size(600, 400);
        Name = "SummaryForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Summary";

        tabControl.ResumeLayout(false);
        tabOverview.ResumeLayout(false);
        tabPieChart.ResumeLayout(false);
        tabBarChart.ResumeLayout(false);
        grpSummary.ResumeLayout(false);
        grpSummary.PerformLayout();
        grpColumnStats.ResumeLayout(false);
        grpPriorityStats.ResumeLayout(false);
        ResumeLayout(false);
    }

    private TabControl tabControl = null!;
    private TabPage tabOverview = null!;
    private TabPage tabPieChart = null!;
    private TabPage tabBarChart = null!;
    private GroupBox grpSummary = null!;
    private Label lblTotalCards = null!;
    private Label lblDoneCards = null!;
    private Label lblRemainingCards = null!;
    private Label lblOverdue = null!;
    private GroupBox grpColumnStats = null!;
    private Panel panelColumnStats = null!;
    private GroupBox grpPriorityStats = null!;
    private Panel panelPriorityStats = null!;
    private Panel panelPieChart = null!;
    private Panel panelBarChart = null!;
    private Button btnRefresh = null!;
    private Button btnClose = null!;
}
