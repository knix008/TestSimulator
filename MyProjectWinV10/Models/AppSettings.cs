using System.Text.Json;

namespace MyProject.Models
{
    public static class AppSettings
    {
        private static readonly string SettingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyProject",
            "settings.json");

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public static string LastDirectory { get; private set; } = GetDefaultDirectory();
        public static DependencyType DefaultDependencyType { get; private set; } = DependencyType.FS;

        public static void Load()
        {
            try
            {
                if (!File.Exists(SettingsPath))
                    return;

                var json = File.ReadAllText(SettingsPath, System.Text.Encoding.UTF8);
                var data = JsonSerializer.Deserialize<SettingsData>(json, JsonOptions);
                if (data == null || string.IsNullOrWhiteSpace(data.LastDirectory))
                    return;

                if (Directory.Exists(data.LastDirectory))
                    LastDirectory = data.LastDirectory;

                if (Enum.TryParse<DependencyType>(data.DefaultDependencyType, out var depType))
                    DefaultDependencyType = depType;
            }
            catch (Exception ex)
            {
                LastDirectory = GetDefaultDirectory();
                if (File.Exists(SettingsPath))
                    throw new InvalidDataException($"Could not read settings file: {SettingsPath}", ex);
            }
        }

        public static void Save()
        {
            try
            {
                var directory = Path.GetDirectoryName(SettingsPath);
                if (!string.IsNullOrEmpty(directory))
                    Directory.CreateDirectory(directory);

                var data = new SettingsData
                {
                    LastDirectory = LastDirectory,
                    DefaultDependencyType = DefaultDependencyType.ToString()
                };
                var json = JsonSerializer.Serialize(data, JsonOptions);
                File.WriteAllText(SettingsPath, json, System.Text.Encoding.UTF8);
            }
            catch (Exception ex)
            {
                throw new IOException($"Could not write settings file: {SettingsPath}", ex);
            }
        }

        public static void RememberFromPath(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            var directory = Path.GetDirectoryName(filePath);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
                return;

            if (string.Equals(LastDirectory, directory, StringComparison.OrdinalIgnoreCase))
                return;

            LastDirectory = directory;
            Save();
        }

        public static void RememberDependencyType(DependencyType type)
        {
            if (DefaultDependencyType == type)
                return;

            DefaultDependencyType = type;
            Save();
        }

        public static void ApplyTo(FileDialog dialog)
        {
            dialog.InitialDirectory = GetValidDirectory();
        }

        private static string GetValidDirectory() =>
            Directory.Exists(LastDirectory) ? LastDirectory : GetDefaultDirectory();

        private static string GetDefaultDirectory() =>
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

        private sealed class SettingsData
        {
            public string LastDirectory { get; set; } = "";
            public string DefaultDependencyType { get; set; } = "FS";
        }
    }
}
