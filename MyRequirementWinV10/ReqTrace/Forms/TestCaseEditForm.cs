using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class TestCaseEditForm : Form
{
    private readonly TestCase? _existing;

    public TestCase Result { get; private set; } = new();

    public TestCaseEditForm(TestCase? existing)
    {
        _existing = existing;
        InitializeComponent();

        stepsGrid.Columns.Add("Action", Loc.T("Col_Action"));
        stepsGrid.Columns.Add("ExpectedOutcome", Loc.T("Col_ExpectedOutcome"));

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();

        if (existing is not null)
        {
            txtCode.Text = existing.Code;
            txtTitle.Text = existing.Title;
            txtPreconditions.Text = existing.Preconditions;
            txtExpectedResult.Text = existing.ExpectedResult;
            foreach (var step in existing.Steps.OrderBy(s => s.Order))
                stepsGrid.Rows.Add(step.Action, step.ExpectedOutcome);
        }
    }

    private void ApplyLocalization()
    {
        Text = _existing is null ? Loc.T("Dlg_AddTestCase") : Loc.T("Dlg_EditTestCase");
        lblCode.Text = Loc.T("TcEdit_Code");
        lblTitle.Text = Loc.T("TcEdit_Title");
        lblPreconditions.Text = Loc.T("TcEdit_Preconditions");
        lblExpectedResult.Text = Loc.T("TcEdit_ExpectedResult");
        lblSteps.Text = Loc.T("TcEdit_Steps");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");

        if (stepsGrid.Columns.Count >= 2)
        {
            stepsGrid.Columns[0].HeaderText = Loc.T("Col_Action");
            stepsGrid.Columns[1].HeaderText = Loc.T("Col_ExpectedOutcome");
        }
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtTitle.Text))
        {
            MessageBox.Show(this, Loc.T("Msg_TitleRequired"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
            return;
        }

        Result = _existing ?? new TestCase();
        Result.Code = string.IsNullOrWhiteSpace(txtCode.Text) ? Result.Code : txtCode.Text.Trim();
        if (string.IsNullOrWhiteSpace(Result.Code))
            Result.Code = "TC-" + Guid.NewGuid().ToString()[..6].ToUpperInvariant();
        Result.Title = txtTitle.Text.Trim();
        Result.Preconditions = txtPreconditions.Text.Trim();
        Result.ExpectedResult = txtExpectedResult.Text.Trim();

        Result.Steps.Clear();
        var order = 1;
        foreach (DataGridViewRow row in stepsGrid.Rows)
        {
            if (row.IsNewRow)
                continue;
            var action = row.Cells[0].Value?.ToString() ?? string.Empty;
            var outcome = row.Cells[1].Value?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(action) && string.IsNullOrWhiteSpace(outcome))
                continue;
            Result.Steps.Add(new TestStep { Order = order++, Action = action, ExpectedOutcome = outcome });
        }
    }
}
