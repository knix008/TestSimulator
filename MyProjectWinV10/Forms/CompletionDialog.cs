using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class CompletionDialog : Form
    {
        public static void Show(IWin32Window? owner, string title, string summary, string? details = null, string? detailsCaption = null)
        {
            using var dialog = new CompletionDialog(title, summary, details, detailsCaption ?? "Location:", null, null);
            dialog.ShowDialog(owner);
        }

        public static void Show(
            IWin32Window? owner,
            string title,
            string summary,
            string? details,
            string actionText,
            Action action,
            string? detailsCaption = null)
        {
            using var dialog = new CompletionDialog(title, summary, details, detailsCaption ?? "Location:", actionText, action);
            dialog.ShowDialog(owner);
        }

        private CompletionDialog(
            string title,
            string summary,
            string? details,
            string detailsCaptionText,
            string? actionText,
            Action? action)
        {
            Text = title;
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(420, details == null ? 160 : 240);
            Size = details == null ? new Size(460, 180) : new Size(520, 260);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;
            ShowInTaskbar = false;
            MaximizeBox = false;
            MinimizeBox = false;

            var summaryLabel = new Label
            {
                Text = summary,
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = details == null ? 72 : 48,
                Padding = new Padding(12, 12, 12, 4),
                ForeColor = AppTheme.TextPrimary,
                BackColor = AppTheme.SurfaceColor
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

            var btnOk = CreateButton("OK", true);
            btnOk.Click += (_, _) => Close();
            buttonPanel.Controls.Add(btnOk);

            if (!string.IsNullOrWhiteSpace(actionText) && action != null)
            {
                var btnAction = CreateButton(actionText, false);
                btnAction.Click += (_, _) =>
                {
                    action();
                    Close();
                };
                buttonPanel.Controls.Add(btnAction);
            }

            if (!string.IsNullOrWhiteSpace(details))
            {
                var detailsCaptionLabel = new Label
                {
                    Text = detailsCaptionText,
                    Dock = DockStyle.Top,
                    AutoSize = false,
                    Height = 22,
                    Padding = new Padding(12, 8, 12, 0),
                    ForeColor = AppTheme.TextSecondary,
                    BackColor = AppTheme.SurfaceColor
                };

                var borderedContent = CreateBorderedDetailsPanel(details);

                var contentPanel = new Panel
                {
                    Dock = DockStyle.Fill,
                    Padding = new Padding(12, 0, 12, 0),
                    BackColor = AppTheme.SurfaceColor
                };
                contentPanel.Controls.Add(borderedContent);
                contentPanel.Controls.Add(detailsCaptionLabel);

                Controls.Add(contentPanel);
            }

            Controls.Add(summaryLabel);
            Controls.Add(buttonPanel);

            AcceptButton = btnOk;
            CancelButton = btnOk;
        }

        private static Panel CreateBorderedDetailsPanel(string text)
        {
            var panel = new Panel
            {
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                AutoScroll = true,
                Padding = new Padding(8, 6, 8, 6)
            };

            var content = new Label
            {
                Text = text,
                AutoSize = true,
                ForeColor = AppTheme.TextPrimary,
                BackColor = Color.White,
                UseMnemonic = false,
                TabStop = false
            };

            void UpdateWrapWidth()
            {
                int width = Math.Max(120, panel.ClientSize.Width - panel.Padding.Horizontal);
                content.MaximumSize = new Size(width, 0);
            }

            panel.Controls.Add(content);
            panel.Resize += (_, _) => UpdateWrapWidth();
            panel.HandleCreated += (_, _) => UpdateWrapWidth();

            return panel;
        }

        private static Button CreateButton(string text, bool isPrimary)
        {
            var button = new Button
            {
                Text = text,
                AutoSize = true,
                MinimumSize = new Size(88, 30),
                Margin = new Padding(6, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                ForeColor = isPrimary ? AppTheme.TextOnAccent : AppTheme.TextPrimary,
                BackColor = isPrimary ? AppTheme.Accent : AppTheme.SidebarColor
            };
            button.FlatAppearance.BorderColor = isPrimary ? AppTheme.AccentDark : AppTheme.BorderColor;
            return button;
        }
    }
}
