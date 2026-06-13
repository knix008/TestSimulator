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
        public static int[] TaskGridColumnWidths { get; private set; } = DefaultTaskGridColumnWidths();

        private static int[] DefaultTaskGridColumnWidths() =>
            new[] { 32, 200, 58, 34, 30, 88, 120 };

        public static void Load()
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

            if (data.TaskGridColumnWidths is { Length: 7 })
                TaskGridColumnWidths = SanitizeColumnWidths(data.TaskGridColumnWidths);
        }

        public static void Save()
        {
            var directory = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            var data = new SettingsData
            {
                LastDirectory = LastDirectory,
                DefaultDependencyType = DefaultDependencyType.ToString(),
                TaskGridColumnWidths = TaskGridColumnWidths
            };
            var json = JsonSerializer.Serialize(data, JsonOptions);
            File.WriteAllText(SettingsPath, json, System.Text.Encoding.UTF8);
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

        public static void RememberTaskGridColumnWidths(int[] widths)
        {
            var sanitized = SanitizeColumnWidths(widths);
            if (sanitized.SequenceEqual(TaskGridColumnWidths))
                return;

            TaskGridColumnWidths = sanitized;
            Save();
        }

        private static int[] SanitizeColumnWidths(int[] widths)
        {
            var defaults = DefaultTaskGridColumnWidths();
            var result = new int[defaults.Length];
            for (int i = 0; i < result.Length; i++)
                result[i] = Math.Clamp(widths[i], GetMinColumnWidth(i), 800);
            return result;
        }

        private static int GetMinColumnWidth(int columnIndex) => columnIndex switch
        {
            0 => 28,
            1 => 80,
            2 => 52,
            3 => 30,
            4 => 28,
            5 => 48,
            6 => 48,
            _ => 24
        };

        public static int[] GetMinColumnWidths()
        {
            var defaults = DefaultTaskGridColumnWidths();
            return Enumerable.Range(0, defaults.Length).Select(GetMinColumnWidth).ToArray();
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
            public int[]? TaskGridColumnWidths { get; set; }
        }
    }
}
