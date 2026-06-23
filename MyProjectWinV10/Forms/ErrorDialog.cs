using MyProject.Theme;
using System.Text;

namespace MyProject.Forms
{
    public sealed class ErrorDialog : Form
    {
        private readonly TextBox _detailsBox;
        private readonly string _copyText;

        public static void Show(IWin32Window? owner, string title, Exception ex)
        {
            Show(owner, title, ex.Message, FormatException(ex));
        }

        public static void Show(IWin32Window? owner, string title, string summary, Exception ex)
        {
            Show(owner, title, summary, FormatException(ex));
        }

        public static void Show(IWin32Window? owner, string title, string message)
        {
            Show(owner, title, message, message);
        }

        public static void Show(IWin32Window? owner, string title, string summary, string details)
        {
            using var dlg = new ErrorDialog(title, summary, details);
            dlg.ShowDialog(owner);
        }

        public static string FormatException(Exception ex)
        {
            var sb = new StringBuilder();
            int depth = 0;
            for (var e = ex; e != null; e = e.InnerException, depth++)
            {
                if (depth > 0)
                    sb.AppendLine().AppendLine("--- Inner Exception ---").AppendLine();
                sb.AppendLine($"Type:    {e.GetType().FullName}");
                sb.AppendLine($"Message: {e.Message}");
                if (!string.IsNullOrWhiteSpace(e.StackTrace))
                {
                    sb.AppendLine();
                    sb.AppendLine("Stack Trace:");
                    sb.AppendLine(e.StackTrace);
                }
            }
            return sb.ToString().TrimEnd();
        }

        private ErrorDialog(string title, string summary, string details)
        {
            _copyText = BuildCopyText(title, summary, details);

            Text = title;
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(520, 360);
            Size = new Size(680, 480);
            ShowInTaskbar = false;
            MaximizeBox = false;
            MinimizeBox = false;
            RightToLeft = RightToLeft.No;
            RightToLeftLayout = false;
            Font = AppTheme.FontNormal;
            BackColor = AppTheme.SurfaceColor;

            var summaryLabel = new Label
            {
                Text = summary,
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = 52,
                Padding = new Padding(12, 12, 12, 4),
                ForeColor = AppTheme.TextPrimary,
                BackColor = AppTheme.SurfaceColor
            };

            _detailsBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                WordWrap = false,
                Dock = DockStyle.Fill,
                Font = new Font("Consolas", 9f),
                BackColor = Color.White,
                ForeColor = Color.Black,
                BorderStyle = BorderStyle.FixedSingle,
                Text = details,
                ShortcutsEnabled = true,
                HideSelection = false
            };

            var btnClose = MakeButton("Close");
            btnClose.DialogResult = DialogResult.Cancel;

            var btnCopy = MakeButton("Copy");
            btnCopy.Click += (_, _) => CopyToClipboard(btnCopy);

            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 48,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                Padding = new Padding(12, 8, 12, 8),
                BackColor = AppTheme.SurfaceColor
            };
            buttonPanel.Controls.Add(btnClose);
            buttonPanel.Controls.Add(btnCopy);

            var contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12, 0, 12, 0),
                BackColor = AppTheme.SurfaceColor
            };
            contentPanel.Controls.Add(_detailsBox);

            Controls.Add(contentPanel);
            Controls.Add(summaryLabel);
            Controls.Add(buttonPanel);

            AcceptButton = btnClose;
            CancelButton = btnClose;
        }

        private System.Windows.Forms.Timer? _copyResetTimer;

        private void CopyToClipboard(Button copyButton)
        {
            _detailsBox.SelectAll();
            Clipboard.SetText(_copyText);
            _detailsBox.SelectionLength = 0;

            copyButton.Text = "Copied";
            _copyResetTimer?.Stop();
            _copyResetTimer?.Dispose();
            _copyResetTimer = new System.Windows.Forms.Timer { Interval = 1500 };
            _copyResetTimer.Tick += (_, _) =>
            {
                copyButton.Text = "Copy";
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

        private static string BuildCopyText(string title, string summary, string details)
        {
            var sb = new StringBuilder();
            sb.AppendLine(title);
            sb.AppendLine();

            if (!string.IsNullOrWhiteSpace(summary))
            {
                sb.AppendLine(summary);
                sb.AppendLine();
            }

            if (!string.Equals(summary?.Trim(), details?.Trim(), StringComparison.Ordinal))
                sb.Append(details);
            else if (string.IsNullOrWhiteSpace(summary))
                sb.Append(details);

            return sb.ToString().TrimEnd();
        }

        private static Button MakeButton(string text)
        {
            var button = new Button
            {
                Text = text,
                Size = new Size(88, 30),
                Margin = new Padding(6, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.SurfaceColor,
                ForeColor = AppTheme.TextPrimary
            };
            button.FlatAppearance.BorderColor = AppTheme.BorderColor;
            return button;
        }
    }
}
