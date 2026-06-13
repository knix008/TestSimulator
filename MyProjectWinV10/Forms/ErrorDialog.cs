using System.Text;

namespace MyProject.Forms
{
    public sealed class ErrorDialog : Form
    {
        public static void Show(IWin32Window? owner, string title, Exception ex)
        {
            var text = FormatException(ex);
            using var dlg = new ErrorDialog(title, ex.Message, text);
            dlg.ShowDialog(owner);
        }

        public static void Show(IWin32Window? owner, string title, string message)
        {
            using var dlg = new ErrorDialog(title, message, message);
            dlg.ShowDialog(owner);
        }

        public static string FormatException(Exception ex)
        {
            var sb = new StringBuilder();
            int depth = 0;
            for (var e = ex; e != null; e = e.InnerException, depth++)
            {
                if (depth > 0)
                    sb.AppendLine().AppendLine("─── Inner Exception ───").AppendLine();
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
            Text = title;
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(520, 360);
            Size = new Size(660, 480);
            ShowInTaskbar = false;
            MaximizeBox = false;
            MinimizeBox = false;
            Font = new Font("Segoe UI", 9f);

            var summaryLabel = new Label
            {
                Text = summary,
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = 44,
                Padding = new Padding(12, 10, 12, 4),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            var detailsBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                WordWrap = false,
                Dock = DockStyle.Fill,
                Font = new Font("Consolas", 9f),
                BackColor = Color.White,
                ForeColor = Color.FromArgb(30, 30, 30),
                BorderStyle = BorderStyle.None,
                Text = details
            };

            var btnClose = new Button
            {
                Text = "Close",
                Width = 88,
                Height = 28,
                DialogResult = DialogResult.Cancel,
                FlatStyle = FlatStyle.Flat
            };

            var btnCopy = new Button
            {
                Text = "Copy",
                Width = 88,
                Height = 28,
                FlatStyle = FlatStyle.Flat
            };
            btnCopy.Click += (_, _) =>
            {
                try
                {
                    if (!string.IsNullOrEmpty(detailsBox.Text))
                        Clipboard.SetText(detailsBox.Text);
                    btnCopy.Text = "Copied";
                }
                catch { /* clipboard can fail on some systems */ }
            };

            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 46,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8, 8, 8, 8),
                BackColor = Color.FromArgb(240, 240, 240)
            };
            buttonPanel.Controls.Add(btnClose);
            buttonPanel.Controls.Add(btnCopy);

            var contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(8, 0, 8, 0)
            };
            contentPanel.Controls.Add(detailsBox);

            Controls.Add(contentPanel);
            Controls.Add(summaryLabel);
            Controls.Add(buttonPanel);

            AcceptButton = btnClose;
            CancelButton = btnClose;
        }
    }
}
