using System.Text;
using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App.Dialogs;

/// <summary>
/// Shows a copyable, left-to-right error report. Details are plain text (not color-inverted).
/// </summary>
public sealed class ErrorDialog : Form
{
    private readonly TextBox _detailsBox;
    private readonly string _copyText;
    private readonly Button _copyButton;
    private System.Windows.Forms.Timer? _copyResetTimer;

    public static void Show(IWin32Window? owner, Exception exception) =>
        Show(owner, GetSummary(exception), FormatException(exception));

    public static void Show(IWin32Window? owner, string summary, Exception exception) =>
        Show(owner, summary, FormatException(exception));

    public static void Show(IWin32Window? owner, string summary, string details)
    {
        using var dialog = new ErrorDialog(summary, details);
        dialog.ShowDialog(owner);
    }

    public static string FormatException(Exception exception)
    {
        var builder = new StringBuilder();
        int depth = 0;
        for (var current = exception; current != null; current = current.InnerException, depth++)
        {
            if (depth > 0)
            {
                builder.AppendLine().AppendLine("--- Inner Exception ---").AppendLine();
            }

            builder.AppendLine($"{Strings.ErrorType}: {current.GetType().FullName}");
            builder.AppendLine($"{Strings.ErrorMessage}: {current.Message}");
            if (!string.IsNullOrWhiteSpace(current.Source))
            {
                builder.AppendLine($"{Strings.ErrorSource}: {current.Source}");
            }

            if (!string.IsNullOrWhiteSpace(current.StackTrace))
            {
                builder.AppendLine();
                builder.AppendLine($"{Strings.ErrorStackTrace}:");
                builder.AppendLine(current.StackTrace);
            }
        }

        return builder.ToString().TrimEnd();
    }

    private static string GetSummary(Exception exception)
    {
        string message = exception.Message?.Trim() ?? string.Empty;
        return string.IsNullOrWhiteSpace(message) ? exception.GetType().Name : message;
    }

    private ErrorDialog(string summary, string details)
    {
        _copyText = BuildCopyText(summary, details);

        Text = Strings.ErrorTitle;
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(520, 360);
        Size = new Size(680, 480);
        ShowInTaskbar = false;
        MaximizeBox = false;
        MinimizeBox = false;
        RightToLeft = RightToLeft.No;
        RightToLeftLayout = false;
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.White;

        var summaryLabel = new Label
        {
            Text = summary,
            Dock = DockStyle.Top,
            AutoSize = false,
            Height = 52,
            Padding = new Padding(12, 12, 12, 4),
            ForeColor = Color.FromArgb(180, 40, 40),
            BackColor = Color.White,
        };

        _detailsBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Dock = DockStyle.Fill,
            Font = new Font(FontFamily.GenericMonospace, 9f),
            BackColor = Color.White,
            ForeColor = Color.FromArgb(30, 41, 59),
            BorderStyle = BorderStyle.FixedSingle,
            Text = details,
            ShortcutsEnabled = true,
            HideSelection = false,
        };

        var closeButton = new Button
        {
            Text = Strings.Ok,
            DialogResult = DialogResult.OK,
            Size = new Size(88, 30),
            Margin = new Padding(6, 0, 0, 0),
        };

        _copyButton = new Button
        {
            Text = Strings.ErrorCopy,
            Size = new Size(110, 30),
            Margin = new Padding(6, 0, 0, 0),
        };
        _copyButton.Click += (_, _) => CopyToClipboard();

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(12, 8, 12, 8),
            BackColor = Color.White,
        };
        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(_copyButton);

        var contentPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 0, 12, 0),
            BackColor = Color.White,
        };
        contentPanel.Controls.Add(_detailsBox);

        Controls.Add(contentPanel);
        Controls.Add(summaryLabel);
        Controls.Add(buttonPanel);

        AcceptButton = closeButton;
    }

    private void CopyToClipboard()
    {
        Clipboard.SetText(_copyText);
        _detailsBox.SelectAll();
        _detailsBox.SelectionLength = 0;

        _copyButton.Text = Strings.ErrorCopied;
        _copyResetTimer?.Stop();
        _copyResetTimer?.Dispose();
        _copyResetTimer = new System.Windows.Forms.Timer { Interval = 1500 };
        _copyResetTimer.Tick += (_, _) =>
        {
            _copyButton.Text = Strings.ErrorCopy;
            _copyResetTimer?.Stop();
            _copyResetTimer?.Dispose();
            _copyResetTimer = null;
        };
        _copyResetTimer.Start();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _copyResetTimer?.Stop();
        _copyResetTimer?.Dispose();
        _copyResetTimer = null;
        base.OnFormClosed(e);
    }

    private static string BuildCopyText(string summary, string details)
    {
        var builder = new StringBuilder();
        builder.AppendLine(Strings.ErrorTitle);
        builder.AppendLine();

        if (!string.IsNullOrWhiteSpace(summary))
        {
            builder.AppendLine(summary);
            builder.AppendLine();
        }

        if (!string.Equals(summary.Trim(), details.Trim(), StringComparison.Ordinal))
        {
            builder.Append(details);
        }
        else if (string.IsNullOrWhiteSpace(summary))
        {
            builder.Append(details);
        }

        return builder.ToString().TrimEnd();
    }
}
