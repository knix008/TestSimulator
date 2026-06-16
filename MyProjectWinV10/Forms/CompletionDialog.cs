using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class CompletionDialog : Form
    {
        public static void Show(IWin32Window? owner, string title, string summary, string? details = null)
        {
            using var dialog = new CompletionDialog(title, summary, details);
            dialog.ShowDialog(owner);
        }

        public static void Show(
            IWin32Window? owner,
            string title,
            string summary,
            string? details,
            string actionText,
            Action action)
        {
            using var dialog = new CompletionDialog(title, summary, details, actionText, action);
            dialog.ShowDialog(owner);
        }

        private CompletionDialog(string title, string summary, string? details)
            : this(title, summary, details, null, null)
        {
        }

        private CompletionDialog(string title, string summary, string? details, string? actionText, Action? action)
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
                var detailsLabel = new Label
                {
                    Text = "Location:",
                    Dock = DockStyle.Top,
                    AutoSize = false,
                    Height = 22,
                    Padding = new Padding(12, 8, 12, 0),
                    ForeColor = AppTheme.TextSecondary,
                    BackColor = AppTheme.SurfaceColor
                };

                var detailsBox = new TextBox
                {
                    Multiline = true,
                    ReadOnly = true,
                    ScrollBars = ScrollBars.Vertical,
                    WordWrap = true,
                    Dock = DockStyle.Fill,
                    Font = AppTheme.FontNormal,
                    BackColor = Color.White,
                    ForeColor = AppTheme.TextPrimary,
                    BorderStyle = BorderStyle.FixedSingle,
                    Text = details
                };

                var contentPanel = new Panel
                {
                    Dock = DockStyle.Fill,
                    Padding = new Padding(12, 0, 12, 0),
                    BackColor = AppTheme.SurfaceColor
                };
                contentPanel.Controls.Add(detailsBox);
                contentPanel.Controls.Add(detailsLabel);

                Controls.Add(contentPanel);
            }

            Controls.Add(summaryLabel);
            Controls.Add(buttonPanel);

            AcceptButton = btnOk;
            CancelButton = btnOk;
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
