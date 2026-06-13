using System.Text.Json;
using System.Text.Json.Serialization;

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

        private static ProjectFileData ToData(ProjectModel model)
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
                    AutoSchedule = t.AutoSchedule,
                    Deliverable = t.Deliverable,
                    IsCritical = t.IsCritical
                }).ToList(),
                Dependencies = model.Dependencies.Select(d => new DependencyData
                {
                    PredecessorId = d.PredecessorId,
                    SuccessorId = d.SuccessorId,
                    Type = d.Type.ToString(),
                    LagDays = d.LagDays
                }).ToList(),
                Assignments = model.Assignments.Select(a => new AssignmentData
                {
                    TaskId = a.TaskId,
                    ResourceName = a.ResourceName,
                    AllocationPercent = a.AllocationPercent
                }).ToList()
            };
        }

        private static ProjectModel FromData(ProjectFileData data, string path)
        {
            var model = new ProjectModel
            {
                ProjectName = data.ProjectName,
                ProjectStart = data.ProjectStart,
                FilePath = path,
                IsModified = false
            };

            model.Restore(
                data.Tasks,
                data.Dependencies,
                data.Assignments);

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
        }

        internal sealed class AssignmentData
        {
            public int TaskId { get; set; }
            public string ResourceName { get; set; } = "";
            public double AllocationPercent { get; set; } = 100;
        }
    }
}
