using System.Text;

namespace DCMViewer;

/// <summary>
/// 오류 요약과 상세 내용을 표시하고 복사할 수 있는 대화상자입니다.
/// </summary>
internal sealed class ErrorDetailForm : Form
{
    private readonly string _summary;
    private readonly TextBox _detailTextBox;

    private ErrorDetailForm(string title, string summary, string details)
    {
        _summary = summary;
        Text = title;
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;
        ClientSize = new Size(640, 420);
        MinimumSize = new Size(480, 280);
        Font = new Font("Segoe UI", 9F);

        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(12),
        };
        main.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 44F));

        var summaryLabel = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(600, 0),
            Padding = new Padding(0, 0, 0, 8),
            Text = summary,
            UseMnemonic = false,
        };

        _detailTextBox = new TextBox
        {
            BackColor = SystemColors.Window,
            BorderStyle = BorderStyle.FixedSingle,
            Dock = DockStyle.Fill,
            Font = new Font("Consolas", 9F),
            ForeColor = SystemColors.WindowText,
            HideSelection = false,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            TabStop = true,
            Text = details,
            WordWrap = true,
        };

        var copyButton = new Button
        {
            AutoSize = true,
            Text = "복사",
            TabIndex = 0,
        };
        copyButton.Click += (_, _) => CopyToClipboard();

        var closeButton = new Button
        {
            AutoSize = true,
            DialogResult = DialogResult.OK,
            Text = "닫기",
            TabIndex = 1,
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0),
        };
        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        main.Controls.Add(summaryLabel, 0, 0);
        main.Controls.Add(_detailTextBox, 0, 1);
        main.Controls.Add(buttonPanel, 0, 2);

        Controls.Add(main);
        AcceptButton = closeButton;
        CancelButton = closeButton;

        Shown += (_, _) =>
        {
            _detailTextBox.SelectionStart = 0;
            _detailTextBox.SelectionLength = 0;
            ActiveControl = _detailTextBox;
        };
    }

    public static void Show(IWin32Window? owner, string title, string summary, string details)
    {
        using var form = new ErrorDetailForm(title, summary, details);
        form.ShowDialog(owner);
    }

    public static void Show(IWin32Window? owner, string title, string summary, Exception ex, string? context = null)
    {
        Show(owner, title, summary, FormatException(ex, context));
    }

    public static string FormatException(Exception ex, string? context = null)
    {
        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(context))
        {
            sb.AppendLine(context.Trim());
            sb.AppendLine();
        }

        AppendException(sb, ex, includeStackTrace: true);
        return sb.ToString().TrimEnd();
    }

    public static string FormatBatchFailure(string filePath, Exception ex)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"파일: {filePath}");
        AppendException(sb, ex, includeStackTrace: true);
        return sb.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder sb, Exception ex, bool includeStackTrace, int depth = 0)
    {
        var indent = new string(' ', depth * 2);
        sb.AppendLine($"{indent}유형: {ex.GetType().FullName}");
        sb.AppendLine($"{indent}메시지: {ex.Message}");

        if (ex.InnerException is not null)
        {
            sb.AppendLine($"{indent}내부 오류:");
            AppendException(sb, ex.InnerException, includeStackTrace, depth + 1);
        }

        if (includeStackTrace && !string.IsNullOrWhiteSpace(ex.StackTrace))
        {
            sb.AppendLine($"{indent}스택 추적:");
            foreach (var line in ex.StackTrace.Split('\n', '\r', StringSplitOptions.RemoveEmptyEntries))
                sb.AppendLine($"{indent}  {line.Trim()}");
        }
    }

    private void CopyToClipboard()
    {
        var text = string.IsNullOrEmpty(_detailTextBox.Text)
            ? _summary
            : $"{_summary}{Environment.NewLine}{Environment.NewLine}{_detailTextBox.Text}";
        if (string.IsNullOrEmpty(text))
            return;

        try
        {
            Clipboard.SetText(text);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"클립보드 복사에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
