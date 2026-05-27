using System;
using System.Drawing;
using System.Windows.Forms;

namespace TerminalWinV10
{
    internal sealed class TerminalErrorDetailsForm : Form
    {
        private readonly TextBox _details;
        private readonly Button _copyButton;
        private readonly Button _closeButton;

        public TerminalErrorDetailsForm(string title, string details)
        {
            Text = title;
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(820, 560);
            MinimumSize = new Size(720, 480);

            var label = new Label
            {
                Text = "오류 상세 내용입니다. 아래 내용을 복사할 수 있습니다.",
                Dock = DockStyle.Top,
                Height = 32,
                Padding = new Padding(8, 8, 8, 0)
            };

            _details = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                Font = new Font("Consolas", 9.5f),
                Text = details ?? string.Empty
            };

            _copyButton = new Button
            {
                Text = "Copy",
                Width = 100
            };
            _copyButton.Click += (_, _) =>
            {
                try { Clipboard.SetText(_details.Text); } catch { /* ignore */ }
            };

            _closeButton = new Button
            {
                Text = "Close",
                Width = 100,
                DialogResult = DialogResult.OK
            };

            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 50,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8),
                WrapContents = false
            };
            buttonPanel.Controls.Add(_closeButton);
            buttonPanel.Controls.Add(_copyButton);

            Controls.Add(_details);
            Controls.Add(buttonPanel);
            Controls.Add(label);

            AcceptButton = _closeButton;
        }

        public static void Show(IWin32Window? owner, string title, Exception ex)
        {
            using var form = new TerminalErrorDetailsForm(title, ex?.ToString() ?? string.Empty);
            form.ShowDialog(owner);
        }
    }
}

