using System.Text.Json;

namespace MemoPadV10;

internal static class EditorSettings
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static string SettingsFilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MemoPadV10",
        "editor_settings.json");

    public sealed class Data
    {
        public string FontName { get; set; } = "맑은 고딕";
        public float FontSize { get; set; } = 12f;
        public string FontStyle { get; set; } = "Regular";
        public int ForeColorArgb { get; set; } = Color.Black.ToArgb();
        public int EditorBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
        public int FormBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
    }

    public static Data LoadDefaults() => new();

    public static Data? TryLoad()
    {
        try
        {
            if (!File.Exists(SettingsFilePath))
            {
                return null;
            }

            string json = File.ReadAllText(SettingsFilePath);
            return JsonSerializer.Deserialize<Data>(json);
        }
        catch
        {
            return null;
        }
    }

    public static void Save(Data data)
    {
        string? dir = Path.GetDirectoryName(SettingsFilePath);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        string json = JsonSerializer.Serialize(data, JsonOptions);
        File.WriteAllText(SettingsFilePath, json);
    }

    public static System.Drawing.FontStyle ParseFontStyle(string? name)
    {
        return Enum.TryParse<System.Drawing.FontStyle>(name, true, out var s)
            ? s
            : System.Drawing.FontStyle.Regular;
    }

    public static string FontStyleToString(System.Drawing.FontStyle style) => style.ToString();

    public static void ApplyToUi(RichTextBox editor, Form form, Data data)
    {
        try
        {
            FontStyle st = ParseFontStyle(data.FontStyle);
            using Font f = new(data.FontName, data.FontSize, st, GraphicsUnit.Point);
            editor.Font = new Font(f.FontFamily, f.Size, f.Style, GraphicsUnit.Point);
        }
        catch
        {
            editor.Font = new Font("맑은 고딕", data.FontSize, FontStyle.Regular, GraphicsUnit.Point);
        }

        editor.ForeColor = Color.FromArgb(data.ForeColorArgb);
        editor.BackColor = Color.FromArgb(data.EditorBackColorArgb);
        form.BackColor = Color.FromArgb(data.FormBackColorArgb);
    }

    public static Data CaptureFromUi(RichTextBox editor, Form form)
    {
        return new Data
        {
            FontName = editor.Font.FontFamily.Name,
            FontSize = editor.Font.SizeInPoints,
            FontStyle = FontStyleToString(editor.Font.Style),
            ForeColorArgb = editor.ForeColor.ToArgb(),
            EditorBackColorArgb = editor.BackColor.ToArgb(),
            FormBackColorArgb = form.BackColor.ToArgb()
        };
    }
}
