using System;
using System.Collections.Generic;
using System.IO;

namespace TerminalWinV10
{
    [Serializable]
    public class TerminalProfile
    {
        public string Name { get; set; } = "";
        public string ConnectionType { get; set; } = ConnectionTypes.Local;
        public string Port { get; set; } = "";
        public string Baud { get; set; } = "9600";
        public string IP { get; set; } = "127.0.0.1";
        public bool UseSsl { get; set; }
        public int MaxBufferLines { get; set; } = 1000;
        /// <summary>Local 연결 시 사용자 지정 CLI 경로 (비우면 COMSPEC).</summary>
        public string LocalShell { get; set; } = "";
    }

    public static class ProfileManager
    {
        private static string ProfileFile => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "profiles.json");

        public static List<TerminalProfile> LoadProfiles()
        {
            if (!File.Exists(ProfileFile)) return new List<TerminalProfile>();
            var json = File.ReadAllText(ProfileFile);
            return System.Text.Json.JsonSerializer.Deserialize<List<TerminalProfile>>(json) ?? new List<TerminalProfile>();
        }

        public static void SaveProfiles(List<TerminalProfile> profiles)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(profiles);
            File.WriteAllText(ProfileFile, json);
        }
    }
}
