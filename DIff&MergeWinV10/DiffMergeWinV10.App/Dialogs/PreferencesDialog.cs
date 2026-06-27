using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App.Dialogs;

/// <summary>
/// Central place to view/edit the app's settings (pane font size, word wrap) and to
/// clear the remembered last session.
/// </summary>
public sealed class PreferencesDialog : Form
{
    private readonly AppSettings _settings;
    private readonly NumericUpDown _fontSize = new() { Minimum = 7, Maximum = 18, DecimalPlaces = 1, Increment = 0.5m, Width = 80 };
    private readonly CheckBox _wordWrap = new() { Text = "Word wrap in source/result panes", AutoSize = true };
    private readonly Button _forgetSession = new() { Text = "Forget Last Session", AutoSize = true };
    private bool _sessionForgotten;

    public PreferencesDialog(AppSettings settings)
    {
        _settings = settings;
        Text = "Preferences";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Width = 380;
        Height = 220;

        _fontSize.Value = (decimal)settings.PaneFontSize;
        _wordWrap.Checked = settings.WordWrap;

        var layout = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, AutoSize = true, Padding = new Padding(12) };
        layout.Controls.Add(new Label { Text = "Pane font size:", AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 8, 6) }, 0, 0);
        layout.Controls.Add(_fontSize, 1, 0);
        layout.Controls.Add(_wordWrap, 0, 1);
        layout.SetColumnSpan(_wordWrap, 2);

        _forgetSession.Margin = new Padding(12, 12, 12, 0);
        _forgetSession.Click += (_, _) =>
        {
            _sessionForgotten = true;
            _settings.LastSession = null;
            MessageBox.Show(this, "The remembered session will be cleared when you click OK.", "Preferences", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Padding = new Padding(12) };
        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        ok.Click += (_, _) => Apply();
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);

        Controls.Add(layout);
        Controls.Add(_forgetSession);
        Controls.Add(buttons);
        AcceptButton = ok;
        CancelButton = cancel;
    }

    private void Apply()
    {
        _settings.PaneFontSize = (float)_fontSize.Value;
        _settings.WordWrap = _wordWrap.Checked;
        if (_sessionForgotten)
        {
            _settings.LastSession = null;
        }
    }
}
