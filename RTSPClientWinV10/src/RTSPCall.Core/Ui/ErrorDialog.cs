using System.Text;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Ui;

/// <summary>
/// Error popup with full details and clipboard copy.
/// Detail text always uses dark-on-light (not theme-inverted) for readability.
/// </summary>
public sealed class ErrorDialog : Form
{
    private readonly TextBox _txt;
    private readonly Button _btnCopy;
    private readonly Button _btnClose;
    private readonly Label _lblHint;
    private readonly UiStrings _s;

    private ErrorDialog(string title, string details, UiStrings strings)
    {
        _s = strings;
        Text = title;
        StartPosition = FormStartPosition.CenterParent;
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(520, 360);
        ClientSize = new Size(720, 480);
        BackColor = Color.FromArgb(245, 247, 250);
        ForeColor = Color.FromArgb(28, 32, 38);
        Font = new Font("Segoe UI", 9F);

        _lblHint = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 28,
            Padding = new Padding(12, 8, 12, 0),
            Text = strings.ErrorDetails,
            ForeColor = Color.FromArgb(28, 32, 38)
        };

        _txt = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new Font("Consolas", 9F),
            // Keep detail content dark-on-light regardless of app theme.
            BackColor = Color.White,
            ForeColor = Color.FromArgb(20, 22, 26),
            Dock = DockStyle.Fill,
            Text = details
        };

        var buttons = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 52,
            Padding = new Padding(12, 10, 12, 10)
        };

        _btnClose = new Button
        {
            Text = strings.Close,
            Width = 96,
            Height = 30,
            Anchor = AnchorStyles.Right | AnchorStyles.Top,
            DialogResult = DialogResult.OK
        };
        _btnCopy = new Button
        {
            Text = strings.Copy,
            Width = 96,
            Height = 30,
            Anchor = AnchorStyles.Right | AnchorStyles.Top
        };
        _btnCopy.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(_txt.Text);
                _lblHint.Text = _s.Copied;
            }
            catch (Exception ex)
            {
                _lblHint.Text = ex.Message;
            }
        };

        buttons.Controls.Add(_btnClose);
        buttons.Controls.Add(_btnCopy);
        buttons.Resize += (_, _) =>
        {
            _btnClose.Location = new Point(buttons.ClientSize.Width - _btnClose.Width - 12, 10);
            _btnCopy.Location = new Point(_btnClose.Left - _btnCopy.Width - 8, 10);
        };

        Controls.Add(_txt);
        Controls.Add(buttons);
        Controls.Add(_lblHint);
        AcceptButton = _btnClose;
        CancelButton = _btnClose;

        Shown += (_, _) =>
        {
            _btnClose.Location = new Point(buttons.ClientSize.Width - _btnClose.Width - 12, 10);
            _btnCopy.Location = new Point(_btnClose.Left - _btnCopy.Width - 8, 10);
            _txt.SelectionStart = 0;
            _txt.SelectionLength = 0;
        };
    }

    public static void Show(IWin32Window? owner, string title, Exception ex, UiLanguage language)
    {
        var s = UiStrings.For(language);
        using var dlg = new ErrorDialog(title, FormatException(ex), s);
        if (owner is not null)
            dlg.ShowDialog(owner);
        else
            dlg.ShowDialog();
    }

    public static void Show(IWin32Window? owner, string title, string message, Exception? ex, UiLanguage language)
    {
        var s = UiStrings.For(language);
        var details = ex is null ? message : message + Environment.NewLine + Environment.NewLine + FormatException(ex);
        using var dlg = new ErrorDialog(title, details, s);
        if (owner is not null)
            dlg.ShowDialog(owner);
        else
            dlg.ShowDialog();
    }

    public static string FormatException(Exception ex)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}]");
        sb.AppendLine(ex.ToString());
        if (ex.InnerException is not null)
        {
            sb.AppendLine();
            sb.AppendLine("--- Inner ---");
            sb.AppendLine(ex.InnerException.ToString());
        }

        return sb.ToString();
    }
}
