using MyProject.Theme;
using System.Reflection;

namespace MyProject.Forms
{
    public sealed class AboutDialog : Form
    {
        private readonly Label _lblVersion;
        private readonly Label _lblDescription;
        private readonly Button _btnOk;

        public AboutDialog()
        {
            var asm = Assembly.GetExecutingAssembly();
            var info = asm.GetCustomAttribute<AssemblyProductAttribute>();
            string product = info?.Product ?? Application.ProductName ?? "MyProject";
            string version = AppVersion.DisplayVersion;
            string copyright = asm.GetCustomAttribute<AssemblyCopyrightAttribute>()?.Copyright
                ?? $"Copyright © {DateTime.Now.Year} SH KWON (knix008@naver.com)";

            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(420, 250);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;
            ShowInTaskbar = false;

            try
            {
                string? exePath = Application.ExecutablePath;
                if (!string.IsNullOrEmpty(exePath))
                    Icon = Icon.ExtractAssociatedIcon(exePath);
            }
            catch
            {
                // optional
            }

            var iconBox = new PictureBox
            {
                Location = new Point(24, 24),
                Size = new Size(48, 48),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            if (Icon != null)
                iconBox.Image = Icon.ToBitmap();

            var lblProduct = new Label
            {
                Text = product,
                Location = new Point(84, 24),
                AutoSize = true,
                MaximumSize = new Size(320, 0),
                Font = new Font(AppTheme.FontNormal.FontFamily, 12f, FontStyle.Bold),
                ForeColor = AppTheme.TextPrimary
            };

            _lblVersion = new Label
            {
                Location = new Point(84, 56),
                AutoSize = true,
                MaximumSize = new Size(320, 0),
                Font = AppTheme.FontNormal,
                ForeColor = AppTheme.TextPrimary
            };

            _lblDescription = new Label
            {
                Location = new Point(24, 96),
                Size = new Size(372, 56),
                ForeColor = AppTheme.TextPrimary
            };

            var lblCopyright = new Label
            {
                Text = copyright,
                Location = new Point(24, 160),
                AutoSize = true,
                MaximumSize = new Size(372, 0),
                ForeColor = AppTheme.TextSecondary
            };

            _btnOk = new Button
            {
                DialogResult = DialogResult.OK,
                Size = new Size(80, 28),
                Location = new Point(316, 198),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.Accent,
                ForeColor = Color.White
            };
            _btnOk.FlatAppearance.BorderColor = AppTheme.AccentDark;

            Controls.AddRange(new Control[]
            {
                iconBox,
                lblProduct,
                _lblVersion,
                _lblDescription,
                lblCopyright,
                _btnOk
            });
            AcceptButton = _btnOk;

            ApplyLocalization();
            AppLocalizer.LanguageChanged += OnLanguageChanged;
            FormClosed += (_, _) => AppLocalizer.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e) => ApplyLocalization();

        private void ApplyLocalization()
        {
            Text = AppLocalizer.Get("About.Title");
            _lblVersion.Text = AppLocalizer.Format("About.Version", AppVersion.DisplayVersion);
            _lblDescription.Text = AppLocalizer.Get("About.Description");
            _btnOk.Text = AppLocalizer.Get("Common.OK");
        }

        public static void ShowAbout(IWin32Window? owner)
        {
            using var dlg = new AboutDialog();
            dlg.ShowDialog(owner);
        }
    }
}
