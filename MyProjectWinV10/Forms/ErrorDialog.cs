using MyProject.Theme;
using System.Text;

namespace MyProject.Forms
{
    public sealed class ErrorDialog : Form
    {
        private readonly TextBox _detailsBox;

        public static void Show(IWin32Window? owner, string title, string summary, Exception exception)
        {
            if (ExceptionHandler.IsShuttingDown)
                return;

            owner = ResolveOwner(owner);
            using var dialog = new ErrorDialog(title, summary, exception.Message, FormatException(exception));
            dialog.ShowDialog(owner);
        }

        public static void Show(IWin32Window? owner, string title, string summary, string details)
        {
            if (ExceptionHandler.IsShuttingDown)
                return;

            owner = ResolveOwner(owner);
            using var dialog = new ErrorDialog(title, summary, null, details);
            dialog.ShowDialog(owner);
        }

        public static void Show(IWin32Window? owner, string title, string summary, string message, string details)
        {
            if (ExceptionHandler.IsShuttingDown)
                return;

            owner = ResolveOwner(owner);
            using var dialog = new ErrorDialog(title, summary, message, details);
            dialog.ShowDialog(owner);
        }

        private static IWin32Window? ResolveOwner(IWin32Window? owner)
        {
            if (owner is Control control && (control.IsDisposed || control.Disposing))
                return null;

            if (owner is Form form && (form.IsDisposed || form.Disposing))
                return null;

            return owner;
        }

        public static string FormatException(Exception exception)
        {
            var sb = new StringBuilder();
            var ex = exception;
            var depth = 0;

            while (ex != null)
            {
                if (depth > 0)
                    sb.AppendLine().AppendLine("--- Inner Exception ---").AppendLine();

                sb.AppendLine($"Type: {ex.GetType().FullName}");
                sb.AppendLine($"Message: {ex.Message}");

                AppendExceptionData(sb, ex);

                if (!string.IsNullOrWhiteSpace(ex.Source))
                    sb.AppendLine($"Source: {ex.Source}");

                if (ex.HResult != 0)
                    sb.AppendLine($"HResult: 0x{ex.HResult:X8} ({ex.HResult})");

                if (!string.IsNullOrWhiteSpace(ex.StackTrace))
                {
                    sb.AppendLine();
                    sb.AppendLine("Stack Trace:");
                    sb.AppendLine(ex.StackTrace);
                }

                if (ex is AggregateException agg && agg.InnerExceptions.Count > 0)
                {
                    sb.AppendLine();
                    sb.AppendLine($"Aggregate Exceptions ({agg.InnerExceptions.Count}):");
                    for (int i = 0; i < agg.InnerExceptions.Count; i++)
                    {
                        sb.AppendLine();
                        sb.AppendLine($"[{i + 1}] {agg.InnerExceptions[i].GetType().FullName}");
                        sb.AppendLine(agg.InnerExceptions[i].Message);
                    }
                }

                ex = ex.InnerException;
                depth++;
            }

            return sb.ToString().TrimEnd();
        }

        private static void AppendExceptionData(StringBuilder sb, Exception ex)
        {
            switch (ex)
            {
                case FileNotFoundException fnf when !string.IsNullOrWhiteSpace(fnf.FileName):
                    sb.AppendLine($"File: {fnf.FileName}");
                    break;
                case DirectoryNotFoundException:
                    if (ex.Data.Contains("Path"))
                        sb.AppendLine($"Path: {ex.Data["Path"]}");
                    break;
                case UnauthorizedAccessException:
                    if (ex.Data.Contains("Path"))
                        sb.AppendLine($"Path: {ex.Data["Path"]}");
                    break;
                case IOException io when !string.IsNullOrWhiteSpace(io.Message):
                    sb.AppendLine($"I/O Detail: {io.Message}");
                    break;
            }

            if (ex.Data.Count > 0)
            {
                sb.AppendLine("Additional Data:");
                foreach (var key in ex.Data.Keys)
                    sb.AppendLine($"  {key}: {ex.Data[key]}");
            }
        }

        private ErrorDialog(string title, string summary, string? message, string details)
        {
            Text = title;
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(520, 360);
            Size = new Size(620, 460);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;
            ShowInTaskbar = false;
            MaximizeBox = false;
            MinimizeBox = false;

            var headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(12, 12, 12, 8),
                BackColor = AppTheme.SurfaceColor
            };

            var summaryLabel = new Label
            {
                Text = summary,
                AutoSize = true,
                MaximumSize = new Size(580, 0),
                Dock = DockStyle.Top,
                ForeColor = AppTheme.TextPrimary,
                BackColor = AppTheme.SurfaceColor,
                Font = new Font(AppTheme.FontNormal.FontFamily, 9.5f, FontStyle.Bold)
            };
            headerPanel.Controls.Add(summaryLabel);

            if (!string.IsNullOrWhiteSpace(message))
            {
                var messageLabel = new Label
                {
                    Text = message,
                    AutoSize = true,
                    MaximumSize = new Size(580, 0),
                    Dock = DockStyle.Top,
                    Padding = new Padding(0, 8, 0, 0),
                    ForeColor = Color.FromArgb(180, 40, 30),
                    BackColor = AppTheme.SurfaceColor,
                    Font = AppTheme.FontNormal
                };
                headerPanel.Controls.Add(messageLabel);
                messageLabel.BringToFront();
            }

            var detailsCaption = new Label
            {
                Text = "Details",
                Dock = DockStyle.Top,
                Height = 24,
                Padding = new Padding(12, 8, 12, 0),
                ForeColor = AppTheme.TextSecondary,
                BackColor = AppTheme.SurfaceColor,
                Font = AppTheme.FontSmall
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
                ForeColor = AppTheme.TextPrimary,
                BorderStyle = BorderStyle.FixedSingle,
                Text = details
            };

            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 48,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                Padding = new Padding(8, 8, 12, 8),
                BackColor = AppTheme.SurfaceColor
            };

            var btnClose = CreateButton("Close", true);
            var btnCopy = CreateButton("Copy Details", false);
            btnClose.Click += (_, _) => Close();
            btnCopy.Click += (_, _) => CopyDetails(btnCopy);

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
            Controls.Add(detailsCaption);
            Controls.Add(headerPanel);
            Controls.Add(buttonPanel);

            AcceptButton = btnClose;
            CancelButton = btnClose;
        }

        private static Button CreateButton(string text, bool isPrimary)
        {
            var button = new Button
            {
                Text = text,
                AutoSize = true,
                MinimumSize = new Size(96, 30),
                Margin = new Padding(6, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                ForeColor = isPrimary ? AppTheme.TextOnAccent : AppTheme.TextPrimary,
                BackColor = isPrimary ? AppTheme.Accent : AppTheme.SidebarColor
            };
            button.FlatAppearance.BorderColor = isPrimary ? AppTheme.AccentDark : AppTheme.BorderColor;
            return button;
        }

        private void CopyDetails(Button copyButton)
        {
            try
            {
                if (!string.IsNullOrEmpty(_detailsBox.Text))
                    Clipboard.SetText(_detailsBox.Text);

                var originalText = copyButton.Text;
                copyButton.Text = "Copied";
                copyButton.Enabled = false;

                var timer = new System.Windows.Forms.Timer { Interval = 1500 };
                timer.Tick += (_, _) =>
                {
                    copyButton.Text = originalText;
                    copyButton.Enabled = true;
                    timer.Stop();
                    timer.Dispose();
                };
                timer.Start();
            }
            catch (Exception ex)
            {
                Show(this, "Copy Failed", "Could not copy error details to the clipboard.", ex);
            }
        }
    }
}
