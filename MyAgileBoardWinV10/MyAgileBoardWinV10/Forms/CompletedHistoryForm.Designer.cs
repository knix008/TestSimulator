namespace MyAgileBoardWinV10.Forms;

partial class CompletedHistoryForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null) components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        tabControl  = new TabControl();
        tabWeekly   = new TabPage();
        tabMonthly  = new TabPage();
        tabYearly   = new TabPage();
        lvWeekly    = BuildListView();
        lvMonthly   = BuildListView();
        lvYearly    = BuildListView();
        lblStatus   = new Label();
        btnClose    = new Button();

        SuspendLayout();
        tabControl.SuspendLayout();

        // tabs
        tabWeekly.Text  = "주간 (Weekly)";
        tabMonthly.Text = "월별 (Monthly)";
        tabYearly.Text  = "연간 (Yearly)";

        tabWeekly.Controls.Add(lvWeekly);
        tabMonthly.Controls.Add(lvMonthly);
        tabYearly.Controls.Add(lvYearly);

        tabControl.Controls.AddRange(new Control[] { tabWeekly, tabMonthly, tabYearly });
        tabControl.Dock = DockStyle.Fill;
        tabControl.Name = "tabControl";
        tabControl.SelectedIndexChanged += new EventHandler(tabControl_SelectedIndexChanged);

        // status label
        lblStatus.Dock      = DockStyle.None;
        lblStatus.AutoSize  = true;
        lblStatus.Location  = new Point(12, 498);
        lblStatus.ForeColor = Color.DimGray;
        lblStatus.Name      = "lblStatus";
        lblStatus.Text      = "";

        // close button
        btnClose.Location             = new Point(640, 492);
        btnClose.Name                 = "btnClose";
        btnClose.Size                 = new Size(80, 28);
        btnClose.Text                 = "닫기";
        btnClose.UseVisualStyleBackColor = true;
        btnClose.Click               += (_, _) => Close();

        // Form
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode       = AutoScaleMode.Font;
        ClientSize          = new Size(740, 532);
        Controls.Add(tabControl);
        Controls.Add(lblStatus);
        Controls.Add(btnClose);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox     = true;
        MinimumSize     = new Size(600, 400);
        Name            = "CompletedHistoryForm";
        StartPosition   = FormStartPosition.CenterParent;
        Text            = "완료된 항목 히스토리";

        tabControl.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }

    private static ListView BuildListView()
    {
        var lv = new ListView
        {
            Dock         = DockStyle.Fill,
            View         = View.Details,
            FullRowSelect = true,
            GridLines    = true,
            ShowGroups   = true,
        };
        lv.Columns.Add("제목",       280);
        lv.Columns.Add("포인트",      60);
        lv.Columns.Add("우선순위",    75);
        lv.Columns.Add("담당자",      90);
        lv.Columns.Add("컬럼",        80);
        lv.Columns.Add("완료일",     130);
        return lv;
    }

    private TabControl tabControl = null!;
    private TabPage    tabWeekly  = null!;
    private TabPage    tabMonthly = null!;
    private TabPage    tabYearly  = null!;
    private ListView   lvWeekly   = null!;
    private ListView   lvMonthly  = null!;
    private ListView   lvYearly   = null!;
    private Label      lblStatus  = null!;
    private Button     btnClose   = null!;
}
