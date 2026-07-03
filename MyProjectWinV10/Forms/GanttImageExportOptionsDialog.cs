using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    /// <summary>Gantt chart image export: file path, format, and transparent-background option.</summary>
    public sealed class GanttImageExportOptionsDialog : Form
    {
        private readonly TextBox _filePath = new() { Dock = DockStyle.Fill };
        private readonly CheckBox _transparentBackground = new()
        {
            AutoSize = true,
            Checked = AppSettings.GanttExportTransparentBackground
        };
        private readonly Label _hint = new()
        {
            AutoSize = false,
            Height = 48,
            ForeColor = AppTheme.TextSecondary
        };
        private readonly Label _lblFile = new()
        {
            AutoSize = true,
            ForeColor = AppTheme.TextSecondary
        };
        private readonly Button _btnBrowse = new() { AutoSize = true };
        private readonly Button _btnOk = new() { Size = new Size(88, 28) };
        private readonly Button _btnCancel = new() { Size = new Size(88, 28) };

        public string SelectedFilePath => _filePath.Text.Trim();

        public bool TransparentBackground => _transparentBackground.Checked;

        public GanttImageExportOptionsDialog(string defaultFileName)
        {
            _filePath.Text = Path.Combine(
                AppSettings.LastDirectory,
                $"{defaultFileName}.png");

            Build();
            ApplyLocalization();
            AppLocalizer.LanguageChanged += OnLanguageChanged;
            FormClosed += (_, _) => AppLocalizer.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e) => ApplyLocalization();

        private void Build()
        {
            Text = "Gantt Image Export";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            ClientSize = new Size(500, 210);
            MinimumSize = new Size(500, 210);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16),
                ColumnCount = 1,
                RowCount = 4
            };
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

            var fileRow = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 3,
                Margin = new Padding(0, 0, 0, 8)
            };
            fileRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            fileRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            fileRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            fileRow.Controls.Add(_lblFile, 0, 0);
            fileRow.Controls.Add(_filePath, 1, 0);
            fileRow.Controls.Add(_btnBrowse, 2, 0);
            _lblFile.Margin = new Padding(0, 6, 8, 0);
            _filePath.Margin = new Padding(0, 0, 8, 0);
            _btnBrowse.Margin = new Padding(0);
            _btnBrowse.Click += (_, _) => BrowseForFile();

            root.Controls.Add(fileRow, 0, 0);
            root.Controls.Add(_transparentBackground, 0, 1);
            root.Controls.Add(_hint, 0, 2);

            _btnOk.DialogResult = DialogResult.None;
            _btnCancel.DialogResult = DialogResult.Cancel;
            _btnOk.Click += (_, _) => OnExportClick();

            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false
            };
            btnPanel.Controls.Add(_btnCancel);
            btnPanel.Controls.Add(_btnOk);
            root.Controls.Add(btnPanel, 0, 3);

            Controls.Add(root);
            AcceptButton = _btnOk;
            CancelButton = _btnCancel;
        }

        private void OnExportClick()
        {
            string path = SelectedFilePath;
            if (string.IsNullOrWhiteSpace(path))
            {
                MessageBox.Show(this,
                    AppLocalizer.Get("GanttExport.EmptyPath"),
                    Text,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            string? directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directory))
                Directory.CreateDirectory(directory);

            AppSettings.SetGanttExportTransparentBackground(_transparentBackground.Checked);
            DialogResult = DialogResult.OK;
            Close();
        }

        private void BrowseForFile()
        {
            using var dlg = new SaveFileDialog
            {
                Filter =
                    "PNG Image (*.png)|*.png|JPEG Image (*.jpg)|*.jpg;*.jpeg|GIF Image (*.gif)|*.gif|WebP Image (*.webp)|*.webp",
                DefaultExt = "png",
                FileName = string.IsNullOrWhiteSpace(_filePath.Text)
                    ? "Gantt.png"
                    : Path.GetFileName(_filePath.Text)
            };
            AppSettings.ApplyTo(dlg);

            string? initialDir = Path.GetDirectoryName(_filePath.Text);
            if (!string.IsNullOrWhiteSpace(initialDir) && Directory.Exists(initialDir))
                dlg.InitialDirectory = initialDir;

            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;

            _filePath.Text = dlg.FileName;
        }

        private void ApplyLocalization()
        {
            Text = AppLocalizer.Get("GanttExport.OptionsTitle");
            _lblFile.Text = AppLocalizer.Get("GanttExport.FilePath");
            _btnBrowse.Text = AppLocalizer.Get("GanttExport.Browse");
            _transparentBackground.Text = AppLocalizer.Get("GanttExport.TransparentBackground");
            _hint.Text = AppLocalizer.Get("GanttExport.TransparentHint");
            _btnOk.Text = AppLocalizer.Get("GanttExport.Export");
            _btnCancel.Text = AppLocalizer.Get("Common.Cancel");
        }
    }
}
