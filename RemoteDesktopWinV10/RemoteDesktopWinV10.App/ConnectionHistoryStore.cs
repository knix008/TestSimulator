using System.Text.Json;
using System.Text.Json.Serialization;

namespace RemoteDesktopWinV10.App;

public static class ConnectionHistoryStore
{
    private const int MaxEntries = 24;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string HistoryFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "RemoteDesktopWinV10",
        "history.json");

    public static List<ConnectionHistoryEntry> Load()
    {
        try
        {
            if (!File.Exists(HistoryFilePath))
            {
                return new List<ConnectionHistoryEntry>();
            }

            var json = File.ReadAllText(HistoryFilePath);
            var doc = JsonSerializer.Deserialize<HistoryFile>(json, JsonOptions);
            return doc?.Entries ?? new List<ConnectionHistoryEntry>();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "연결 기록 파일을 읽거나 해석할 수 없습니다.\r\n경로: " + HistoryFilePath,
                ex);
        }
    }

    public static void Save(IReadOnlyList<ConnectionHistoryEntry> entries)
    {
        var dir = Path.GetDirectoryName(HistoryFilePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var data = new HistoryFile { Entries = entries.ToList() };
        var json = JsonSerializer.Serialize(data, JsonOptions);
        var tmp = HistoryFilePath + ".tmp";
        File.WriteAllText(tmp, json);
        File.Copy(tmp, HistoryFilePath, overwrite: true);
        File.Delete(tmp);
    }

    /// <summary>성공한 연결을 기록 맨 앞에 반영합니다(동일 호스트·포트·프로토콜은 갱신).</summary>
    public static void Record(RemoteDesktopProtocol protocol, string host, int port)
    {
        host = host.Trim();
        if (host.Length == 0)
        {
            return;
        }

        var list = Load();
        var now = DateTimeOffset.UtcNow;
        var existing = list.FirstOrDefault(e =>
            e.Port == port
            && string.Equals(e.Host, host, StringComparison.OrdinalIgnoreCase)
            && e.Protocol == protocol);

        if (existing != null)
        {
            list.Remove(existing);
            existing.LastUsed = now;
            list.Insert(0, existing);
        }
        else
        {
            list.Insert(0, new ConnectionHistoryEntry
            {
                Protocol = protocol,
                Host = host,
                Port = port,
                LastUsed = now,
            });
        }

        while (list.Count > MaxEntries)
        {
            list.RemoveAt(list.Count - 1);
        }

        Save(list);
    }

    private sealed class HistoryFile
    {
        public List<ConnectionHistoryEntry> Entries { get; set; } = new();
    }
}
