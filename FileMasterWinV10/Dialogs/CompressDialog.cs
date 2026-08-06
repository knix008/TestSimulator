using System.IO.Compression;
using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public class CompressOptions
{
    public string DestPath { get; set; } = "";
    public CompressionLevel Level { get; set; } = CompressionLevel.Optimal;
    public long SplitSizeBytes { get; set; } = 0;
}

public class CompressDialog : Form
{
    private readonly string[] _sourcePaths;
    private readonly TextBox _nameBox;
    private readonly TextBox _destBox;
    private readonly ComboBox _levelCombo;
    private readonly CheckBox _splitCheck;
    private readonly ComboBox _splitPreset;
    private readonly NumericUpDown _customSizeBox;
    private readonly ComboBox _unitCombo;
    private readonly Label _summaryLabel;

    public CompressOptions? Result { get; private set; }

    public CompressDialog(string[] sourcePaths, string defaultDir)
    {
        _sourcePaths = sourcePaths;

        Text = "압축 파일 만들기";
        Size = new Size(520, 420);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);

        int y = 14;

        // 파일 이름
        AddLabel("압축 파일 이름:", 12, y);
        _nameBox = AddTextBox(130, y, 360, SuggestName());
        y += 34;

        // 저장 위치
        AddLabel("저장 위치:", 12, y);
        _destBox = AddTextBox(130, y, 314, defaultDir);
        var browseBtn = new Button { Text = "...", Location = new Point(448, y - 1), Size = new Size(44, 24) };
        browseBtn.Click += BrowseDest;
        Controls.Add(browseBtn);
        y += 34;

        // 압축 수준
        AddLabel("압축 수준:", 12, y);
        _levelCombo = new ComboBox { Location = new Point(130, y), Width = 200, DropDownStyle = ComboBoxStyle.DropDownList };
        _levelCombo.Items.AddRange(new object[] { "빠름 (Fastest)", "보통 (Optimal)", "최고 압축 (SmallestSize)", "압축 없음 (NoCompression)" });
        _levelCombo.SelectedIndex = 1;
        Controls.Add(_levelCombo);
        y += 38;

        // 분할 압축 그룹
        var splitGroup = new GroupBox
        {
            Text = "분할 압축",
            Location = new Point(12, y),
            Size = new Size(480, 110),
            Font = new Font("Segoe UI", 9f),
        };
        y += 118;

        _splitCheck = new CheckBox { Text = "분할 압축 사용", Location = new Point(10, 24), AutoSize = true };

        var presetLabel = new Label { Text = "분할 크기:", Location = new Point(10, 56), AutoSize = true };
        _splitPreset = new ComboBox
        {
            Location = new Point(80, 53),
            Width = 130,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Enabled = false,
        };
        _splitPreset.Items.AddRange(new object[] { "1 MB", "10 MB", "25 MB", "50 MB", "100 MB", "700 MB", "사용자 정의" });
        _splitPreset.SelectedIndex = 1;

        var customLabel = new Label { Text = "직접 입력:", Location = new Point(222, 56), AutoSize = true };
        _customSizeBox = new NumericUpDown
        {
            Location = new Point(298, 53),
            Width = 80,
            Minimum = 1,
            Maximum = 99999,
            Value = 10,
            Enabled = false,
        };
        _unitCombo = new ComboBox
        {
            Location = new Point(382, 53),
            Width = 68,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Enabled = false,
        };
        _unitCombo.Items.AddRange(new object[] { "KB", "MB", "GB" });
        _unitCombo.SelectedIndex = 1;

        _splitCheck.CheckedChanged += (_, _) =>
        {
            bool on = _splitCheck.Checked;
            _splitPreset.Enabled = on;
            UpdateCustomEnabled();
        };
        _splitPreset.SelectedIndexChanged += (_, _) => UpdateCustomEnabled();

        splitGroup.Controls.AddRange(new Control[]
        {
            _splitCheck, presetLabel, _splitPreset, customLabel, _customSizeBox, _unitCombo,
        });
        Controls.Add(splitGroup);

