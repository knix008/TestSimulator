using System.ComponentModel;
using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Controls;

[ToolboxItem(true)]
public partial class PreviewPanel : Panel
{
    private static readonly HashSet<string> ImageExts = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".ico", ".tiff", ".tif", ".webp" };

    private static readonly HashSet<string> TextExts = new(StringComparer.OrdinalIgnoreCase)
        { ".txt", ".cs", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".md",
          ".log", ".ini", ".cfg", ".yaml", ".yml", ".py", ".java", ".cpp", ".c", ".h",
          ".sh", ".bat", ".ps1", ".sql", ".csv", ".tsv", ".toml", ".gitignore" };

    public PreviewPanel()
    {
        InitializeComponent();
        if (!AppIconHelper.IsDesignMode(this))
        {
            BackColor = UiTheme.Surface;
            textBox.Font = UiTheme.MonoFont;
            infoLabel.Font = UiTheme.UiFont;
            infoLabel.ForeColor = UiTheme.TextSecondary;
        }
    }

    public void Preview(string? path)
    {
        if (AppIconHelper.IsDesignMode(this)) return;

        pictureBox.Visible = false;
        textBox.Visible = false;
        infoLabel.Visible = true;

        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            infoLabel.Text = "파일을 선택하면 미리보기가 표시됩니다.";
            return;
        }

        var ext = Path.GetExtension(path);

        if (ImageExts.Contains(ext))
        {
            try
            {
                pictureBox.Image?.Dispose();
                pictureBox.Image = Image.FromFile(path);
                pictureBox.Visible = true;
                infoLabel.Visible = false;
            }
            catch
            {
                infoLabel.Text = "이미지를 불러올 수 없습니다.";
            }
        }
        else if (TextExts.Contains(ext))
        {
            try
            {
                var info = new FileInfo(path);
                if (info.Length > 2 * 1024 * 1024)
                {
                    infoLabel.Text = $"파일이 너무 큽니다 ({Models.FileEntry.FormatSize(info.Length)}).\n미리보기는 최대 2MB까지 지원합니다.";
                    return;
                }
                textBox.Text = File.ReadAllText(path);
                textBox.Visible = true;
                infoLabel.Visible = false;
            }
            catch (Exception ex)
            {
                infoLabel.Text = $"파일을 읽을 수 없습니다.\n{ex.Message}";
            }
        }
        else
        {
            var info = new FileInfo(path);
            string typeStr = ext.Length > 1 ? ext[1..].ToUpper() + " 파일" : "파일";
            infoLabel.Text =
                $"{info.Name}\n\n" +
                $"종류: {typeStr}\n" +
                $"크기: {Models.FileEntry.FormatSize(info.Length)}\n" +
                $"수정: {info.LastWriteTime:yyyy-MM-dd HH:mm:ss}\n" +
                $"생성: {info.CreationTime:yyyy-MM-dd HH:mm:ss}";
        }
    }

    public void Clear()
    {
        if (AppIconHelper.IsDesignMode(this)) return;

        pictureBox.Visible = false;
        pictureBox.Image?.Dispose();
        pictureBox.Image = null;
        textBox.Visible = false;
        textBox.Clear();
        infoLabel.Visible = true;
        infoLabel.Text = "파일을 선택하면 미리보기가 표시됩니다.";
    }
}
