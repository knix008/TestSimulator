using System.Runtime.InteropServices;
using System.Text;

namespace ScreenCamWin.UI;

file static class ClipboardHelper
{
    public static bool TryCopy(string text, TextBox? fallbackSource = null)
    {
        if (string.IsNullOrEmpty(text) && fallbackSource is not null)
            text = fallbackSource.Text;

        if (string.IsNullOrEmpty(text))
            return false;

        var data = new DataObject();
        data.SetText(text, TextDataFormat.UnicodeText);
        data.SetText(text, TextDataFormat.Text);

        for (int i = 0; i < 15; i++)
        {
            try
            {
                Clipboard.SetDataObject(data, copy: true);
                return true;
            }
            catch (ExternalException)
            {
                Thread.Sleep(20);
            }
        }

        if (fallbackSource is null) return false;

        try
        {
            fallbackSource.Focus();
            fallbackSource.SelectAll();
            fallbackSource.Copy();
            return Clipboard.ContainsText();
        }
        catch
        {
            return false;
        }
    }
}

/// <summary>Failure / error dialog with selectable message text and a Copy button.</summary>
internal static class CopyableDialog
{
    public enum MessageIcon { Error, Warning, Information }

    public static void ShowError(IWin32Window? owner, string message, string title)
        => Show(owner, message, title, MessageIcon.Error);

    public static void ShowError(IWin32Window? owner, Exception ex, string title)
        => Show(owner, FormatException(ex), title, MessageIcon.Error);

    public static void ShowWarning(IWin32Window? owner, string message, string title)
        => Show(owner, message, title, MessageIcon.Warning);

    public static string FormatException(Exception ex)
    {
        var sb = new StringBuilder();
        sb.AppendLine(ex.Message);
        if (ex is COMException com)
            sb.AppendLine($"HRESULT: 0x{com.HResult:X8}");
        if (ex.InnerException is { } inner)
        {
            sb.AppendLine();
            sb.AppendLine($"내부 오류: {inner.Message}");
        }
        if (!string.IsNullOrWhiteSpace(ex.StackTrace))
        {
            sb.AppendLine();
            sb.AppendLine(ex.StackTrace);
        }
        return sb.ToString().TrimEnd();
    }

    public static void Show(IWin32Window? owner, string message, string title, MessageIcon icon)
    {
        using var form = new Form
        {
            Text            = title,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox     = false,
            MinimizeBox     = false,
            ShowInTaskbar   = false,
            StartPosition   = owner is null ? FormStartPosition.CenterScreen : FormStartPosition.CenterParent,
            BackColor       = Theme.BgMain,
            ForeColor       = Theme.TextMain,
            Font            = Theme.FontBody,
            Padding         = new Padding(12),
            AutoSize        = false,
            ClientSize      = new Size(480, 280),
        };

        var lblTitle = new Label
        {
            Text      = title,
            Dock      = DockStyle.Top,
            Height    = 28,
            ForeColor = icon switch
            {
                MessageIcon.Error       => Theme.Danger,
                MessageIcon.Warning     => Theme.Warning,
                _                       => Theme.Accent,
            },
            Font      = Theme.FontSection,
            AutoSize  = false,
        };

        var txt = new TextBox
        {
            Multiline  = true,
            ReadOnly   = true,
            ScrollBars = ScrollBars.Vertical,
            Dock       = DockStyle.Fill,
            Text       = message,
            WordWrap   = true,
            HideSelection = false,
            BorderStyle = BorderStyle.FixedSingle,
        };
        Theme.ApplyTextBox(txt);

        var pnlButtons = new FlowLayoutPanel
        {
            Dock          = DockStyle.Bottom,
            Height        = 44,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents  = false,
            Padding       = new Padding(0, 8, 0, 0),
        };

        var btnOk = new Button { Text = "확인", DialogResult = DialogResult.OK, Width = 88, Height = 32 };
        Theme.ApplyButton(btnOk);

        var btnCopy = new Button { Text = "복사", Width = 88, Height = 32 };
        Theme.ApplyButton(btnCopy, Theme.BgSection, Theme.TextMain);
        btnCopy.FlatAppearance.BorderColor = Theme.Border;
        btnCopy.FlatAppearance.BorderSize  = 1;

        btnCopy.Click += (_, _) =>
        {
            bool ok = ClipboardHelper.TryCopy(message, txt);
            btnCopy.Text = ok ? "복사됨" : "복사 실패";
        };

        // Ctrl+C — TextBox.Copy는 ReadOnly에서도 동작
        txt.KeyDown += (_, e) =>
        {
            if (e.Control && e.KeyCode == Keys.C)
            {
                e.Handled = true;
                e.SuppressKeyPress = true;
                try { txt.Copy(); } catch { ClipboardHelper.TryCopy(txt.Text, txt); }
            }
        };

        form.AcceptButton = btnOk;
        form.CancelButton = btnOk;

        pnlButtons.Controls.Add(btnOk);
        pnlButtons.Controls.Add(btnCopy);

        var content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 4, 0, 0) };
        content.Controls.Add(txt);
        content.Controls.Add(lblTitle); // Top-docked title added last → docks above Fill

        form.Controls.Add(pnlButtons);
        form.Controls.Add(content);

        // Select all on open so Ctrl+C works immediately
        form.Shown += (_, _) =>
        {
            txt.Focus();
            txt.SelectAll();
        };

        form.ShowDialog(owner);
    }
}
