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
            string version = Application.ProductVersion;
            string copyright = asm.GetCustomAttribute<AssemblyCopyrightAttribute>()?.Copyright
                ?? $"Copyright © {DateTime.Now.Year}";

            Text = "About";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(420, 240);
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
                Location = new Point(24, 20),
                Size = new Size(48, 48),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            if (Icon != null)
                iconBox.Image = Icon.ToBitmap();

            var lblProduct = new Label
            {
                Text = product,
                Location = new Point(84, 22),
                Size = new Size(320, 24),
                Font = new Font(AppTheme.FontNormal.FontFamily, 12f, FontStyle.Bold),
                ForeColor = AppTheme.TextPrimary
            };

            var lblVersion = new Label
            {
                Text = $"Version {version}",
                Location = new Point(84, 48),
                Size = new Size(320, 20),
                ForeColor = AppTheme.TextSecondary
            };

            var lblDescription = new Label
            {
                Text = "Windows Gantt chart project manager for tasks, dependencies, resources, progress, and chart notes.",
                Location = new Point(24, 84),
                Size = new Size(372, 56),
                ForeColor = AppTheme.TextPrimary
            };

            var lblCopyright = new Label
            {
                Text = copyright,
                Location = new Point(24, 148),
                Size = new Size(372, 20),
                ForeColor = AppTheme.TextSecondary
            };

            var btnOk = new Button
            {
                Text = "OK",
                DialogResult = DialogResult.OK,
                Size = new Size(80, 28),
                Location = new Point(316, 188),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.Accent,
                ForeColor = Color.White
            };
            btnOk.FlatAppearance.BorderColor = AppTheme.AccentDark;

            Controls.AddRange(new Control[] { iconBox, lblProduct, lblVersion, lblDescription, lblCopyright, btnOk });
            AcceptButton = btnOk;
        }

        public static void ShowAbout(IWin32Window? owner)
        {
            using var dlg = new AboutDialog();
            dlg.ShowDialog(owner);
        }
    }
}
