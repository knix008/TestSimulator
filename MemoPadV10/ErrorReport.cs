namespace MemoPadV10;

/// <summary>
/// 전역 예외를 사용자에게 상세히 보여주고, 내용을 복사할 수 있게 합니다.
/// </summary>
internal static class ErrorReport
{
    private static int _showing;
    private static readonly object Gate = new();

    public static void RegisterGlobalHandlers()
    {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Report(e.Exception, "UI");
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
            {
                Report(ex, "AppDomain", isTerminating: e.IsTerminating);
            }
            else
            {
                ReportRaw(e.ExceptionObject?.ToString() ?? "(unknown)", "AppDomain", isTerminating: e.IsTerminating);
            }
        };
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            Report(e.Exception, "Task");
            e.SetObserved();
        };
    }

    public static void Report(Exception exception, string? source = null, bool isTerminating = false)
    {
        string details = Format(exception, source, isTerminating);
        Show(details, isTerminating);
    }

    public static void ReportRaw(string details, string? source = null, bool isTerminating = false)
    {
        string header = BuildHeader(source, isTerminating);
        Show(header + Environment.NewLine + details, isTerminating);
    }

    public static string Format(Exception exception, string? source = null, bool isTerminating = false)
    {
        ArgumentNullException.ThrowIfNull(exception);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine(BuildHeader(source, isTerminating));
        sb.AppendLine();

        Exception? current = exception;
        int depth = 0;
        while (current != null && depth < 16)
        {
            if (depth > 0)
            {
                sb.AppendLine();
                sb.AppendLine($"--- Inner exception ({depth}) ---");
            }

            sb.AppendLine($"Type: {current.GetType().FullName}");
            sb.AppendLine($"Message: {current.Message}");
            if (!string.IsNullOrWhiteSpace(current.StackTrace))
            {
                sb.AppendLine("StackTrace:");
                sb.AppendLine(current.StackTrace);
            }

            current = current.InnerException;
            depth++;
        }

        return sb.ToString().TrimEnd();
    }

    private static string BuildHeader(string? source, bool isTerminating)
    {
        string app = Application.ProductName ?? "MemoPadV10";
        if (string.IsNullOrWhiteSpace(app))
        {
            app = "MemoPadV10";
        }

        string version = Application.ProductVersion ?? "";
        return string.Join(
            Environment.NewLine,
            $"{app} {version}",
            $"Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}",
            $"Source: {source ?? "unknown"}",
            $"OS: {Environment.OSVersion}",
            $".NET: {Environment.Version}",
            isTerminating ? "Severity: terminating" : "Severity: recoverable");
    }

    private static void Show(string details, bool isTerminating)
    {
        if (AppPaths.SuppressUiDialogs)
        {
            System.Diagnostics.Debug.WriteLine(details);
            return;
        }

        // 오류 창 표시 중 재진입으로 무한 팝업이 나지 않게 합니다.
        if (Interlocked.Exchange(ref _showing, 1) == 1)
        {
            System.Diagnostics.Debug.WriteLine(details);
            return;
        }

        try
        {
            void ShowDialog()
            {
                using ErrorDialog dialog = new(details, isTerminating);
                Form? owner = null;
                foreach (Form form in Application.OpenForms)
                {
                    if (form is { IsDisposed: false, Visible: true })
                    {
                        owner = form;
                        break;
                    }
                }

                if (owner != null)
                {
                    dialog.ShowDialog(owner);
                }
                else
                {
                    dialog.ShowDialog();
                }
            }

            if (Application.MessageLoop)
            {
                if (Application.OpenForms.Count > 0
                    && Application.OpenForms[0] is { IsDisposed: false } first
                    && first.InvokeRequired)
                {
                    first.Invoke(ShowDialog);
                }
                else
                {
                    ShowDialog();
                }
            }
            else
            {
                // 메시지 루프 밖(시작 실패 등)
                lock (Gate)
                {
                    ShowDialog();
                }
            }
        }
        catch (Exception reportEx)
        {
            try
            {
                MessageBox.Show(
                    details + Environment.NewLine + Environment.NewLine
                    + "Also failed to open error dialog: " + reportEx.Message,
                    Loc.T("common.error"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch
            {
                // last resort: swallow
            }
        }
        finally
        {
            Interlocked.Exchange(ref _showing, 0);
        }
    }
}

/// <summary>상세 오류 텍스트와 복사 버튼을 제공하는 대화상자.</summary>
internal sealed class ErrorDialog : Form
{
    private readonly TextBox _detailsBox;
    private readonly Button _copyButton;
    private readonly Button _closeButton;
    private readonly Label _hintLabel;

    public ErrorDialog(string details, bool isTerminating)
    {
        Text = Loc.T("error.dialog.title");
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimizeBox = false;
        MaximizeBox = true;
        ShowInTaskbar = true;
        MinimumSize = new Size(520, 360);
        Size = new Size(640, 480);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.White;
        Padding = new Padding(12);

        _hintLabel = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = false,
            Height = 40,
            Text = isTerminating
                ? Loc.T("error.dialog.hint.terminating")
                : Loc.T("error.dialog.hint"),
            TextAlign = ContentAlignment.MiddleLeft
        };

        _detailsBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            Text = details,
            BackColor = Color.White,
            HideSelection = false
        };

        Panel buttons = new()
        {
            Dock = DockStyle.Bottom,
            Height = 44,
            Padding = new Padding(0, 8, 0, 0)
        };

        _closeButton = new Button
        {
            Text = Loc.T("common.ok"),
            DialogResult = DialogResult.OK,
            Size = new Size(100, 32),
            Anchor = AnchorStyles.Right | AnchorStyles.Top
        };
        _copyButton = new Button
        {
            Text = Loc.T("error.dialog.copy"),
            Size = new Size(140, 32),
            Anchor = AnchorStyles.Right | AnchorStyles.Top
        };

        buttons.Resize += (_, _) =>
        {
            _closeButton.Location = new Point(buttons.ClientSize.Width - _closeButton.Width, 8);
            _copyButton.Location = new Point(_closeButton.Left - 8 - _copyButton.Width, 8);
        };

        _copyButton.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(_detailsBox.Text);
                _copyButton.Text = Loc.T("error.dialog.copied");
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    this,
                    Loc.T("error.dialog.copyFailed") + Environment.NewLine + ex.Message,
                    Loc.T("common.error"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        };

        buttons.Controls.Add(_copyButton);
        buttons.Controls.Add(_closeButton);

        Controls.Add(_detailsBox);
        Controls.Add(buttons);
        Controls.Add(_hintLabel);

        AcceptButton = _closeButton;
        CancelButton = _closeButton;

        Shown += (_, _) =>
        {
            _detailsBox.SelectionStart = 0;
            _detailsBox.SelectionLength = 0;
            _detailsBox.Focus();
        };
    }
}
