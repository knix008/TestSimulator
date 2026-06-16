using MyProject.Theme;
using System.Reflection;

namespace MyProject.Forms
{
    public sealed class AboutDialog : Form
    {
        public AboutDialog()
        {
            var asm = Assembly.GetExecutingAssembly();
            var info = asm.GetCustomAttribute<AssemblyProductAttribute>();
            string product = info?.Product ?? Application.ProductName ?? "MyProject";
            string version = AppVersion.DisplayVersion;
            string copyright = asm.GetCustomAttribute<AssemblyCopyrightAttribute>()?.Copyright
                ?? $"Copyright © {DateTime.Now.Year} SH KWON (knix008@naver.com)";

            Text = "About";
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

            var lblVersion = new Label
            {
                Text = $"Version {version}",
                Location = new Point(84, 56),
                AutoSize = true,
                MaximumSize = new Size(320, 0),
                Font = AppTheme.FontNormal,
                ForeColor = AppTheme.TextPrimary
            };

            var lblDescription = new Label
            {
                Text = "Windows Gantt chart project manager for tasks, dependencies, resources, progress, and chart notes.",
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

            var btnOk = new Button
            {
                Text = "OK",
                DialogResult = DialogResult.OK,
                Size = new Size(80, 28),
                Location = new Point(316, 198),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.Accent,
                ForeColor = Color.White
            };
            btnOk.FlatAppearance.BorderColor = AppTheme.AccentDark;

            Controls.AddRange(new Control[]
            {
                iconBox,
                lblProduct,
                lblVersion,
                lblDescription,
                lblCopyright,
                btnOk
            });
            AcceptButton = btnOk;
        }

        public static void ShowAbout(IWin32Window? owner)
        {
            using var dlg = new AboutDialog();
            dlg.ShowDialog(owner);
        }
    }
}
