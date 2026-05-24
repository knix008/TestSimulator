namespace MIDIMasterWinV10.Core;

internal static class SoundFontPaths
{
    public const string FileName = "TimGM6mb.sf2";

    public static string GetDefaultPath()
    {
        string baseDir = AppContext.BaseDirectory;
        return Path.Combine(baseDir, "SoundFonts", FileName);
    }

    public static string RequireDefault()
    {
        string path = GetDefaultPath();
        if (!File.Exists(path))
            throw new FileNotFoundException(
                $"SoundFont 파일을 찾을 수 없습니다.\n{path}\n\nTimGM6mb.sf2가 SoundFonts 폴더에 있어야 합니다.",
                path);
        return path;
    }
}
