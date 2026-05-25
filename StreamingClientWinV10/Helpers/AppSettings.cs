using System;
using System.IO;
using System.Text.Json;

namespace StreamingClientWinV10.Helpers
{
    public class AppSettings
    {
        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "StreamingClientWinV10", "settings.json");

        public string ServerUrl { get; set; } = "http://localhost:5000";

        private static AppSettings? _instance;
        public static AppSettings Instance => _instance ??= Load();

        private static AppSettings Load()
        {
            try
            {
                if (File.Exists(FilePath))
                {
                    var json = File.ReadAllText(FilePath);
                    return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
                }
            }
            catch { }
            return new AppSettings();
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
                File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { }
        }
    }
}
