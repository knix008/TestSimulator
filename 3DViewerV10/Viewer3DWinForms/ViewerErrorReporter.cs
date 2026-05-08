using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace Viewer3DWinForms;

/// <summary>
/// 예외 전문을 스크롤 창·로그 파일·클립보드로 남깁니다(MessageBox는 잘리기 쉬움).
/// </summary>
internal static class ViewerErrorReporter
{
    private static readonly string ErrorLogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Viewer3DWinForms",
        "viewer-errors.log");

    public static void Show(IWin32Window? owner, string title, Exception ex)
    {
        var body = BuildBody(title, ex);
        TryAppendLog(body);
        TrySetClipboard(body);

        using var dlg = new ErrorDetailsForm(title, body, ErrorLogPath);
        dlg.ShowDialog(owner);
    }

    private static string BuildBody(string title, Exception ex)
    {
        var sb = new StringBuilder();
        sb.AppendLine(title);
        sb.AppendLine($"시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine(new string('-', 60));
        sb.AppendLine(ex.ToString());
        return sb.ToString();
    }

    private static void TryAppendLog(string body)
    {
        try
        {
            var dir = Path.GetDirectoryName(ErrorLogPath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.AppendAllText(
                ErrorLogPath,
                Environment.NewLine + new string('=', 72) + Environment.NewLine + body + Environment.NewLine,
                Encoding.UTF8);
        }
        catch
        {
            // 로그 실패는 무시
        }
    }

    private static void TrySetClipboard(string text)
    {
        try
        {
            if (!string.IsNullOrEmpty(text))
            {
                Clipboard.SetText(text);
            }
        }
        catch
        {
            // 다른 앱이 클립보드를 잠근 경우 등
        }
    }

    private static void TryOpenLogFolder()
    {
        try
        {
            var dir = Path.GetDirectoryName(ErrorLogPath);
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir))
            {
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = dir,
                UseShellExecute = true
            });
        }
        catch
        {
            // ignore
        }
    }

    private sealed class ErrorDetailsForm : Form
    {
        public ErrorDetailsForm(string title, string body, string logPath)
        {
            Text = title;
            Width = 760;
            Height = 520;
            MinimizeBox = false;
            MaximizeBox = true;
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(480, 320);

            var info = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = 60,
                Padding = new Padding(10, 8, 10, 4),
                Text =
                    "가능한 경우 전체 내용이 클립보드에 자동 복사됩니다. 아래 상자에서 Ctrl+A 후 Ctrl+C로 복사하거나, " +
                    "「다시 클립보드에 복사」를 누르세요." +
                    Environment.NewLine +
                    $"로그 파일: {logPath}"
            };

            var txt = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                Dock = DockStyle.Fill,
                Font = new Font(FontFamily.GenericMonospace, 9f),
                Text = body,
                WordWrap = false,
                TabIndex = 0
            };

            var panel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                Padding = new Padding(10, 6, 10, 10),
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false
            };

            var btnOk = new Button
            {
                Text = "닫기",
                DialogResult = DialogResult.OK,
                AutoSize = true,
                TabIndex = 3
            };
            var btnCopy = new Button
            {
                Text = "다시 클립보드에 복사",
                AutoSize = true,
                TabIndex = 2
            };
            btnCopy.Click += (_, _) =>
            {
                TrySetClipboard(body);
                MessageBox.Show(this, "클립보드에 다시 복사했습니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            var btnFolder = new Button
            {
                Text = "로그 폴더 열기",
                AutoSize = true,
                TabIndex = 1
            };
            btnFolder.Click += (_, _) => TryOpenLogFolder();

            panel.Controls.Add(btnOk);
            panel.Controls.Add(btnCopy);
            panel.Controls.Add(btnFolder);

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Padding = new Padding(0)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(info, 0, 0);
            layout.Controls.Add(txt, 0, 1);
            layout.Controls.Add(panel, 0, 2);

            Controls.Add(layout);
            AcceptButton = btnOk;
            CancelButton = btnOk;

            Shown += (_, _) =>
            {
                BeginInvoke(new Action(() =>
                {
                    txt.Focus();
                    txt.SelectAll();
                }));
            };
        }
    }
}
