using System.Text.Json;

namespace FTPServerWinV10.Server
{
    public class ServerSettings
    {
        public string SharedFolder { get; set; } = "";
        public string CertPath { get; set; } = "";
        public string CertPassword { get; set; } = "";
        public bool AllowAnonymous { get; set; }
        public string UserId { get; set; } = "";
        public string UserPassword { get; set; } = "";
        public int BufferSizeKb { get; set; }
        public int MaxThreads { get; set; }

        public static void Save(string file, ServerSettings settings)
        {
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(file, json);
        }

        public static ServerSettings? Load(string file)
        {
            if (!File.Exists(file)) return null;
            var json = File.ReadAllText(file);
            return JsonSerializer.Deserialize<ServerSettings>(json);
        }
    }
}
