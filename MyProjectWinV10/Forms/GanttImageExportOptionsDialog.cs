using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class GanttImageExportOptionsDialog : Form
    {
        private readonly CheckBox _transparentBackground = new()
        {
            AutoSize = true,
            Checked = AppSettings.GanttExportTransparentBackground
        };

        private readonly Label _hint = new()
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextSecondary
        };

        public bool TransparentBackground => _transparentBackground.Checked;

        public GanttImageExportOptionsDialog(bool supportsTransparency)
        {
            Build(supportsTransparency);
            ApplyLocalization();
            AppLocalizer.LanguageChanged += OnLanguageChanged;
            FormClosed += (_, _) => AppLocalizer.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e) => ApplyLocalization();

        private void Build(bool supportsTransparency)
        {
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(460, supportsTransparency ? 168 : 96);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            _transparentBackground.Enabled = supportsTransparency;
            _transparentBackground.Visible = supportsTransparency;
            _hint.Visible = supportsTransparency;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16),
                ColumnCount = 1,
                RowCount = supportsTransparency ? 3 : 1
            };
            if (supportsTransparency)
            {
                layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
                layout.Controls.Add(_transparentBackground, 0, 0);
                layout.Controls.Add(_hint, 0, 1);
            }
            else
            {
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            }

            var btnOk = new Button
            {
                Text = AppLocalizer.Get("Common.OK"),
                DialogResult = DialogResult.OK,
                Width = 80,
                Height = 28
            };
            var btnCancel = new Button
            {
                Text = AppLocalizer.Get("Common.Cancel"),
                DialogResult = DialogResult.Cancel,
                Width = 80,
                Height = 28
            };

            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false
            };
            btnPanel.Controls.Add(btnCancel);
            btnPanel.Controls.Add(btnOk);
            layout.Controls.Add(btnPanel, 0, supportsTransparency ? 2 : 0);

            Controls.Add(layout);
            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }

        private void ApplyLocalization()
        {
            Text = AppLocalizer.Get("GanttExport.OptionsTitle");
            _transparentBackground.Text = AppLocalizer.Get("GanttExport.TransparentBackground");
            _hint.Text = AppLocalizer.Get("GanttExport.TransparentHint");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK && _transparentBackground.Enabled)
                AppSettings.SetGanttExportTransparentBackground(_transparentBackground.Checked);

            base.OnFormClosing(e);
        }
    }
}
