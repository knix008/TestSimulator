using System.Text.Json;

namespace MemoPadV10;

internal static class EditorSettings
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static string SettingsFilePath => AppPaths.Combine("editor_settings.json");

    public sealed class Data
    {
        public string FontName { get; set; } = "맑은 고딕";
        public float FontSize { get; set; } = 12f;
        public string FontStyle { get; set; } = "Regular";
        public int ForeColorArgb { get; set; } = Color.Black.ToArgb();
        public int EditorBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
        public int FormBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
        public string Language { get; set; } = "ko";
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
        // Font 변경이 RTF 내용을 지울 수 있어 먼저 보존합니다.
        string? savedRtf = null;
        string savedText = editor.Text;
        try
        {
            if (!string.IsNullOrEmpty(editor.Rtf))
            {
                savedRtf = editor.Rtf;
            }
        }
        catch
        {
            savedRtf = null;
        }

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
        ApplyToolbarColor(form, form.BackColor);
        Loc.Language = Loc.Parse(data.Language);

        if (!string.IsNullOrEmpty(savedRtf))
        {
            try
            {
                editor.Rtf = savedRtf;
                return;
            }
            catch
            {
                // fall through
            }
        }

        if (!string.IsNullOrEmpty(savedText) && string.IsNullOrEmpty(editor.Text))
        {
            editor.Text = savedText;
        }
    }

    /// <summary>
    /// 상단 툴바가 배경과 완전히 같은 색(투명도 없이)으로 보이도록,
    /// 배경색을 불투명하게 그대로 반환합니다.
    /// </summary>
    public static Color DeriveToolbarColor(Color baseColor)
    {
        return Color.FromArgb(255, baseColor.R, baseColor.G, baseColor.B);
    }

    /// <summary>메인 폼에서 상단 툴바 패널(topBarPanel)을 찾아 배경색에 맞춘 색으로 칠합니다.</summary>
    public static void ApplyToolbarColor(Form form, Color baseColor)
    {
        foreach (Control c in form.Controls.Find("topBarPanel", true))
        {
            c.BackColor = DeriveToolbarColor(baseColor);
        }
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
            FormBackColorArgb = form.BackColor.ToArgb(),
            Language = Loc.Code(Loc.Language)
        };
    }
}