        // 선택 항목 요약
        _summaryLabel = new Label
        {
            Location = new Point(12, y + 2),
            Size = new Size(480, 18),
            ForeColor = SystemColors.GrayText,
            Text = BuildSummary(),
        };
        Controls.Add(_summaryLabel);
        y += 28;

        // 버튼
        var ok = new Button { Text = "압축 시작", Location = new Point(310, y), Size = new Size(90, 28) };
        var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Location = new Point(406, y), Size = new Size(80, 28) };
        ok.Click += OnOk;
        AcceptButton = ok;
        CancelButton = cancel;
        Controls.AddRange(new Control[] { ok, cancel });
    }

    private void UpdateCustomEnabled()
    {
        bool isCustom = _splitCheck.Checked && _splitPreset.SelectedIndex == _splitPreset.Items.Count - 1;
        _customSizeBox.Enabled = isCustom;
        _unitCombo.Enabled = isCustom;
    }

    private void BrowseDest(object? sender, EventArgs e)
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = "압축 파일을 저장할 폴더를 선택하세요.",
            SelectedPath = _destBox.Text,
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
            _destBox.Text = dlg.SelectedPath;
    }

    private void OnOk(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_nameBox.Text))
        {
            ThemedMessageBox.Show(this, LocalizationService.T("Dlg_CompressName"), LocalizationService.T("Dlg_Notice"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!Directory.Exists(_destBox.Text))
        {
            ThemedMessageBox.Show(this, LocalizationService.T("Dlg_CompressDest"), LocalizationService.T("Dlg_Notice"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string name = _nameBox.Text.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)
            ? _nameBox.Text
            : _nameBox.Text + ".zip";
        string destPath = Path.Combine(_destBox.Text, name);

        long splitBytes = 0;
        if (_splitCheck.Checked)
        {
            if (_splitPreset.SelectedIndex < _splitPreset.Items.Count - 1)
            {
                long[] presetMb = { 1, 10, 25, 50, 100, 700 };
                splitBytes = presetMb[_splitPreset.SelectedIndex] * 1024 * 1024;
            }
            else
            {
                long unit = _unitCombo.SelectedIndex switch { 0 => 1024L, 2 => 1024L * 1024 * 1024, _ => 1024L * 1024 };
                splitBytes = (long)_customSizeBox.Value * unit;
            }
            if (splitBytes < 65536)
            {
                ThemedMessageBox.Show(this, LocalizationService.T("Dlg_CompressSplitMin"), LocalizationService.T("Dlg_Notice"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
        }

        var levels = new[]
        {
            CompressionLevel.Fastest,
            CompressionLevel.Optimal,
            CompressionLevel.SmallestSize,
            CompressionLevel.NoCompression,
        };

        Result = new CompressOptions
        {
            DestPath = destPath,
            Level = levels[_levelCombo.SelectedIndex],
            SplitSizeBytes = splitBytes,
        };
        DialogResult = DialogResult.OK;
    }

    private string SuggestName()
    {
        if (_sourcePaths.Length == 1)
        {
            string n = Path.GetFileName(_sourcePaths[0]);
            return (string.IsNullOrEmpty(Path.GetExtension(n)) ? n : Path.GetFileNameWithoutExtension(n)) + ".zip";
        }
        string parent = Path.GetFileName(Path.GetDirectoryName(_sourcePaths[0]) ?? "") ?? "archive";
        return (string.IsNullOrEmpty(parent) ? "archive" : parent) + ".zip";
    }

    private string BuildSummary()
    {
        int dirs = _sourcePaths.Count(Directory.Exists);
        int files = _sourcePaths.Count(File.Exists);
        var parts = new List<string>();
        if (dirs > 0) parts.Add($"폴더 {dirs}개");
        if (files > 0) parts.Add($"파일 {files}개");
        return $"선택된 항목: {string.Join(", ", parts)}";
    }

    private Label AddLabel(string text, int x, int y)
    {
        var lbl = new Label { Text = text, Location = new Point(x, y + 4), AutoSize = true };
        Controls.Add(lbl);
        return lbl;
    }

    private TextBox AddTextBox(int x, int y, int width, string text)
    {
        var tb = new TextBox { Location = new Point(x, y), Width = width, Text = text };
        Controls.Add(tb);
        return tb;
    }
}
