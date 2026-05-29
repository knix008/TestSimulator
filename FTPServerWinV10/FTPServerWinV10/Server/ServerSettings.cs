using System.Text.Json;

namespace FTPServerWinV10.Server
{
    public class ServerSettings
    {
        public List<SharedFolderEntry> SharedFolders { get; set; } = new();
        public string CertPath { get; set; } = "";
        public string CertPassword { get; set; } = "";
        /// <summary>SFTP SSH 호스트 키 PEM 경로 (비어 있으면 기본 경로).</summary>
        public string SftpHostKeyPath { get; set; } = "";
        public bool AllowAnonymous { get; set; }
        public List<UserEntry> Users { get; set; } = new();
        public int BufferSizeKb { get; set; }
        public int MaxThreads { get; set; }
        public ProtocolSettings Protocols { get; set; } = new();

        private static readonly JsonSerializerOptions _jsonOpts =
            new JsonSerializerOptions { WriteIndented = true };

        // ── Single-file save/load (legacy / default) ──────────────────────────────
        public static void Save(string file, ServerSettings settings) =>
            File.WriteAllText(file, JsonSerializer.Serialize(settings, _jsonOpts));

        public static ServerSettings? Load(string file)
        {
            if (!File.Exists(file)) return null;
            return JsonSerializer.Deserialize<ServerSettings>(File.ReadAllText(file));
        }

        // ── Profile management ────────────────────────────────────────────────────
        private static string ProfilesDir =>
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "profiles");

        public static string[] GetProfileNames()
        {
            if (!Directory.Exists(ProfilesDir)) return Array.Empty<string>();
            return Directory.GetFiles(ProfilesDir, "*.json")
                .Select(f => Path.GetFileNameWithoutExtension(f))
                .OrderBy(n => n)
                .ToArray();
        }

        public static void SaveProfile(string name, ServerSettings settings)
        {
            Directory.CreateDirectory(ProfilesDir);
            Save(Path.Combine(ProfilesDir, name + ".json"), settings);
        }

        public static ServerSettings? LoadProfile(string name) =>
            Load(Path.Combine(ProfilesDir, name + ".json"));

        public static void DeleteProfile(string name)
        {
            var path = Path.Combine(ProfilesDir, name + ".json");
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
