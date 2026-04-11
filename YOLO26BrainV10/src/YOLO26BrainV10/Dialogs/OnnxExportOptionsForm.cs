namespace YOLO26BrainV10.Dialogs;

/// <summary>Asks for ONNX opset before running the bundled Ultralytics export script.</summary>
internal sealed class OnnxExportOptionsForm : Form
{
    private readonly NumericUpDown _nudOpset;

    internal OnnxExportOptionsForm()
    {
        Text = "ONNX 변환 옵션";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(14);

        var panel = new TableLayoutPanel
        {
            ColumnCount = 1,
            RowCount = 3,
            AutoSize = true,
        };
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        panel.Controls.Add(new Label
        {
            Text = "ONNX opset (기본 12 — 구형 Runtime과 호환하기 쉬움). Ultralytics·ONNX 버전에 따라 12~17을 권장합니다.",
            AutoSize = true,
            MaximumSize = new Size(420, 0),
        }, 0, 0);

        _nudOpset = new NumericUpDown
        {
            Minimum = 8,
            Maximum = 21,
            Value = 12,
            Width = 72,
        };
        panel.Controls.Add(_nudOpset, 0, 1);

        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        var ok = new Button { Text = "변환 실행", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, AutoSize = true };
        buttons.Controls.Add(ok);
        buttons.Controls.Add(cancel);
        panel.Controls.Add(buttons, 0, 2);

        Controls.Add(panel);
        AcceptButton = ok;
        CancelButton = cancel;
    }

    internal int Opset => (int)_nudOpset.Value;
}
