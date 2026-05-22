using System.Text.Json;

namespace FileMasterWinV10.Helpers;

public class BookmarkManager
{
    private readonly string _filePath;
    private List<Bookmark> _bookmarks;

    public IReadOnlyList<Bookmark> Bookmarks => _bookmarks.AsReadOnly();

    public BookmarkManager()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            AppInfo.AppDataFolderName);
        Directory.CreateDirectory(dir);
        _filePath = Path.Combine(dir, "bookmarks.json");
        _bookmarks = Load();
    }

    public bool Add(string path, string name)
    {
        if (_bookmarks.Any(b => b.Path.Equals(path, StringComparison.OrdinalIgnoreCase))) return false;
        _bookmarks.Add(new Bookmark { Path = path, Name = name });
        Save();
        return true;
    }

    public void Remove(string path)
    {
        _bookmarks.RemoveAll(b => b.Path.Equals(path, StringComparison.OrdinalIgnoreCase));
        Save();
    }

    private List<Bookmark> Load()
    {
        if (!File.Exists(_filePath)) return new();
        try { return JsonSerializer.Deserialize<List<Bookmark>>(File.ReadAllText(_filePath)) ?? new(); }
        catch { return new(); }
    }

    private void Save() =>
        File.WriteAllText(_filePath, JsonSerializer.Serialize(_bookmarks, new JsonSerializerOptions { WriteIndented = true }));
}

public class Bookmark
{
    public string Path { get; set; } = "";
    public string Name { get; set; } = "";
}
