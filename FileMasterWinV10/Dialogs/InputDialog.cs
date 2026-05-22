using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public class InputDialog : Form
{
    private readonly TextBox _inputBox;
    public string InputText => _inputBox.Text;

    public InputDialog(string title, string label, string defaultText = "")
    {
        Text = title;
        Size = new Size(420, 160);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        UiTheme.ApplyForm(this);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 3,
            Padding = new Padding(16),
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var lbl = new Label
        {
            Text = label,
            AutoSize = true,
            Margin = new Padding(0, 0, 12, 8),
            ForeColor = UiTheme.TextPrimary,
        };
        _inputBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Text = defaultText,
            Margin = new Padding(0, 0, 0, 12),
        };
        _inputBox.SelectAll();

        var btnFlow = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 4, 0, 0),
        };
        var ok = new Button { Text = "확인", DialogResult = DialogResult.OK, Width = 88, Height = 32 };
        var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Width = 88, Height = 32, Margin = new Padding(0, 0, 8, 0) };
        UiTheme.StylePrimaryButton(ok);
        UiTheme.StyleSecondaryButton(cancel);

        layout.SetColumnSpan(lbl, 2);
        layout.Controls.Add(lbl, 0, 0);
        layout.SetColumnSpan(_inputBox, 2);
        layout.Controls.Add(_inputBox, 0, 1);
        layout.SetColumnSpan(btnFlow, 2);
        btnFlow.Controls.AddRange(new Control[] { ok, cancel });
        layout.Controls.Add(btnFlow, 0, 2);

        AcceptButton = ok;
        CancelButton = cancel;
        Controls.Add(layout);
    }
}
