using System.Text;
using System.Windows.Forms;

namespace FTPServerWinV10
{
    /// <summary>
    /// 상세 내용을 표시하고 텍스트를 복사할 수 있는 오류/경고 대화상자.
    /// </summary>
    public static class ErrorDialog
    {
        public static void ShowError(IWin32Window? owner, string title, string message,
            Exception? exception = null, string? details = null)
            => Show(owner, title, message, MessageBoxIcon.Error, exception, details);

        public static void ShowWarning(IWin32Window? owner, string title, string message,
            string? details = null)
            => Show(owner, title, message, MessageBoxIcon.Warning, null, details);

        public static string FormatException(Exception ex)
        {
            var sb = new StringBuilder();
            var current = ex;
            var depth = 0;
            while (current != null)
            {
                if (depth > 0)
                    sb.AppendLine().AppendLine($"── 내부 예외 #{depth} ──").AppendLine();
                sb.AppendLine($"[{current.GetType().FullName}]");
                sb.AppendLine(current.Message);
                if (!string.IsNullOrEmpty(current.StackTrace))
                {
                    sb.AppendLine();
                    sb.AppendLine(current.StackTrace);
                }
                current = current.InnerException;
                depth++;
            }
            return sb.ToString().TrimEnd();
        }

        private static string BuildBody(string message, Exception? ex, string? details)
        {
            var sb = new StringBuilder();
            sb.AppendLine(message.Trim());
            if (!string.IsNullOrWhiteSpace(details))
            {
                sb.AppendLine();
                sb.AppendLine("── 상세 ──");
                sb.AppendLine(details.Trim());
            }
            if (ex != null)
            {
                sb.AppendLine();
                sb.AppendLine("── 예외 ──");
                sb.Append(FormatException(ex));
            }
            return sb.ToString();
        }

        private static void Show(IWin32Window? owner, string title, string message,
            MessageBoxIcon icon, Exception? ex, string? details)
        {
            var body = BuildBody(message, ex, details);
            using var form = CreateForm(title, message, body, icon);
            form.ShowDialog(owner);
        }

        private static Icon GetIcon(MessageBoxIcon icon) => icon switch
        {
            MessageBoxIcon.Warning => SystemIcons.Warning,
            MessageBoxIcon.Error => SystemIcons.Error,
            MessageBoxIcon.Information => SystemIcons.Information,
            MessageBoxIcon.Question => SystemIcons.Question,
            _ => SystemIcons.Application
        };

        private static Form CreateForm(string title, string summary, string body, MessageBoxIcon icon)
        {
            var form = new Form
            {
                Text = title,
                ClientSize = new Size(560, 380),
                MinimumSize = new Size(480, 280),
                FormBorderStyle = FormBorderStyle.Sizable,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = true,
                MinimizeBox = false,
                ShowInTaskbar = false,
                Font = new Font("Segoe UI", 9F)
            };

            var picIcon = new PictureBox
            {
                Location = new Point(12, 12),
                Size = new Size(32, 32),
                SizeMode = PictureBoxSizeMode.CenterImage
            };
            picIcon.Image = GetIcon(icon).ToBitmap();

            var lblSummary = new Label
            {
                Location = new Point(52, 12),
                Size = new Size(496, 48),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                Text = summary,
                AutoEllipsis = true
            };

            var txtDetails = new TextBox
            {
                Location = new Point(12, 68),
                Size = new Size(536, 260),
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                WordWrap = false,
                Font = new Font("Consolas", 9F),
                Text = body,
                TabStop = true
            };

            var btnCopy = new Button
            {
                Text = "전체 복사",
                Size = new Size(96, 29),
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right
            };
            var btnOk = new Button
            {
                Text = "확인",
                DialogResult = DialogResult.OK,
                Size = new Size(76, 29),
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right
            };

            void LayoutButtons()
            {
                var clientH = form.ClientSize.Height;
                var clientW = form.ClientSize.Width;
                var y = clientH - 40;
                btnOk.Location = new Point(clientW - 12 - btnOk.Width, y);
                btnCopy.Location = new Point(btnOk.Left - 8 - btnCopy.Width, y);
                lblSummary.Width = clientW - 64;
                txtDetails.Width = clientW - 24;
                txtDetails.Height = y - txtDetails.Top - 8;
            }

            form.Resize += (_, _) => LayoutButtons();
            LayoutButtons();

            btnCopy.Click += (_, _) =>
            {
                try
                {
                    Clipboard.SetText(body);
                    btnCopy.Text = "복사됨";
                }
                catch (Exception copyEx)
                {
                    MessageBox.Show(form, $"클립보드 복사 실패: {copyEx.Message}", title,
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            };

            txtDetails.KeyDown += (_, e) =>
            {
                if (e.Control && e.KeyCode == Keys.A)
                {
                    txtDetails.SelectAll();
                    e.SuppressKeyPress = true;
                }
            };

            form.Controls.AddRange(new Control[] { picIcon, lblSummary, txtDetails, btnCopy, btnOk });
            form.AcceptButton = btnOk;
            return form;
        }
    }
}
