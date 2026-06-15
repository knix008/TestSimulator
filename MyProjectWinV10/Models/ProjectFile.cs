using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace MyProject.Models
{
    public static class ProjectFile
    {
        public const string Extension = "myprj";
        public const string FileFilter = $"MyProject Project (*.{Extension})|*.{Extension}|All Files (*.*)|*.*";

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        public static void Save(ProjectModel model, string path)
        {
            var data = ToData(model);
            var json = JsonSerializer.Serialize(data, JsonOptions);
            File.WriteAllText(path, json, System.Text.Encoding.UTF8);
        }

        public static ProjectModel Load(string path)
        {
            if (!File.Exists(path))
                throw new FileNotFoundException("Project file not found.", path);

            var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
            var data = JsonSerializer.Deserialize<ProjectFileData>(json, JsonOptions)
                ?? throw new InvalidDataException("Project file is empty or invalid.");

            if (data.Version != 1)
                throw new InvalidDataException($"Unsupported project file version: {data.Version}.");

            return FromData(data, path);
        }

        internal static string ToSnapshot(
            ProjectModel model,
            bool includeWindowSettings = true,
            bool includeViewSettings = true)
        {
            var data = ToData(model, includeWindowSettings, includeViewSettings);
            return JsonSerializer.Serialize(data, JsonOptions);
        }

        internal static string ToUndoSnapshot(ProjectModel model) =>
            ToSnapshot(model, includeWindowSettings: false, includeViewSettings: false);

        internal static ProjectModel FromSnapshot(string json, string? filePath = null)
        {
            var data = JsonSerializer.Deserialize<ProjectFileData>(json, JsonOptions)
                ?? throw new InvalidDataException("Snapshot is empty or invalid.");
            return FromData(data, filePath ?? "");
        }

        public static string TemplatePath =>
            Path.Combine(AppContext.BaseDirectory, "Template", "Template Project.myprj");

        public static void EnsureTemplateFile()
        {
            var path = TemplatePath;
            if (File.Exists(path)) return;

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            Save(ProjectModel.CreateTemplate(), path);
        }

        private static ProjectFileData ToData(
            ProjectModel model,
            bool includeWindowSettings = true,
            bool includeViewSettings = true)
        {
            return new ProjectFileData
            {
                ProjectName = model.ProjectName,
                ProjectStart = model.ProjectStart,
                Tasks = model.Tasks.Select(t => new TaskData
                {
                    Id = t.Id,
                    ParentId = t.ParentId,
                    Name = t.Name,
                    StartDate = t.StartDate,
                    DurationDays = t.DurationDays,
                    Progress = t.Progress,
                    TaskType = t.TaskType.ToString(),
                    IndentLevel = t.IndentLevel,
                    IsExpanded = t.IsExpanded,
                    AssignedTo = t.AssignedTo,
                    Notes = t.Notes,
                    BarColorArgb = t.BarColor.IsEmpty ? null : t.BarColor.ToArgb(),
                    ProgressColorArgb = t.ProgressColor.IsEmpty ? null : t.ProgressColor.ToArgb(),
                    BandColorArgb = t.BandColor.IsEmpty ? null : t.BandColor.ToArgb(),
                    AutoSchedule = t.AutoSchedule,
                    Deliverable = t.Deliverable,
                    IsCritical = t.IsCritical
                }).ToList(),
                Dependencies = model.Dependencies.Select(d => new DependencyData
                {
                    PredecessorId = d.PredecessorId,
                    SuccessorId = d.SuccessorId,
                    Type = d.Type.ToString(),
                    LagDays = d.LagDays,
                    StartLineEnd = d.StartLineEnd.ToString(),
                    EndLineEnd = d.EndLineEnd.ToString()
                }).ToList(),
                Assignments = model.Assignments.Select(a => new AssignmentData
                {
                    TaskId = a.TaskId,
                    ResourceName = a.ResourceName,
                    AllocationPercent = a.AllocationPercent
                }).ToList(),
                Notes = model.Notes.Select(n => new NoteData
                {
                    Id = n.Id,
                    Title = n.Title,
                    Body = n.Body,
                    BodyRtf = n.BodyRtf,
                    TaskId = n.TaskId,
                    OffsetDays = n.OffsetDays,
                    AnchorDate = n.AnchorDate,
                    ContentY = n.ContentY
                }).ToList(),
                Settings = includeViewSettings
                    ? ToSettingsData(model.ViewSettings, includeWindowSettings)
                    : null
            };
        }

        private static SettingsData ToSettingsData(ProjectViewSettings settings, bool includeWindowSettings = true)
        {
            var data = new SettingsData
            {
                TaskGridColumnWidths = settings.TaskGridColumnWidths,
                DefaultDependencyType = settings.DefaultDependencyType.ToString(),
                DefaultDependencyStartLineEnd = settings.DefaultDependencyStartLineEnd.ToString(),
                DefaultDependencyEndLineEnd = settings.DefaultDependencyEndLineEnd.ToString(),
                DayWidth = settings.DayWidth,
                SplitterDistance = settings.SplitterDistance,
                PropertiesPanelWidth = settings.PropertiesPanelWidth,
                PropertiesPanelVisible = settings.PropertiesPanelVisible,
                ShowCriticalPath = settings.ShowCriticalPath,
                NotesPanelHeight = settings.NotesPanelHeight,
                NotesPanelVisible = settings.NotesPanelVisible
            };

            if (includeWindowSettings)
            {
                data.WindowX = settings.WindowX;
                data.WindowY = settings.WindowY;
                data.WindowWidth = settings.WindowWidth;
                data.WindowHeight = settings.WindowHeight;
                data.WindowState = settings.WindowState.ToString();
            }

            return data;
        }

        private static ProjectViewSettings FromSettingsData(SettingsData? data)
        {
            if (data == null)
                return ProjectViewSettings.CreateDefault();

            var settings = ProjectViewSettings.CreateDefault();
            if (data.TaskGridColumnWidths is { Length: >= 7 })
                settings.TaskGridColumnWidths = ProjectViewSettings.SanitizeColumnWidths(data.TaskGridColumnWidths);

            if (Enum.TryParse<DependencyType>(data.DefaultDependencyType, out var depType))
                settings.DefaultDependencyType = depType;

            settings.DefaultDependencyStartLineEnd =
                DependencyLineEndInfo.Parse(data.DefaultDependencyStartLineEnd, DependencyLineEnd.None);
            settings.DefaultDependencyEndLineEnd =
                DependencyLineEndInfo.Parse(data.DefaultDependencyEndLineEnd, DependencyLineEnd.Arrow);

            if (data.DayWidth is >= 4 and <= 120)
                settings.DayWidth = data.DayWidth;

            if (data.SplitterDistance is >= 200 and <= 2000)
                settings.SplitterDistance = data.SplitterDistance;

            if (data.PropertiesPanelWidth is >= 180 and <= 600)
                settings.PropertiesPanelWidth = data.PropertiesPanelWidth;
            else if (data.NotesPanelHeight is >= 80 and <= 400)
                settings.PropertiesPanelWidth = data.NotesPanelHeight;

            settings.PropertiesPanelVisible = data.PropertiesPanelVisible ?? data.NotesPanelVisible;
            settings.ShowCriticalPath = data.ShowCriticalPath;

            if (data.NotesPanelHeight is >= 80 and <= 400)
                settings.NotesPanelHeight = data.NotesPanelHeight;

            settings.NotesPanelVisible = data.NotesPanelVisible;

            if (data.WindowWidth is int savedWidth and >= 800 and <= 10000)
                settings.WindowWidth = savedWidth;
            if (data.WindowHeight is int savedHeight and >= 500 and <= 10000)
                settings.WindowHeight = savedHeight;
            if (data.WindowX is >= -10000 and <= 10000)
                settings.WindowX = data.WindowX;
            if (data.WindowY is >= -10000 and <= 10000)
                settings.WindowY = data.WindowY;
            if (Enum.TryParse<FormWindowState>(data.WindowState, out var windowState)
                && windowState is FormWindowState.Normal or FormWindowState.Maximized)
                settings.WindowState = windowState;

            return settings;
        }

        private static ProjectModel FromData(ProjectFileData data, string path)
        {
            var model = new ProjectModel
            {
                ProjectName = data.ProjectName,
                ProjectStart = data.ProjectStart,
                ViewSettings = FromSettingsData(data.Settings),
                FilePath = path,
                IsModified = false
            };

            model.Restore(
                data.Tasks,
                data.Dependencies,
                data.Assignments,
                data.Notes);

            return model;
        }

        private sealed class ProjectFileData
        {
            public int Version { get; set; } = 1;
            public string ProjectName { get; set; } = "New Project";
            public DateTime ProjectStart { get; set; } = DateTime.Today;
            public List<TaskData> Tasks { get; set; } = new();
            public List<DependencyData> Dependencies { get; set; } = new();
            public List<AssignmentData> Assignments { get; set; } = new();
            public List<NoteData> Notes { get; set; } = new();
            public SettingsData? Settings { get; set; }
        }

        private sealed class SettingsData
        {
            public int[]? TaskGridColumnWidths { get; set; }
            public string DefaultDependencyType { get; set; } = "FS";
            public string? DefaultDependencyStartLineEnd { get; set; }
            public string? DefaultDependencyEndLineEnd { get; set; }
            public int DayWidth { get; set; } = 22;
            public int SplitterDistance { get; set; } = 560;
            public int PropertiesPanelWidth { get; set; } = 300;
            public bool? PropertiesPanelVisible { get; set; }
            public bool ShowCriticalPath { get; set; }
            public int NotesPanelHeight { get; set; } = 140;
            public bool NotesPanelVisible { get; set; } = true;
            public int? WindowX { get; set; }
            public int? WindowY { get; set; }
            public int? WindowWidth { get; set; }
            public int? WindowHeight { get; set; }
            public string? WindowState { get; set; }
        }

        internal sealed class TaskData
        {
            public int Id { get; set; }
            public int ParentId { get; set; } = -1;
            public string Name { get; set; } = "New Task";
            public DateTime StartDate { get; set; }
            public int DurationDays { get; set; } = 5;
            public double Progress { get; set; }
            public string TaskType { get; set; } = "Normal";
            public int IndentLevel { get; set; }
            public bool IsExpanded { get; set; } = true;
            public string AssignedTo { get; set; } = "";
            public string Notes { get; set; } = "";
            public int? BarColorArgb { get; set; }
            public int? ProgressColorArgb { get; set; }
            public int? BandColorArgb { get; set; }
            public bool AutoSchedule { get; set; } = true;
            public string Deliverable { get; set; } = "";
            public bool IsCritical { get; set; }
        }

        internal sealed class DependencyData
        {
            public int PredecessorId { get; set; }
            public int SuccessorId { get; set; }
            public string Type { get; set; } = "FS";
            public int LagDays { get; set; }
            public string? StartLineEnd { get; set; }
            public string? EndLineEnd { get; set; }
        }

        internal sealed class AssignmentData
        {
            public int TaskId { get; set; }
            public string ResourceName { get; set; } = "";
            public double AllocationPercent { get; set; } = 100;
        }

        internal sealed class NoteData
        {
            public int Id { get; set; }
            public string Title { get; set; } = "New Note";
            public string Body { get; set; } = "";
            public string BodyRtf { get; set; } = "";
            public int TaskId { get; set; } = -1;
            public int OffsetDays { get; set; }
            public DateTime AnchorDate { get; set; }
            public int ContentY { get; set; }
        }
    }
}
