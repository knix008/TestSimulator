using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Controls;

public class PreviewPanel : Panel
{
    private readonly PictureBox _pictureBox;
    private readonly RichTextBox _textBox;
    private readonly Label _infoLabel;

    private static readonly HashSet<string> ImageExts = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".ico", ".tiff", ".tif", ".webp" };

    private static readonly HashSet<string> TextExts = new(StringComparer.OrdinalIgnoreCase)
        { ".txt", ".cs", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".md",
          ".log", ".ini", ".cfg", ".yaml", ".yml", ".py", ".java", ".cpp", ".c", ".h",
          ".sh", ".bat", ".ps1", ".sql", ".csv", ".tsv", ".toml", ".gitignore" };

    public PreviewPanel()
    {
        BackColor = UiTheme.Surface;
        Padding = new Padding(8);

        _pictureBox = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            Visible = false,
            BackColor = Color.FromArgb(32, 36, 42),
        };
        _textBox = new RichTextBox
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            Visible = false,
            Font = UiTheme.MonoFont,
            ScrollBars = RichTextBoxScrollBars.Both,
            WordWrap = false,
            BackColor = UiTheme.Surface,
            BorderStyle = BorderStyle.None,
        };
        _infoLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = UiTheme.UiFont,
            ForeColor = UiTheme.TextSecondary,
            Text = "파일을 선택하면 미리보기가 표시됩니다.",
        };

        Controls.Add(_pictureBox);
        Controls.Add(_textBox);
        Controls.Add(_infoLabel);
    }

    public void Preview(string? path)
    {
        _pictureBox.Visible = false;
        _textBox.Visible = false;
        _infoLabel.Visible = true;

        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            _infoLabel.Text = "파일을 선택하면 미리보기가 표시됩니다.";
            return;
        }

        var ext = Path.GetExtension(path);

        if (ImageExts.Contains(ext))
        {
            try
            {
                _pictureBox.Image?.Dispose();
                _pictureBox.Image = Image.FromFile(path);
                _pictureBox.Visible = true;
                _infoLabel.Visible = false;
            }
            catch
            {
                _infoLabel.Text = "이미지를 불러올 수 없습니다.";
            }
        }
        else if (TextExts.Contains(ext))
        {
            try
            {
                var info = new FileInfo(path);
                if (info.Length > 2 * 1024 * 1024)
                {
                    _infoLabel.Text = $"파일이 너무 큽니다 ({Models.FileEntry.FormatSize(info.Length)}).\n미리보기는 최대 2MB까지 지원합니다.";
                    return;
                }
                _textBox.Text = File.ReadAllText(path);
                _textBox.Visible = true;
                _infoLabel.Visible = false;
            }
            catch (Exception ex)
            {
                _infoLabel.Text = $"파일을 읽을 수 없습니다.\n{ex.Message}";
            }
        }
        else
        {
            var info = new FileInfo(path);
            string typeStr = ext.Length > 1 ? ext[1..].ToUpper() + " 파일" : "파일";
            _infoLabel.Text =
                $"{info.Name}\n\n" +
                $"종류: {typeStr}\n" +
                $"크기: {Models.FileEntry.FormatSize(info.Length)}\n" +
                $"수정: {info.LastWriteTime:yyyy-MM-dd HH:mm:ss}\n" +
                $"생성: {info.CreationTime:yyyy-MM-dd HH:mm:ss}";
        }
    }

    public void Clear()
    {
        _pictureBox.Visible = false;
        _pictureBox.Image?.Dispose();
        _pictureBox.Image = null;
        _textBox.Visible = false;
        _textBox.Clear();
        _infoLabel.Visible = true;
        _infoLabel.Text = "파일을 선택하면 미리보기가 표시됩니다.";
    }
}
