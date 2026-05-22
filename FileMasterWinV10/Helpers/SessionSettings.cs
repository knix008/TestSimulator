using System.Text.Json;

namespace FileMasterWinV10.Helpers;

public class SessionSettings
{
    private readonly string _filePath;

    public string? LeftPath { get; set; }
    public string? RightPath { get; set; }
    public int? SplitterDistance { get; set; }

    public SessionSettings()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "FileMasterWinV10");
        Directory.CreateDirectory(dir);
        _filePath = Path.Combine(dir, "session.json");
    }

    public void Load()
    {
        if (!File.Exists(_filePath)) return;
        try
        {
            var data = JsonSerializer.Deserialize<SessionData>(File.ReadAllText(_filePath));
            if (data == null) return;
            LeftPath = NormalizePath(data.LeftPath);
            RightPath = NormalizePath(data.RightPath);
            SplitterDistance = data.SplitterDistance;
        }
        catch { /* ignore corrupt session file */ }
    }

    public void Save(string leftPath, string rightPath, int? splitterDistance = null)
    {
        LeftPath = leftPath;
        RightPath = rightPath;
        SplitterDistance = splitterDistance;
        var data = new SessionData
        {
            LeftPath = leftPath,
            RightPath = rightPath,
            SplitterDistance = splitterDistance,
        };
        File.WriteAllText(_filePath, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static string? NormalizePath(string? path) =>
        !string.IsNullOrWhiteSpace(path) && Directory.Exists(path) ? path : null;

    private class SessionData
    {
        public string? LeftPath { get; set; }
        public string? RightPath { get; set; }
        public int? SplitterDistance { get; set; }
    }
}
