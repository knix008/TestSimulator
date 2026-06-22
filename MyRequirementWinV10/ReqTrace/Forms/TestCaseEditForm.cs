using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class TestCaseEditForm : Form
{
    private readonly TestCase? _existing;
    private readonly List<string> _existingTestCaseCodes;

    public TestCase Result { get; private set; } = new();

    public TestCaseEditForm(TestCase? existing, IEnumerable<string>? existingTestCaseCodes = null)
    {
        _existing = existing;
        _existingTestCaseCodes = existingTestCaseCodes?
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .ToList() ?? [];
        InitializeComponent();
        InitializeStepsGrid();

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyStepsGridBorder();
        ConfigureStepsGridEditing();
        ConfigureStepsGridRowSizing();
        ApplyLocalization();
        AdjustLayout();

        if (existing is not null)
        {
            txtCode.Text = existing.Code;
            txtTitle.Text = existing.Title;
            txtPreconditions.Text = existing.Preconditions;
            txtExpectedResult.Text = existing.ExpectedResult;
            foreach (var step in existing.Steps.OrderBy(s => s.Order))
                stepsGrid.Rows.Add(null, step.Action, step.ExpectedOutcome);
            RefreshStepNumbers();
            ResizeAllStepRows();
        }
        else
        {
            txtCode.Text = TestCaseCodeAllocator.PreviewNextCode(_existingTestCaseCodes);
            AddStepRow();
        }

        stepsGrid.RowsAdded += (_, e) =>
        {
            RefreshStepNumbers();
            if (e.RowIndex >= 0)
            {
                stepsGrid.AutoResizeRow(e.RowIndex, DataGridViewAutoSizeRowMode.AllCells);
                if (!stepsGrid.Rows[e.RowIndex].IsNewRow)
                    ApplyStepRowCellAlignment(stepsGrid.Rows[e.RowIndex]);
            }
        };
        stepsGrid.RowsRemoved += (_, _) => RefreshStepNumbers();
    }

    private void InitializeStepsGrid()
    {
        stepsGrid.Columns.Clear();

        var orderColumn = new DataGridViewTextBoxColumn
        {
            Name = "Order",
            HeaderText = Loc.T("Col_Steps"),
            ReadOnly = true,
            Width = 48,
            MinimumWidth = 40,
            FillWeight = 20,
            SortMode = DataGridViewColumnSortMode.NotSortable,
            DefaultCellStyle =
            {
                Alignment = DataGridViewContentAlignment.MiddleCenter,
                WrapMode = DataGridViewTriState.False
            }
        };
        stepsGrid.Columns.Add(orderColumn);

        var actionColumn = new DataGridViewTextBoxColumn
        {
            Name = "Action",
            HeaderText = Loc.T("Col_Action"),
            FillWeight = 40,
            SortMode = DataGridViewColumnSortMode.NotSortable,
            DefaultCellStyle =
            {
                Alignment = DataGridViewContentAlignment.TopLeft,
                WrapMode = DataGridViewTriState.True
            }
        };
        stepsGrid.Columns.Add(actionColumn);

        var outcomeColumn = new DataGridViewTextBoxColumn
        {
            Name = "ExpectedOutcome",
            HeaderText = Loc.T("Col_ExpectedOutcome"),
            FillWeight = 40,
            SortMode = DataGridViewColumnSortMode.NotSortable,
            DefaultCellStyle =
            {
                Alignment = DataGridViewContentAlignment.TopLeft,
                WrapMode = DataGridViewTriState.True
            }
        };
        stepsGrid.Columns.Add(outcomeColumn);
    }

    private void ApplyStepsGridBorder()
    {
        stepsGrid.BorderStyle = BorderStyle.FixedSingle;
        stepsGrid.CellBorderStyle = DataGridViewCellBorderStyle.Single;
        stepsGrid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
        stepsGrid.GridColor = ModernTheme.Border;
    }

    private void ConfigureStepsGridEditing()
    {
        stepsGrid.EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2;
        stepsGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        stepsGrid.MultiSelect = true;
        stepsGrid.StandardTab = true;

        stepsGrid.DefaultCellStyle.SelectionBackColor = ModernTheme.SelectionBack;
        stepsGrid.DefaultCellStyle.SelectionForeColor = ModernTheme.SelectionFore;
        stepsGrid.DefaultCellStyle.Alignment = DataGridViewContentAlignment.TopLeft;
        stepsGrid.RowsDefaultCellStyle.SelectionBackColor = ModernTheme.SelectionBack;
        stepsGrid.RowsDefaultCellStyle.SelectionForeColor = ModernTheme.SelectionFore;
        stepsGrid.RowsDefaultCellStyle.Alignment = DataGridViewContentAlignment.TopLeft;
        stepsGrid.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;

        foreach (DataGridViewColumn column in stepsGrid.Columns)
        {
            column.SortMode = DataGridViewColumnSortMode.NotSortable;
            column.DefaultCellStyle.SelectionBackColor = ModernTheme.SelectionBack;
            column.DefaultCellStyle.SelectionForeColor = ModernTheme.SelectionFore;
            column.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleCenter;
        }

        stepsGrid.Columns[0].DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        stepsGrid.Columns[0].DefaultCellStyle.WrapMode = DataGridViewTriState.False;

        stepsGrid.CellFormatting += OnStepsGridCellFormatting;
        stepsGrid.CellDoubleClick += OnStepsGridCellDoubleClick;
    }

    private void OnStepsGridCellFormatting(object? sender, DataGridViewCellFormattingEventArgs e)
    {
        if (e.ColumnIndex != 0 || e.RowIndex < 0)
            return;

        if (stepsGrid.Rows[e.RowIndex].IsNewRow)
            return;

        e.CellStyle!.Alignment = DataGridViewContentAlignment.MiddleCenter;
        e.CellStyle.WrapMode = DataGridViewTriState.False;
    }

    private void ConfigureStepsGridRowSizing()
    {
        stepsGrid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCells;
        stepsGrid.RowTemplate.MinimumHeight = 28;
        stepsGrid.Columns[0].DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        stepsGrid.RowTemplate.DefaultCellStyle.Alignment = DataGridViewContentAlignment.TopLeft;
        stepsGrid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;

        foreach (DataGridViewColumn column in stepsGrid.Columns)
        {
            if (column.Index > 0)
                column.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        }

        stepsGrid.CellEndEdit += (_, e) =>
        {
            if (e.RowIndex >= 0)
            {
                stepsGrid.AutoResizeRow(e.RowIndex, DataGridViewAutoSizeRowMode.AllCells);
                if (!stepsGrid.Rows[e.RowIndex].IsNewRow)
                    ApplyStepRowCellAlignment(stepsGrid.Rows[e.RowIndex]);
            }
        };

        stepsGrid.EditingControlShowing += OnStepsGridEditingControlShowing;
    }

    private void OnStepsGridEditingControlShowing(object? sender, DataGridViewEditingControlShowingEventArgs e)
    {
        if (stepsGrid.CurrentCell?.ColumnIndex is not (> 0))
            return;

        if (e.Control is not TextBox textBox)
            return;

        textBox.Multiline = true;
        textBox.AcceptsReturn = true;
        textBox.WordWrap = true;
        textBox.ScrollBars = ScrollBars.None;
        textBox.BorderStyle = BorderStyle.None;
    }

    private void ResizeAllStepRows()
    {
        if (stepsGrid.Rows.Count == 0)
            return;

        stepsGrid.AutoResizeRows(DataGridViewAutoSizeRowsMode.AllCells);
        foreach (DataGridViewRow row in stepsGrid.Rows)
        {
            if (!row.IsNewRow)
                ApplyStepRowCellAlignment(row);
        }
    }

    private void OnStepsGridCellDoubleClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (e.RowIndex < 0 || e.ColumnIndex < 1)
            return;

        var cell = stepsGrid.Rows[e.RowIndex].Cells[e.ColumnIndex];
        if (cell.ReadOnly)
            return;

        stepsGrid.CurrentCell = cell;
        stepsGrid.BeginEdit(true);
    }

    private void RefreshStepNumbers()
    {
        var stepNumber = 1;
        foreach (DataGridViewRow row in stepsGrid.Rows)
        {
            if (row.IsNewRow)
                continue;
            row.Cells[0].Value = stepNumber.ToString();
            ApplyStepRowCellAlignment(row);
            stepNumber++;
        }
    }

    private static void ApplyStepRowCellAlignment(DataGridViewRow row)
    {
        row.Cells[0].Style.Alignment = DataGridViewContentAlignment.MiddleCenter;
        row.Cells[0].Style.WrapMode = DataGridViewTriState.False;
        row.Cells[1].Style.Alignment = DataGridViewContentAlignment.TopLeft;
        row.Cells[2].Style.Alignment = DataGridViewContentAlignment.TopLeft;
    }

    private void ApplyLocalization()
    {
        Text = _existing is null ? Loc.T("Dlg_AddTestCase") : Loc.T("Dlg_EditTestCase");
        lblCode.Text = Loc.T("TcEdit_Code");
        lblTitle.Text = Loc.T("TcEdit_Title");
        lblPreconditions.Text = Loc.T("TcEdit_Preconditions");
        lblExpectedResult.Text = Loc.T("TcEdit_ExpectedResult");
        lblSteps.Text = Loc.T("TcEdit_Steps");
        btnAddStep.Text = Loc.T("TcEdit_AddStep");
        btnRemoveStep.Text = Loc.T("TcEdit_RemoveStep");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");

        if (stepsGrid.Columns.Count >= 3)
        {
            stepsGrid.Columns[0].HeaderText = Loc.T("Col_Steps");
            stepsGrid.Columns[1].HeaderText = Loc.T("Col_Action");
            stepsGrid.Columns[2].HeaderText = Loc.T("Col_ExpectedOutcome");
        }
    }

    private void AdjustLayout()
    {
        var labels = new[] { lblCode, lblTitle, lblPreconditions, lblExpectedResult, lblSteps };
        var labelColumnWidth = labels.Max(l => TextRenderer.MeasureText(l.Text, Font).Width) + 24;
        layoutTable.ColumnStyles[0].Width = Math.Max(110, labelColumnWidth);

        var lineHeight = TextRenderer.MeasureText("Ay", Font).Height + 12;
        layoutTable.RowStyles[0].Height = lineHeight;
        layoutTable.RowStyles[1].Height = lineHeight;
        layoutTable.RowStyles[2].Height = lineHeight * 3;
        layoutTable.RowStyles[3].Height = lineHeight * 3;
        layoutTable.RowStyles[4].Height = lineHeight;

        foreach (var label in labels)
        {
            label.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            label.Margin = new Padding(3, 6, 3, 3);
        }

        panelButtons.Height = Math.Max(panelButtons.Height, btnOk.Height + 20);
        AlignStepToolbarButtons();
        MinimumSize = new Size((int)layoutTable.ColumnStyles[0].Width + 420, 520);
        ClientSize = new Size(Math.Max(ClientSize.Width, MinimumSize.Width), Math.Max(ClientSize.Height, MinimumSize.Height));
    }

    private void AlignStepToolbarButtons()
    {
        const int gap = 8;
        const int horizontalPadding = 16;
        var buttonHeight = Math.Max(btnOk.Height, 28);

        var addWidth = TextRenderer.MeasureText(btnAddStep.Text, btnAddStep.Font).Width + horizontalPadding;
        var removeWidth = TextRenderer.MeasureText(btnRemoveStep.Text, btnRemoveStep.Font).Width + horizontalPadding;

        btnAddStep.AutoSize = false;
        btnRemoveStep.AutoSize = false;
        btnAddStep.Size = new Size(addWidth, buttonHeight);
        btnRemoveStep.Size = new Size(removeWidth, buttonHeight);
        btnAddStep.Location = new Point(0, 0);
        btnRemoveStep.Location = new Point(btnAddStep.Right + gap, 0);

        stepsToolbar.Height = buttonHeight + stepsToolbar.Padding.Bottom;
    }

    private void btnAddStep_Click(object? sender, EventArgs e) => AddStepRow();

    private void AddStepRow()
    {
        var rowIndex = stepsGrid.Rows.Add(null, string.Empty, string.Empty);
        RefreshStepNumbers();
        stepsGrid.CurrentCell = stepsGrid.Rows[rowIndex].Cells[1];
        stepsGrid.BeginEdit(true);
        ResizeAllStepRows();
    }

    private void btnRemoveStep_Click(object? sender, EventArgs e)
    {
        var rowsToRemove = stepsGrid.SelectedRows.Cast<DataGridViewRow>()
            .Where(row => !row.IsNewRow)
            .ToList();

        if (rowsToRemove.Count == 0 && stepsGrid.CurrentRow is { IsNewRow: false } currentRow)
            rowsToRemove.Add(currentRow);

        foreach (var row in rowsToRemove)
            stepsGrid.Rows.Remove(row);

        RefreshStepNumbers();
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
        {
            var (usedCodes, nextSequence) = TestCaseCodeAllocator.CreateState(_existingTestCaseCodes);
            Result.Code = TestCaseCodeAllocator.AllocateNext(usedCodes, ref nextSequence);
        }
        Result.Title = txtTitle.Text.Trim();
        Result.Preconditions = txtPreconditions.Text.Trim();
        Result.ExpectedResult = txtExpectedResult.Text.Trim();

        Result.Steps.Clear();
        var order = 1;
        foreach (DataGridViewRow row in stepsGrid.Rows)
        {
            if (row.IsNewRow)
                continue;
            var action = row.Cells[1].Value?.ToString() ?? string.Empty;
            var outcome = row.Cells[2].Value?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(action) && string.IsNullOrWhiteSpace(outcome))
                continue;
            Result.Steps.Add(new TestStep { Order = order++, Action = action, ExpectedOutcome = outcome });
        }
    }
}
