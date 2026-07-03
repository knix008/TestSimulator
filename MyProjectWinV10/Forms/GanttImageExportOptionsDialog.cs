using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    /// <summary>Gantt chart image export: file path, format, and transparent-background option.</summary>
    public sealed class GanttImageExportOptionsDialog : Form
    {
        private const int LabelColumnWidth = 72;

        private readonly TextBox _filePath = new() { Dock = DockStyle.Fill };
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
        private readonly Label _lblFile = new()
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
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
            ClientSize = new Size(520, 196);
            MinimumSize = new Size(520, 196);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16, 16, 16, 8),
                ColumnCount = 2,
                RowCount = 3
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColumnWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            var fileValueRow = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2
            };
            fileValueRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            fileValueRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            fileValueRow.Controls.Add(_filePath, 0, 0);
            fileValueRow.Controls.Add(_btnBrowse, 1, 0);
            _filePath.Margin = new Padding(0, 0, 8, 0);
            _btnBrowse.Margin = new Padding(0);
            _btnBrowse.Click += (_, _) => BrowseForFile();

            layout.Controls.Add(_lblFile, 0, 0);
            layout.Controls.Add(fileValueRow, 1, 0);
            layout.Controls.Add(_transparentBackground, 1, 1);
            layout.SetColumnSpan(_hint, 2);
            layout.Controls.Add(_hint, 0, 2);
            _transparentBackground.Margin = new Padding(0, 8, 0, 8);
            _hint.Margin = new Padding(0);

            _btnOk.DialogResult = DialogResult.None;
            _btnCancel.DialogResult = DialogResult.Cancel;
            _btnOk.Click += (_, _) => OnExportClick();

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8)
            };
            buttons.Controls.Add(_btnCancel);
            buttons.Controls.Add(_btnOk);

            Controls.Add(layout);
            Controls.Add(buttons);
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

            if (File.Exists(path)
                && MessageBox.Show(this,
                    AppLocalizer.Format("GanttExport.OverwritePrompt", path),
                    Text,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) != DialogResult.Yes)
            {
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
                    : Path.GetFileName(_filePath.Text),
                OverwritePrompt = true
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
