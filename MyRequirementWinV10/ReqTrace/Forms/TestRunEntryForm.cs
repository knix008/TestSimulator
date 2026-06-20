using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class TestRunEntryForm : Form
{
    private readonly TestCase _testCase;

    public TestRun Result { get; private set; } = new();

    public TestRunEntryForm(TestCase testCase)
    {
        _testCase = testCase;
        InitializeComponent();

        cboStatus.Items.Clear();
        foreach (TestRunStatus status in Enum.GetValues<TestRunStatus>())
            cboStatus.Items.Add(Loc.Enum(status));
        cboStatus.SelectedIndex = Array.IndexOf(Enum.GetValues<TestRunStatus>(), TestRunStatus.Pass);
        txtExecutedBy.Text = Environment.UserName;

        foreach (var run in testCase.Runs.OrderByDescending(r => r.ExecutedUtc))
            historyList.Items.Add($"{run.ExecutedUtc.ToLocalTime():yyyy-MM-dd HH:mm} — {Loc.Enum(run.Status)} — {run.ExecutedBy} — {run.Notes}");

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();
        AdjustLayout();
    }

    private void AdjustLayout()
    {
        var labels = new[] { lblStatus, lblExecutedBy, lblExecutedAt, lblBuild, lblNotes, lblRunHistory };
        var labelColumnWidth = labels.Max(l => TextRenderer.MeasureText(l.Text, Font).Width) + 24;
        layoutTable.ColumnStyles[0].Width = Math.Max(130, labelColumnWidth);

        var lineHeight = TextRenderer.MeasureText("Ay", Font).Height + 12;
        layoutTable.RowStyles[0].Height = lineHeight;
        layoutTable.RowStyles[1].Height = lineHeight;
        layoutTable.RowStyles[2].Height = lineHeight;
        layoutTable.RowStyles[3].Height = lineHeight;
        layoutTable.RowStyles[4].Height = lineHeight * 3;
        layoutTable.RowStyles[5].Height = lineHeight;

        foreach (var label in labels)
        {
            label.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            label.Margin = new Padding(3, 6, 3, 3);
        }

        panelButtons.Height = Math.Max(panelButtons.Height, btnOk.Height + 20);
        MinimumSize = new Size((int)layoutTable.ColumnStyles[0].Width + 380, 420);
        ClientSize = new Size(Math.Max(ClientSize.Width, MinimumSize.Width), Math.Max(ClientSize.Height, MinimumSize.Height));
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_RecordTestRun", _testCase.Code);
        lblStatus.Text = Loc.T("RunEdit_Status");
        lblExecutedBy.Text = Loc.T("RunEdit_ExecutedBy");
        lblExecutedAt.Text = Loc.T("RunEdit_ExecutedAt");
        lblBuild.Text = Loc.T("RunEdit_Build");
        lblNotes.Text = Loc.T("RunEdit_Notes");
        lblRunHistory.Text = Loc.T("RunEdit_History");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        Result = new TestRun
        {
            Status = (TestRunStatus)cboStatus.SelectedIndex,
            ExecutedBy = txtExecutedBy.Text.Trim(),
            ExecutedUtc = dtExecuted.Value.ToUniversalTime(),
            BuildOrVersion = txtBuild.Text.Trim(),
            Notes = txtNotes.Text.Trim()
        };
    }
}
