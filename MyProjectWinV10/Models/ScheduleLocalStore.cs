using System.Text.Json;

namespace MyProject.Models
{
    /// <summary>
    /// Per-user project settings and view layout for a shared database schedule.
    /// Project name, start date, working week, dependency defaults, and UI state stay local only.
    /// </summary>
    public static class ScheduleLocalStore
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        private static string StoreDirectory =>
            Path.Combine(AppSettings.UserDataFolder, "schedule_local");

        public static void Save(ProjectModel model)
        {
            if (!model.IsDatabaseProject)
                return;

            Save(model.DatabaseProfileId, model.DatabaseProjectId, model);
        }

        public static void Save(string profileId, int scheduleId, ProjectModel model)
        {
            if (string.IsNullOrWhiteSpace(profileId) || scheduleId <= 0)
                return;

            var directory = StoreDirectory;
            Directory.CreateDirectory(directory);

            var payload = new ScheduleLocalData
            {
                ProjectName = model.ProjectName,
                ProjectStart = model.ProjectStart,
                WorkingDays = model.WorkingWeek.ToDayFlags(),
                Settings = ProjectFile.ExportViewSettingsData(model.ViewSettings, includeWindowSettings: true)
            };

            string path = GetPath(profileId, scheduleId);
            string json = JsonSerializer.Serialize(payload, JsonOptions);
            File.WriteAllText(path, json, System.Text.Encoding.UTF8);
        }

        public static void Save(string profileId, int scheduleId, string projectName, ProjectViewSettings viewSettings)
        {
            if (string.IsNullOrWhiteSpace(profileId) || scheduleId <= 0)
                return;

            var directory = StoreDirectory;
            Directory.CreateDirectory(directory);

            var payload = new ScheduleLocalData
            {
                ProjectName = projectName,
                Settings = ProjectFile.ExportViewSettingsData(viewSettings, includeWindowSettings: true)
            };

            string path = GetPath(profileId, scheduleId);
            string json = JsonSerializer.Serialize(payload, JsonOptions);
            File.WriteAllText(path, json, System.Text.Encoding.UTF8);
        }

        public static bool TryLoad(string profileId, int scheduleId, out string? projectName, out ProjectViewSettings? viewSettings)
        {
            projectName = null;
            viewSettings = null;

            if (!TryLoad(profileId, scheduleId, out var data))
                return false;

            projectName = data!.ProjectName;
            viewSettings = ProjectFile.ImportViewSettingsData(data.Settings);
            return true;
        }

        public static void ApplyLocalOverlay(ProjectModel model)
        {
            if (!model.IsDatabaseProject)
                return;

            if (!TryLoad(model.DatabaseProfileId, model.DatabaseProjectId, out var data))
                return;

            if (!string.IsNullOrWhiteSpace(data!.ProjectName))
                model.ProjectName = data.ProjectName;

            if (data.ProjectStart.HasValue)
                model.ProjectStart = data.ProjectStart.Value.Date;

            if (data.WorkingDays is { Length: > 0 })
                model.SetWorkingWeek(WorkingWeekSchedule.FromDayFlags(data.WorkingDays));

            if (data.Settings != null)
                model.ViewSettings = ProjectFile.ImportViewSettingsData(data.Settings);
        }

        private static bool TryLoad(string profileId, int scheduleId, out ScheduleLocalData? data)
        {
            data = null;
            string path = GetPath(profileId, scheduleId);
            if (!File.Exists(path))
                return false;

            try
            {
                var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
                data = JsonSerializer.Deserialize<ScheduleLocalData>(json, JsonOptions);
                return data != null;
            }
            catch
            {
                return false;
            }
        }

        private static string GetPath(string profileId, int scheduleId) =>
            Path.Combine(StoreDirectory, $"{profileId}_{scheduleId}.json");

        private sealed class ScheduleLocalData
        {
            public string ProjectName { get; set; } = "";
            public DateTime? ProjectStart { get; set; }
            public bool[]? WorkingDays { get; set; }
            public ProjectFile.SettingsData? Settings { get; set; }
        }
    }
}
