using System;
using System.Collections.Generic;
using System.IO;

namespace TerminalWinV10
{
    [Serializable]
    public class TerminalProfile
    {
        public string Name { get; set; }
        public string ConnectionType { get; set; }
        public string Port { get; set; }
        public string Baud { get; set; }
        public string IP { get; set; }
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
