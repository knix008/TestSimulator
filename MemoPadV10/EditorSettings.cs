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
        /// <summary>새 메모·미저장 창 기본 투명도(0=불투명 … 100=최대 투명).</summary>
        public int WindowTransparencyPercent { get; set; }
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

    public static void ApplyToUi(RichTextBox editor, Form form, Data data, bool applyLanguage = true)
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
        if (applyLanguage)
        {
            Loc.Language = Loc.Parse(data.Language);
        }

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

    public static void ApplyLook(RichTextBox editor, Form form, MemoLookData look)
    {
        ApplyToUi(editor, form, look.ToEditorSettings(Loc.Code(Loc.Language)), applyLanguage: false);
        ApplyWindowTransparency(form, look.TransparencyPercent);
    }

    /// <summary>
    /// 상단 툴바가 배경과 완전히 같은 색(투명도 없이)으로 보이도록,
    /// 배경색을 불투명하게 그대로 반환합니다.
    /// </summary>
    public static Color DeriveToolbarColor(Color baseColor)
    {
        return Color.FromArgb(255, baseColor.R, baseColor.G, baseColor.B);
    }

    /// <summary>투명도(0=불투명 … 100=최대 투명)를 WinForms Opacity로 적용합니다.</summary>
    public static double TransparencyToOpacity(int transparencyPercent)
    {
        int t = Math.Clamp(transparencyPercent, 0, 100);
        // 창을 완전히 잃어버리지 않도록 하한 15% 불투명도를 둡니다.
        return Math.Clamp(1.0 - (t / 100.0), 0.15, 1.0);
    }

    public static int ClampTransparencyPercent(int transparencyPercent) =>
        Math.Clamp(transparencyPercent, 0, 100);

    public static void ApplyWindowTransparency(Form form, int transparencyPercent)
    {
        double opacity = TransparencyToOpacity(transparencyPercent);
        // Opacity < 1 이려면 AllowTransparency가 필요합니다(일부 환경에서 무시되는 경우 방지).
        if (opacity < 1.0)
        {
            form.AllowTransparency = true;
        }

        form.Opacity = opacity;
    }

    public static int ReadTransparencyPercent()
    {
        EditorSettings.Data data = TryLoad() ?? LoadDefaults();
        return ClampTransparencyPercent(data.WindowTransparencyPercent);
    }

    public static void SaveTransparencyPercent(int transparencyPercent)
    {
        EditorSettings.Data data = TryLoad() ?? LoadDefaults();
        data.WindowTransparencyPercent = ClampTransparencyPercent(transparencyPercent);
        Save(data);
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
